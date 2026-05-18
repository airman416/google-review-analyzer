import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFallbackDeepAnalysis,
  buildDeepAnalysisPrompt,
  calculateRevenueAssessment,
  ensureReviewsIncludeText,
  filterReviewsWithText,
  isGrowthMode,
  normalizeDeepAnalysis,
  parseDeepAnalysisJson,
  buildAiReviewReply,
  calculateReviewSentiment,
  selectAiReviewAmplifierReview,
  selectAiWinBackReview,
} from "./reviewAnalysis";

test("calculateRevenueAssessment does not invent negative reviews", () => {
  const assessment = calculateRevenueAssessment([], 45);

  assert.equal(assessment.negativeReviewCount, 0);
  assert.equal(assessment.totalLostClv, 0);
  assert.equal(assessment.confidence, "low");
  assert.match(assessment.narrative, /strong review profile/i);
});

test("buildFallbackDeepAnalysis returns useful Owner.com guidance", () => {
  const analysis = buildFallbackDeepAnalysis({
    restaurantName: "Lilly's Gourmet Pasta Express",
    currentRating: 4.2,
    reviewCount: 120,
    topComplaint: "Service Speed",
    negativeReviewCount: 3,
    competitorAverage: 4.6,
    competitorName: "best nearby restaurants",
    revenueAssessment: calculateRevenueAssessment(
      [
        { rating: 2, text: "Waited forever for pickup and nobody helped us." },
        { rating: 3, text: "Food was good but the service felt slow." },
        { rating: 1, text: "They forgot our order." },
      ],
      45
    ),
  });

  assert.ok(analysis.executive_summary.includes("Lilly's Gourmet Pasta Express"));
  assert.ok(analysis.issue_clusters.length >= 3);
  assert.ok(analysis.free_action_plan.length >= 3);
  assert.ok(
    analysis.owner_solution_map.some((item) =>
      item.owner_solution.toLowerCase().includes("owner.com")
    )
  );
  assert.match(analysis.response_quality_audit.improved_response, /owner/i);
  assert.match(analysis.owner_pitch.dream_outcome, /website or app/i);
});

test("buildFallbackDeepAnalysis explains specific Owner.com features in plain language", () => {
  const analysis = buildFallbackDeepAnalysis({
    restaurantName: "Lilly's Gourmet Pasta Express",
    currentRating: 4.2,
    reviewCount: 120,
    topComplaint: "Service Speed",
    negativeReviewCount: 3,
    competitorAverage: 4.6,
    competitorName: "best nearby restaurants",
    revenueAssessment: calculateRevenueAssessment(
      [
        { rating: 2, text: "Waited forever for pickup and nobody helped us." },
        { rating: 3, text: "Food was good but the service felt slow." },
      ],
      45
    ),
  });
  const ownerCopy = [
    ...analysis.owner_solution_map.flatMap((item) => [
      item.problem,
      item.owner_solution,
      item.dream_outcome,
    ]),
    analysis.owner_pitch.dream_outcome,
    analysis.owner_pitch.call_to_action,
  ].join(" ");

  assert.match(ownerCopy, /online ordering/i);
  assert.match(ownerCopy, /branded app/i);
  assert.match(ownerCopy, /email\/SMS/i);
  assert.match(ownerCopy, /Google reviews/i);
  assert.match(ownerCopy, /customer list/i);
  assert.doesNotMatch(ownerCopy, /retention marketing|owned customer data|local growth levers/i);
});

test("normalizeDeepAnalysis fills missing required sections", () => {
  const fallback = buildFallbackDeepAnalysis({
    restaurantName: "Test Cafe",
    currentRating: 4.1,
    reviewCount: 40,
    topComplaint: "Wait Time",
    negativeReviewCount: 2,
    competitorAverage: 4.5,
    competitorName: "nearby competitors",
    revenueAssessment: calculateRevenueAssessment(
      [{ rating: 2, text: "Slow service" }],
      45
    ),
  });

  const normalized = normalizeDeepAnalysis(
    {
      executive_summary: "Custom summary",
      issue_clusters: [],
      owner_solution_map: [],
    },
    fallback
  );

  assert.equal(normalized.executive_summary, "Custom summary");
  assert.deepEqual(normalized.issue_clusters, fallback.issue_clusters);
  assert.deepEqual(normalized.owner_solution_map, fallback.owner_solution_map);
  assert.ok(normalized.confidence_notes.length > 0);
});

test("buildDeepAnalysisPrompt asks for evidence and Owner.com mapping", () => {
  const prompt = buildDeepAnalysisPrompt({
    restaurantName: "Test Cafe",
    currentRating: 4.1,
    reviewCount: 80,
    competitorAverage: 4.5,
    competitorName: "nearby restaurants",
    topComplaint: "Wait Time",
    negativeReviewCount: 1,
    reviews: [{ rating: 2, text: "Slow service and no one apologized." }],
    revenueAssessment: calculateRevenueAssessment(
      [{ rating: 2, text: "Slow service and no one apologized." }],
      45
    ),
  });

  assert.match(prompt, /issue_clusters/);
  assert.match(prompt, /representative quotes/i);
  assert.match(prompt, /response_quality_audit/);
  assert.match(prompt, /Owner\.com/);
  assert.match(prompt, /Return ONLY valid JSON/i);
});

test("growth mode avoids bad-review framing for strong restaurants", () => {
  const revenueAssessment = calculateRevenueAssessment(
    [{ rating: 5, text: "Amazing pasta and friendly staff." }],
    45
  );
  const analysis = buildFallbackDeepAnalysis({
    restaurantName: "Lilly's Gourmet Pasta Express",
    currentRating: 4.8,
    reviewCount: 1156,
    topComplaint: "No major complaints found",
    negativeReviewCount: 0,
    competitorAverage: 5,
    competitorName: "highest-rated local restaurants",
    revenueAssessment,
  });
  const prompt = buildDeepAnalysisPrompt({
    restaurantName: "Lilly's Gourmet Pasta Express",
    currentRating: 4.8,
    reviewCount: 1156,
    topComplaint: "No major complaints found",
    negativeReviewCount: 0,
    competitorAverage: 5,
    competitorName: "highest-rated local restaurants",
    revenueAssessment,
    reviews: [{ rating: 5, text: "Amazing pasta and friendly staff." }],
  });

  assert.match(analysis.executive_summary, /next level/i);
  assert.doesNotMatch(analysis.executive_summary, /bad reviews|lost value/i);
  assert.match(analysis.owner_pitch.call_to_action, /direct orders/i);
  assert.match(prompt, /GROWTH MODE/i);
  assert.match(prompt, /do NOT frame/i);
});

test("growth mode allows a small number of low-star reviews for strong restaurants", () => {
  assert.equal(
    isGrowthMode({
      currentRating: 4.8,
      negativeReviewCount: 3,
      analyzedReviewCount: 50,
    }),
    true
  );
  assert.equal(
    isGrowthMode({
      currentRating: 4.3,
      negativeReviewCount: 3,
      analyzedReviewCount: 50,
    }),
    false
  );
  assert.equal(
    isGrowthMode({
      currentRating: 4.8,
      negativeReviewCount: 8,
      analyzedReviewCount: 50,
    }),
    false
  );
});

test("parseDeepAnalysisJson tolerates raw control characters from LLM output", () => {
  const parsed = parseDeepAnalysisJson(
    '{"executive_summary":"Useful audit\u0003 with bad control char","critical_findings":["A"]}'
  );

  assert.equal(parsed.executive_summary, "Useful audit with bad control char");
  assert.deepEqual(parsed.critical_findings, ["A"]);
});

test("ensureReviewsIncludeText retries once when reviews have no real text", async () => {
  let attempts = 0;
  const reviews = await ensureReviewsIncludeText(
    [{ rating: 3, text: "   " }],
    async () => {
      attempts += 1;
      return [
        { rating: 3, text: "   " },
        { rating: 2, text: "Waited a long time before anyone helped us." },
      ];
    }
  );

  assert.equal(attempts, 1);
  assert.equal(reviews[1].text, "Waited a long time before anyone helped us.");
});

test("selectAiWinBackReview ignores placeholder reviews without real text", () => {
  const selected = selectAiWinBackReview([
    { author: "No Text", rating: 3, text: "No text provided." },
    { author: "Blank", rating: 2, text: " " },
  ]);

  assert.equal(selected, undefined);
});

test("selectAiWinBackReview does not treat positive reviews as recovery targets", () => {
  const selected = selectAiWinBackReview([
    { author: "Toby", rating: 5, text: "Always love visiting. Great patience and homemade flavors." },
    { author: "Sam", rating: 4, text: "Good food and friendly staff." },
  ]);

  assert.equal(selected, undefined);
});

test("selectAiReviewAmplifierReview chooses a positive review with real text", () => {
  const selected = selectAiReviewAmplifierReview([
    { author: "No Text", rating: 5, text: "No text provided." },
    { author: "Toby", rating: 5, text: "Always love visiting. Great patience and homemade flavors." },
    { author: "Sam", rating: 4, text: "Good food and friendly staff." },
  ]);

  assert.equal(selected?.author, "Toby");
});

test("buildAiReviewReply writes concise positive replies", () => {
  const reply = buildAiReviewReply({
    author: "Toby",
    rating: 5,
    text: "Always love visiting. Great patience and homemade flavors.",
  });

  assert.ok(reply.length <= 165);
  assert.doesNotMatch(reply, /\.\.\./);
  assert.match(reply, /Thank you/i);
  assert.doesNotMatch(reply, /sorry|make this right/i);
});

test("calculateReviewSentiment uses review evidence instead of only the overall rating", () => {
  const sentiment = calculateReviewSentiment([
    { rating: 5, text: "Homemade flavors were delicious and the ice cream was fresh." },
    { rating: 2, text: "The server was rude and the wait was slow." },
    { rating: 4, text: "Cute place with a friendly vibe." },
  ]);

  assert.equal(sentiment.topComplaint, "Customer Service");
  assert.ok(sentiment.breakdown.food > sentiment.breakdown.service);
  assert.ok(sentiment.breakdown.atmosphere >= 4);
});

test("filterReviewsWithText removes placeholder reviews", () => {
  const reviews = filterReviewsWithText([
    { author: "No Text", rating: 3, text: "No text provided." },
    { author: "No Period", rating: 4, text: "no text provided" },
    { author: "Blank", rating: 5, text: "   " },
    { author: "Real", rating: 2, text: "Waited 45 minutes for pickup." },
  ]);

  assert.deepEqual(reviews, [
    { author: "Real", rating: 2, text: "Waited 45 minutes for pickup." },
  ]);
});
