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
- Map each opportunity to how Owner.com helps unlock the next level through direct ordering, owned customer data, automated review generation, retention marketing, and local growth.
- Sell the dream of the restaurant having more direct orders, more repeat customers, more 5-star proof, and less dependence on third-party marketplaces.
- Be persuasive but credible. Do not invent exact facts that are not in the reviews. Mark estimates as directional.

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
      "owner_solution": "Explain specifically how Owner.com solves this",
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
        problem: "Happy guests are not consistently becoming public proof.",
        owner_solution:
          "Owner.com helps restaurants automate review generation so more satisfied customers show up on Google.",
        dream_outcome:
          "A steady stream of fresh 5-star reviews makes the restaurant feel like the obvious choice.",
      },
      {
        problem: "Guests may order once and disappear into third-party platforms.",
        owner_solution:
          "Owner.com helps restaurants capture direct orders and build an owned customer database.",
        dream_outcome:
          "Every online order becomes a customer relationship the restaurant can grow over time.",
      },
      {
        problem:
          !growthMode
            ? "Unhappy guests need fast recovery before they become lost regulars."
            : "Happy guests need a reason to order again directly.",
        owner_solution:
          "Owner.com gives restaurants the marketing and communication foundation to bring guests back.",
        dream_outcome:
          !growthMode
            ? "A bad visit becomes a recovery moment instead of a permanent reason to choose a competitor."
            : "Great visits turn into repeat orders, loyalty, and owned customer relationships.",
      },
    ],
    owner_pitch: {
      headline: "Owner.com turns this audit into a growth system.",
      dream_outcome:
        "Imagine every happy guest being nudged to leave a review, every online order becoming your customer instead of a marketplace customer, and every lapsed diner getting a reason to come back.",
      call_to_action:
        "Use Owner.com to make the next level easy: more direct orders, more owned customers, more reviews, and more repeat guests.",
    },
    confidence_notes: [
      "This audit is based on the reviews available during the scrape and should be treated as directional, not a financial guarantee.",
      "Revenue estimates depend on ticket size, repeat rate, and how many guests are influenced by public reviews.",
      "Owner.com recommendations are mapped to common restaurant growth levers: reviews, direct ordering, customer data, and retention.",
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
      nonEmptyString(candidate.executive_summary) ||
      fallback.executive_summary,
    critical_findings: nonEmptyArray(candidate.critical_findings)
      ? candidate.critical_findings
      : fallback.critical_findings,
    issue_clusters: nonEmptyArray(candidate.issue_clusters)
      ? candidate.issue_clusters
      : fallback.issue_clusters,
    review_evidence: nonEmptyArray(candidate.review_evidence)
      ? candidate.review_evidence
      : fallback.review_evidence,
    root_causes: nonEmptyArray(candidate.root_causes)
      ? candidate.root_causes
      : fallback.root_causes,
    response_quality_audit:
      candidate.response_quality_audit ?? fallback.response_quality_audit,
    revenue_assessment:
      candidate.revenue_assessment ?? fallback.revenue_assessment,
    growth_opportunities: nonEmptyArray(candidate.growth_opportunities)
      ? candidate.growth_opportunities
      : fallback.growth_opportunities,
    free_action_plan: nonEmptyArray(candidate.free_action_plan)
      ? candidate.free_action_plan
      : fallback.free_action_plan,
    owner_solution_map: nonEmptyArray(candidate.owner_solution_map)
      ? candidate.owner_solution_map
      : fallback.owner_solution_map,
    owner_pitch: candidate.owner_pitch ?? fallback.owner_pitch,
    confidence_notes: nonEmptyArray(candidate.confidence_notes)
      ? candidate.confidence_notes
      : fallback.confidence_notes,
  };
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function nonEmptyArray<T>(value: T[] | undefined): value is T[] {
  return Array.isArray(value) && value.length > 0;
}
