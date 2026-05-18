import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFallbackDeepAnalysis,
  buildDeepAnalysisPrompt,
  calculateRevenueAssessment,
  isGrowthMode,
  normalizeDeepAnalysis,
  parseDeepAnalysisJson,
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
  assert.match(analysis.owner_pitch.dream_outcome, /happy guest/i);
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
  assert.match(analysis.owner_pitch.call_to_action, /next level/i);
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
