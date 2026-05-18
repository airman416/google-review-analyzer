export type ConfidenceLevel = "low" | "medium" | "high";

export interface ReviewInput {
  author?: string;
  rating: number;
  text: string;
  date?: string;
}

export interface RevenueAssessment {
  negativeReviewCount: number;
  lostCustomersPerReview: number;
  averageTicket: number;
  estimatedLostCustomers: number;
  totalLostClv: number;
  confidence: ConfidenceLevel;
  assumptions: string[];
  narrative: string;
}

export interface IssueCluster {
  theme: string;
  label: string;
  severity: number;
  mention_count: number;
  evidence: string[];
  business_impact: string;
  likely_root_cause: string;
}

export interface DeepAnalysis {
  executive_summary: string;
  critical_findings: string[];
  issue_clusters: IssueCluster[];
  review_evidence: Array<{
    issue: string;
    quote: string;
    rating?: number;
    takeaway: string;
  }>;
  root_causes: Array<{
    issue: string;
    hypothesis: string;
    why_it_matters: string;
  }>;
  response_quality_audit: {
    summary: string;
    improved_response: string;
    recovery_offer: string;
  };
  revenue_assessment: {
    confidence: ConfidenceLevel;
    narrative: string;
    assumptions: string[];
  };
  growth_opportunities: Array<{
    area: string;
    opportunity: string;
    why_now: string;
  }>;
  free_action_plan: Array<{
    timeframe: string;
    action: string;
    effort: "low" | "medium" | "high";
    expected_impact: string;
    metric_to_watch: string;
  }>;
  owner_solution_map: Array<{
    problem: string;
    owner_solution: string;
    dream_outcome: string;
  }>;
  owner_pitch: {
    headline: string;
    dream_outcome: string;
    call_to_action: string;
  };
  confidence_notes: string[];
}

export interface GrowthModeInput {
  currentRating?: number;
  negativeReviewCount: number;
  analyzedReviewCount?: number;
}

interface FallbackInput {
  restaurantName: string;
  currentRating: number;
  reviewCount: number;
  topComplaint: string;
  negativeReviewCount: number;
  analyzedReviewCount?: number;
  competitorAverage: number;
  competitorName: string;
  revenueAssessment: RevenueAssessment;
}

interface PromptInput extends FallbackInput {
  reviews: ReviewInput[];
}

interface ReviewTextCandidate {
  text?: string | null;
}

export interface AiWinBackReviewCandidate {
  author: string;
  rating: number;
  text: string;
}

export interface SentimentBreakdown {
  food: number;
  service: number;
  atmosphere: number;
}

export interface ReviewSentiment {
  topComplaint: string;
  breakdown: SentimentBreakdown;
}

export function hasRealReviewText(review: ReviewTextCandidate): boolean {
  const text = review.text?.trim();
  return Boolean(text && !/^no text provided\.?$/i.test(text));
}

export function filterReviewsWithText<T extends ReviewTextCandidate>(reviews: T[]): T[] {
  return reviews.filter(hasRealReviewText);
}

export async function ensureReviewsIncludeText<T extends ReviewTextCandidate>(
  reviews: T[],
  loadMoreReviews: () => Promise<T[]>
): Promise<T[]> {
  if (reviews.some(hasRealReviewText)) {
    return reviews;
  }

  const retriedReviews = await loadMoreReviews();
  return retriedReviews.length > 0 ? retriedReviews : reviews;
}

export function selectAiWinBackReview<T extends AiWinBackReviewCandidate>(
  reviews: T[]
): T | undefined {
  const reviewsWithText = reviews.filter(hasRealReviewText);
  return reviewsWithText.find((review) => review.rating <= 3);
}

export function selectAiReviewAmplifierReview<T extends AiWinBackReviewCandidate>(
  reviews: T[]
): T | undefined {
  const positiveReviews = reviews.filter(
    (review) => review.rating >= 4 && hasRealReviewText(review)
  );

  return positiveReviews.find((review) => review.rating >= 5) || positiveReviews[0];
}

export function buildAiReviewReply(review: AiWinBackReviewCandidate): string {
  const name = review.author.split(/\s+/)[0] || "there";

  if (review.rating >= 4) {
    return `Hi ${name}, thank you for the kind words. We love hearing what stood out and are grateful you chose us. We hope to welcome you back soon.`;
  }

  return `Hi ${name}, I am sorry we missed the mark. Thank you for the feedback; we would like to learn more and make your next visit better.`;
}

export function shouldUseAiRecoveryResponse(
  review: AiWinBackReviewCandidate,
  response: string
): boolean {
  if (review.rating > 3 || !hasMeaningfulText(response)) return false;

  const normalizedResponse = response.toLowerCase();
  const firstName = review.author.split(/\s+/)[0]?.toLowerCase();
  const greetingName = normalizedResponse.match(/^hi\s+([a-z'-]+)/)?.[1];
  if (firstName && greetingName && greetingName !== firstName) return false;

  const hasRecoveryLanguage = matchesAny(normalizedResponse, [
    "sorry",
    "apolog",
    "missed the mark",
    "make this right",
    "not our standard",
    "not the standard",
    "not the quality",
    "letting us know",
  ]);
  const hasAmplifierLanguage = matchesAny(normalizedResponse, [
    "thank you for the kind words",
    "thrilled you enjoyed",
    "we're thrilled",
    "we are thrilled",
    "fantastic to hear",
    "love hearing what stood out",
  ]);

  return hasRecoveryLanguage && !hasAmplifierLanguage;
}

export function calculateReviewSentiment(reviews: ReviewInput[]): ReviewSentiment {
  const reviewsWithText = reviews.filter(hasRealReviewText);
  const foodRatings: number[] = [];
  const serviceRatings: number[] = [];
  const atmosphereRatings: number[] = [];

  for (const review of reviewsWithText) {
    const text = review.text.toLowerCase();
    if (matchesAny(text, ["food", "flavor", "flavors", "delicious", "fresh", "homemade", "taste", "meal", "ice cream"])) {
      foodRatings.push(review.rating);
    }
    if (matchesAny(text, ["service", "server", "staff", "rude", "friendly", "wait", "slow", "patience", "helped"])) {
      serviceRatings.push(review.rating);
    }
    if (matchesAny(text, ["vibe", "atmosphere", "place", "clean", "dirty", "cute", "ambience", "environment"])) {
      atmosphereRatings.push(review.rating);
    }
  }

  return {
    topComplaint: detectTopComplaint(reviewsWithText),
    breakdown: {
      food: averageRating(foodRatings, reviewsWithText),
      service: averageRating(serviceRatings, reviewsWithText),
      atmosphere: averageRating(atmosphereRatings, reviewsWithText),
    },
  };
}

export function isGrowthMode(input: GrowthModeInput): boolean {
  const currentRating = input.currentRating ?? 0;
  const analyzedReviewCount = Math.max(input.analyzedReviewCount ?? 0, input.negativeReviewCount);
  const lowStarShare =
    analyzedReviewCount > 0 ? input.negativeReviewCount / analyzedReviewCount : 0;

  return (
    currentRating >= 4.5 &&
    input.negativeReviewCount <= 3 &&
    lowStarShare <= 0.08
  );
}

export function buildDeepAnalysisPrompt(input: PromptInput): string {
  const growthMode = isGrowthMode({
    currentRating: input.currentRating,
    negativeReviewCount: input.negativeReviewCount,
    analyzedReviewCount: input.reviews.length,
  });
  const reviewPayload = input.reviews.slice(0, 50).map((review) => ({
    rating: review.rating,
    text: review.text,
    date: review.date,
    author: review.author,
  }));

  return `You are a senior restaurant growth consultant and Owner.com sales strategist.

Analyze this restaurant's public review profile and produce a deep, useful audit for the owner.

Restaurant context:
${JSON.stringify(
  {
    restaurant_name: input.restaurantName,
    current_rating: input.currentRating,
    review_count: input.reviewCount,
    competitor_average: input.competitorAverage,
    competitor_names: input.competitorName,
    detected_top_complaint: input.topComplaint,
    negative_review_count: input.negativeReviewCount,
    revenue_assessment: input.revenueAssessment,
  },
  null,
  2
)}

Recent reviews:
${JSON.stringify(reviewPayload, null, 2)}

Do much more than summarize sentiment. Give the owner free value:
- Diagnose the real business opportunity behind the reviews.
- If framing mode is GROWTH MODE, do NOT frame the restaurant as having bad reviews, lost value, or reputation damage. Treat it as a strong performer ready for the next level with Owner.com.
- Group opportunities into issue_clusters with severity, mention count, representative quotes, business impact, and likely root cause.
- Include direct evidence from review language wherever possible.
- Infer affected customer segments when the review text supports it.
- Explain how these opportunities can create more revenue through stronger Google conversion, more repeat visits, direct ordering, local SEO, and customer retention.
- Audit review response quality. In GROWTH MODE, write a warm response to the most constructive positive or mixed-positive review instead of inventing an unhappy customer.
- Create a prioritized action plan with quick wins, 30-day moves, and system-level fixes.
- Map each opportunity to a specific Owner.com feature: online ordering, branded app, email/SMS campaigns, Google review help, customer list building, SEO pages, reporting, or order-source analytics.
- Write the Owner.com section for a busy restaurant owner. Use plain language like "get more orders from your own website," "bring regulars back," and "see where orders came from." Avoid jargon such as "retention marketing," "owned customer data," or "growth levers."
- Sell the dream of the restaurant having more direct orders, more repeat customers, more 5-star proof, and less dependence on third-party marketplaces.
- Be persuasive but credible. Do not invent exact facts that are not in the reviews. Mark estimates as directional.

Keep copy concise and presentation-ready:
- executive_summary: maximum 35 words, 1-2 punchy sentences.
- critical_findings: maximum 3 items, each under 10 words.
- issue cluster labels: maximum 5 words.
- business_impact, likely_root_cause, takeaways, opportunities, and actions: one short sentence each.
- Avoid long paragraphs, repeated context, and overexplaining obvious implications.
- Never end fields with "..." or an ellipsis; return complete phrases only.

Current framing mode: ${growthMode ? "GROWTH MODE: excellent reviews with only light low-star noise, sell the next level" : "RECOVERY MODE: visible issues to fix plus growth upside"}.

Return ONLY valid JSON with this exact shape:
{
  "executive_summary": "string",
  "critical_findings": ["string"],
  "issue_clusters": [
    {
      "theme": "wait_time | service_recovery | food_consistency | pricing_value | delivery_takeout | ambience | ordering_friction | review_conversion | owned_customer_growth",
      "label": "string",
      "severity": 1,
      "mention_count": 1,
      "evidence": ["representative quotes or review-language snippets"],
      "business_impact": "string",
      "likely_root_cause": "string"
    }
  ],
  "review_evidence": [
    {
      "issue": "string",
      "quote": "string",
      "rating": 1,
      "takeaway": "string"
    }
  ],
  "root_causes": [
    {
      "issue": "string",
      "hypothesis": "string",
      "why_it_matters": "string"
    }
  ],
  "response_quality_audit": {
    "summary": "string",
    "improved_response": "empathetic owner response that is specific, human, and recovery-oriented",
    "recovery_offer": "string"
  },
  "revenue_assessment": {
    "confidence": "low | medium | high",
    "narrative": "string",
    "assumptions": ["string"]
  },
  "growth_opportunities": [
    {
      "area": "string",
      "opportunity": "string",
      "why_now": "string"
    }
  ],
  "free_action_plan": [
    {
      "timeframe": "Today | This week | Next 30 days | This quarter",
      "action": "string",
      "effort": "low | medium | high",
      "expected_impact": "string",
      "metric_to_watch": "string"
    }
  ],
  "owner_solution_map": [
    {
      "problem": "string",
      "owner_solution": "Name the specific Owner.com feature and explain it in plain language",
      "dream_outcome": "string"
    }
  ],
  "owner_pitch": {
    "headline": "string",
    "dream_outcome": "string",
    "call_to_action": "string"
  },
  "confidence_notes": ["string"]
}`;
}

export function parseDeepAnalysisJson(content: string): Partial<DeepAnalysis> {
  const cleaned = content
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, (char) =>
      char === "\n" || char === "\r" || char === "\t" ? char : ""
    )
    .trim();

  return JSON.parse(cleaned) as Partial<DeepAnalysis>;
}

export function calculateRevenueAssessment(
  reviews: ReviewInput[],
  averageTicket = 45
): RevenueAssessment {
  const negativeReviewCount = reviews.filter((review) => review.rating <= 3).length;
  const lostCustomersPerReview = 30;
  const estimatedLostCustomers = negativeReviewCount * lostCustomersPerReview;
  const totalLostClv = estimatedLostCustomers * averageTicket;
  const confidence: ConfidenceLevel =
    reviews.length >= 25 ? "high" : reviews.length >= 8 ? "medium" : "low";

  return {
    negativeReviewCount,
    lostCustomersPerReview,
    averageTicket,
    estimatedLostCustomers,
    totalLostClv,
    confidence,
    assumptions: [
      "Only reviews available to the scraper are included in this estimate.",
      "The model uses 30 influenced customers per negative review as a directional benchmark.",
      `Average ticket is estimated at $${averageTicket}; actual customer lifetime value may be higher for repeat guests.`,
    ],
    narrative:
      negativeReviewCount === 0
        ? "The scraped sample shows a strong review profile. The next upside is turning happy guests into more direct orders, repeat visits, and fresh 5-star proof."
        : `${negativeReviewCount} negative review${negativeReviewCount === 1 ? "" : "s"} could influence roughly ${estimatedLostCustomers} nearby diners before they ever visit. At a $${averageTicket} ticket, that is about $${totalLostClv.toLocaleString()} in directional annualized risk.`,
  };
}

export function buildFallbackDeepAnalysis(input: FallbackInput): DeepAnalysis {
  const {
    restaurantName,
    currentRating,
    reviewCount,
    topComplaint,
    negativeReviewCount,
    analyzedReviewCount,
    competitorAverage,
    competitorName,
    revenueAssessment,
  } = input;
  const growthMode = isGrowthMode({
    currentRating,
    negativeReviewCount,
    analyzedReviewCount,
  });

  const primaryIssue =
    !growthMode && topComplaint && topComplaint !== "No major complaints found"
      ? topComplaint
      : "Next-Level Growth";

  return {
    executive_summary:
      !growthMode
        ? `${restaurantName} has enough demand signals to win locally, but ${primaryIssue.toLowerCase()} is creating hesitation at the exact moment guests compare you against ${competitorName}. The opportunity is to fix the visible friction, recover unhappy guests, and turn more satisfied customers into public proof.`
        : `${restaurantName} is already winning in the reviews. The next level is turning that goodwill into more direct orders, more repeat visits, and a customer list the restaurant owns.`,
    critical_findings: [
      `${reviewCount || "Your"} public reviews are doing sales work before guests ever reach your menu.`,
      `Your ${currentRating.toFixed(1)} rating is being compared against a local benchmark around ${competitorAverage.toFixed(1)}.`,
      !growthMode
        ? `${negativeReviewCount} negative review${negativeReviewCount === 1 ? "" : "s"} in the sample give competitors an opening.`
        : "The review profile is strong; now the opportunity is converting happy guests into owned growth.",
    ],
    issue_clusters: [
      {
        theme: "service_recovery",
        label: primaryIssue,
        severity: growthMode ? 2 : 4,
        mention_count: Math.max(negativeReviewCount, 1),
        evidence:
          !growthMode
            ? ["Recent low-star reviews suggest guests need faster acknowledgement and recovery."]
            : ["Positive review momentum can become a direct-order growth engine."],
        business_impact:
          !growthMode
            ? "Guests who see unresolved friction often choose the safer-looking competitor, even when the food is strong."
            : "Strong reviews are already creating trust; Owner.com can convert that trust into direct orders and repeat visits.",
        likely_root_cause:
          !growthMode
            ? "The restaurant needs a repeatable system for detecting unhappy guests and turning good visits into public reviews."
            : "The restaurant needs a repeatable system for capturing happy guests and bringing them back directly.",
      },
      {
        theme: "review_conversion",
        label: "Not Enough Fresh Proof",
        severity: 4,
        mention_count: Math.max(Math.ceil(reviewCount * 0.05), 1),
        evidence: ["Most happy guests leave silently unless the business asks at the right moment."],
        business_impact:
          "A thin stream of recent reviews makes competitors with fresher praise look less risky.",
        likely_root_cause:
          "Review requests are likely manual, inconsistent, or disconnected from ordering and guest follow-up.",
      },
      {
        theme: "owned_customer_growth",
        label: "Weak Direct Relationship",
        severity: 4,
        mention_count: Math.max(Math.ceil(reviewCount * 0.03), 1),
        evidence: ["Review data alone cannot bring guests back without a direct customer channel."],
        business_impact:
          "If orders and guest data live on third-party platforms, the restaurant pays to reacquire customers it already earned.",
        likely_root_cause:
          "The business needs an owned ordering, marketing, and guest recovery loop.",
      },
    ],
    review_evidence: [
      {
        issue: primaryIssue,
        quote:
          !growthMode
            ? "Recent negative review language points to a guest experience gap that needs a visible fix."
            : "Happy guests are already saying the restaurant is worth choosing.",
        takeaway:
          !growthMode
            ? "The report should treat this as a recovery and reputation issue."
            : "The report should focus on amplifying happy customers and increasing direct conversion.",
      },
    ],
    root_causes: [
      {
        issue: primaryIssue,
        hypothesis:
          !growthMode
            ? "The restaurant likely has no consistent operating loop for spotting friction, responding quickly, and proving the fix publicly."
            : "The restaurant likely has more happy guests than it is currently capturing in an owned growth loop.",
        why_it_matters:
          !growthMode
            ? "One visible unresolved problem can outweigh several quiet positive experiences during a high-intent Google search."
            : "Every happy guest who orders through third parties or leaves without a follow-up path is growth the restaurant does not fully own.",
      },
      {
        issue: "Customer ownership",
        hypothesis:
          "Guest relationships may be scattered across Google, delivery marketplaces, and walk-in traffic instead of owned by the restaurant.",
        why_it_matters:
          "Without a customer database, every slow week starts from scratch.",
      },
    ],
    response_quality_audit: {
      summary:
        !growthMode
          ? "Generic review replies make the business look passive. The owner should acknowledge the specific concern, explain the fix, and invite the guest into a direct recovery path."
          : "Positive reviews are an asset. The owner should reply in a way that reinforces the signature experience and nudges future guests toward ordering direct.",
      improved_response:
        !growthMode
          ? "Hi, this is the owner. I am sorry we missed the mark on your visit, especially around the experience you described. That is not the standard we want guests to remember us for. I would appreciate the chance to make this right personally and learn exactly what happened so we can fix it for the next guest."
          : "Thank you for the kind words. We are grateful you chose us and love hearing what stood out. Next time, order directly from us so we can make the experience even smoother and keep bringing you the food you already love.",
      recovery_offer:
        !growthMode
          ? "Invite the guest to contact the restaurant directly and offer a specific make-good, such as replacing the order or hosting them again."
          : "Invite the guest back through the restaurant's direct ordering channel and make the next visit feel personal.",
    },
    revenue_assessment: {
      confidence: revenueAssessment.confidence,
      narrative: revenueAssessment.narrative,
      assumptions: revenueAssessment.assumptions,
    },
    growth_opportunities: [
      {
        area: "Review generation",
        opportunity:
          "Ask happy guests for reviews automatically while the experience is still fresh.",
        why_now:
          "Recent positive reviews are one of the fastest ways to make the restaurant look safer than nearby competitors.",
      },
      {
        area: "Direct ordering",
        opportunity:
          "Move repeat guests toward direct ordering so each order builds the restaurant's own customer list.",
        why_now:
          "Owned orders create margin and remarketing opportunities that marketplaces do not.",
      },
      {
        area: "Guest recovery",
        opportunity:
          !growthMode
            ? "Create a simple recovery flow for unhappy guests before one bad visit becomes a permanent public objection."
            : "Create a simple reactivation flow so happy guests have a reason to come back directly.",
        why_now:
          !growthMode
            ? "Fast, human recovery can turn a visible complaint into proof that the owner cares."
            : "The strongest review profiles become even more valuable when they feed owned retention.",
      },
    ],
    free_action_plan: [
      {
        timeframe: "Today",
        action:
          !growthMode
            ? "Reply to the most recent negative or mixed reviews with specific ownership, not generic apology language."
            : "Reply to recent positive reviews and mention the direct ordering path.",
        effort: "low",
        expected_impact:
          !growthMode
            ? "Reduces perceived risk for future guests reading the profile."
            : "Turns praise into a conversion path for future guests.",
        metric_to_watch: growthMode ? "Direct-order clicks" : "Review reply rate",
      },
      {
        timeframe: "This week",
        action:
          "Create a simple staff script that asks clearly happy guests to leave a Google review before they leave or after pickup.",
        effort: "medium",
        expected_impact: "Increases fresh 5-star review velocity.",
        metric_to_watch: "New positive reviews per week",
      },
      {
        timeframe: "Next 30 days",
        action:
          "Build an owned follow-up channel for online orders so first-time buyers can be brought back without paying marketplaces again.",
        effort: "medium",
        expected_impact: "Turns one-time transactions into repeat direct customers.",
        metric_to_watch: "Repeat direct orders",
      },
    ],
    owner_solution_map: [
      {
        problem: "Happy guests are not always leaving Google reviews.",
        owner_solution:
          "Owner.com's Google review tools help ask satisfied customers for reviews after they order.",
        dream_outcome:
          "More fresh 5-star reviews make you look like the safer choice before guests visit.",
      },
      {
        problem: "Third-party apps keep the customer relationship.",
        owner_solution:
          "Owner.com's online ordering and branded app send guests to your own site and add buyers to your customer list.",
        dream_outcome:
          "Every online order gives you a guest you can bring back without paying marketplaces again.",
      },
      {
        problem:
          !growthMode
            ? "First-time guests need a reason to come back."
            : "Regulars need an easier way to reorder.",
        owner_solution:
          "Owner.com's email/SMS campaigns and branded app remind guests to order again.",
        dream_outcome:
          !growthMode
            ? "A one-time order can turn into a repeat customer."
            : "Great visits turn into more direct reorders from people who already like you.",
      },
    ],
    owner_pitch: {
      headline: "Owner.com turns this audit into a growth system.",
      dream_outcome:
        "Imagine guests ordering from your website or app, joining your customer list, getting simple email/SMS reminders, and leaving more Google reviews.",
      call_to_action:
        "Use Owner.com to get more direct orders, more repeat guests, and a clearer view of what is working.",
    },
    confidence_notes: [
      "This audit is based on the reviews available during the scrape and should be treated as directional, not a financial guarantee.",
      "Revenue estimates depend on ticket size, repeat rate, and how many guests are influenced by public reviews.",
      "Owner.com recommendations are mapped to its restaurant features: online ordering, branded app, customer list building, Google reviews, email/SMS, SEO, and reporting.",
    ],
  };
}

export function normalizeDeepAnalysis(
  analysis: Partial<DeepAnalysis> | null | undefined,
  fallback: DeepAnalysis
): DeepAnalysis {
  const candidate = analysis ?? {};

  return {
    executive_summary:
      meaningfulString(candidate.executive_summary) ||
      fallback.executive_summary,
    critical_findings: meaningfulStringArray(candidate.critical_findings)
      ? candidate.critical_findings
      : fallback.critical_findings,
    issue_clusters: meaningfulIssueClusters(candidate.issue_clusters)
      ? candidate.issue_clusters
      : fallback.issue_clusters,
    review_evidence: meaningfulReviewEvidence(candidate.review_evidence)
      ? candidate.review_evidence
      : fallback.review_evidence,
    root_causes: meaningfulRootCauses(candidate.root_causes)
      ? candidate.root_causes
      : fallback.root_causes,
    response_quality_audit: meaningfulResponseQualityAudit(candidate.response_quality_audit)
      ? candidate.response_quality_audit
      : fallback.response_quality_audit,
    revenue_assessment:
      candidate.revenue_assessment ?? fallback.revenue_assessment,
    growth_opportunities: meaningfulGrowthOpportunities(candidate.growth_opportunities)
      ? candidate.growth_opportunities
      : fallback.growth_opportunities,
    free_action_plan: meaningfulActionPlan(candidate.free_action_plan)
      ? candidate.free_action_plan
      : fallback.free_action_plan,
    owner_solution_map: meaningfulOwnerSolutionMap(candidate.owner_solution_map)
      ? candidate.owner_solution_map
      : fallback.owner_solution_map,
    owner_pitch: meaningfulOwnerPitch(candidate.owner_pitch)
      ? candidate.owner_pitch
      : fallback.owner_pitch,
    confidence_notes: nonEmptyArray(candidate.confidence_notes)
      ? candidate.confidence_notes
      : fallback.confidence_notes,
  };
}

function meaningfulString(value: unknown): string | null {
  return typeof value === "string" && hasMeaningfulText(value)
    ? value.trim()
    : null;
}

function meaningfulStringArray(value: string[] | undefined): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(hasMeaningfulText);
}

function meaningfulResponseQualityAudit(
  value: DeepAnalysis["response_quality_audit"] | undefined
): value is DeepAnalysis["response_quality_audit"] {
  return Boolean(
    value &&
      hasMeaningfulText(value.summary) &&
      hasMeaningfulText(value.improved_response) &&
      hasMeaningfulText(value.recovery_offer)
  );
}

function meaningfulIssueClusters(
  value: DeepAnalysis["issue_clusters"] | undefined
): value is DeepAnalysis["issue_clusters"] {
  return Boolean(
    Array.isArray(value) &&
      value.length > 0 &&
      value.every(
        (cluster) =>
          hasMeaningfulText(cluster.label) &&
          hasMeaningfulText(cluster.business_impact) &&
          hasMeaningfulText(cluster.likely_root_cause) &&
          meaningfulStringArray(cluster.evidence)
      )
  );
}

function meaningfulReviewEvidence(
  value: DeepAnalysis["review_evidence"] | undefined
): value is DeepAnalysis["review_evidence"] {
  return Boolean(
    Array.isArray(value) &&
      value.length > 0 &&
      value.every(
        (evidence) =>
          hasMeaningfulText(evidence.issue) &&
          hasMeaningfulText(evidence.quote) &&
          hasMeaningfulText(evidence.takeaway)
      )
  );
}

function meaningfulRootCauses(
  value: DeepAnalysis["root_causes"] | undefined
): value is DeepAnalysis["root_causes"] {
  return Boolean(
    Array.isArray(value) &&
      value.length > 0 &&
      value.every(
        (cause) =>
          hasMeaningfulText(cause.issue) &&
          hasMeaningfulText(cause.hypothesis) &&
          hasMeaningfulText(cause.why_it_matters)
      )
  );
}

function meaningfulGrowthOpportunities(
  value: DeepAnalysis["growth_opportunities"] | undefined
): value is DeepAnalysis["growth_opportunities"] {
  return Boolean(
    Array.isArray(value) &&
      value.length > 0 &&
      value.every(
        (opportunity) =>
          hasMeaningfulText(opportunity.area) &&
          hasMeaningfulText(opportunity.opportunity) &&
          hasMeaningfulText(opportunity.why_now)
      )
  );
}

function meaningfulActionPlan(
  value: DeepAnalysis["free_action_plan"] | undefined
): value is DeepAnalysis["free_action_plan"] {
  return Boolean(
    Array.isArray(value) &&
      value.length > 0 &&
      value.every(
        (item) =>
          hasMeaningfulText(item.timeframe) &&
          hasMeaningfulText(item.action) &&
          hasMeaningfulText(item.expected_impact) &&
          hasMeaningfulText(item.metric_to_watch)
      )
  );
}

function meaningfulOwnerSolutionMap(
  value: DeepAnalysis["owner_solution_map"] | undefined
): value is DeepAnalysis["owner_solution_map"] {
  return Boolean(
    Array.isArray(value) &&
      value.length > 0 &&
      value.every(
        (item) =>
          hasMeaningfulText(item.problem) &&
          hasMeaningfulText(item.owner_solution) &&
          hasMeaningfulText(item.dream_outcome)
      )
  );
}

function meaningfulOwnerPitch(
  value: DeepAnalysis["owner_pitch"] | undefined
): value is DeepAnalysis["owner_pitch"] {
  return Boolean(
    value &&
      hasMeaningfulText(value.headline) &&
      hasMeaningfulText(value.dream_outcome) &&
      hasMeaningfulText(value.call_to_action)
  );
}

function hasMeaningfulText(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const text = value.trim();
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  return text.length >= 8 && wordCount >= 2 && !isEllipsized(text);
}

function isEllipsized(text: string): boolean {
  return /(?:\.\.\.|…)\s*$/.test(text);
}

function nonEmptyArray<T>(value: T[] | undefined): value is T[] {
  return Array.isArray(value) && value.length > 0;
}

function detectTopComplaint(reviews: ReviewInput[]): string {
  const negativeText = reviews
    .filter((review) => review.rating <= 3)
    .map((review) => review.text.toLowerCase())
    .join(" ");

  if (!negativeText) return "No major complaints found";
  if (matchesAny(negativeText, ["rude", "attitude", "manager", "server", "staff"])) {
    return "Customer Service";
  }
  if (matchesAny(negativeText, ["slow", "wait", "hour", "late"])) {
    return "Service Speed";
  }
  if (matchesAny(negativeText, ["cold", "temperature", "stale", "undercooked", "overcooked"])) {
    return "Food Quality";
  }
  if (matchesAny(negativeText, ["expensive", "price", "overpriced", "value"])) {
    return "Overpriced";
  }
  if (matchesAny(negativeText, ["dirty", "clean", "bathroom"])) {
    return "Cleanliness";
  }

  return "Guest Experience";
}

function averageRating(ratings: number[], fallbackReviews: ReviewInput[]): number {
  const source = ratings.length > 0 ? ratings : fallbackReviews.map((review) => review.rating);
  if (source.length === 0) return 4;

  const average = source.reduce((sum, rating) => sum + rating, 0) / source.length;
  return Math.max(1, Math.min(5, parseFloat(average.toFixed(1))));
}

function matchesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}
