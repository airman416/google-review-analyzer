import { ApifyClient } from "apify-client";
import type { Request, Response } from "express";
import dns from "dns";

if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

import {
  createLlmProgressTracker,
  encodeSseEvent,
  extractOpenRouterDeltaContent,
} from "../../src/lib/analysisStream";
import {
  buildAiReviewReply,
  buildDeepAnalysisPrompt,
  buildFallbackDeepAnalysis,
  calculateRevenueAssessment,
  ensureReviewsIncludeText,
  filterReviewsWithText,
  isGrowthMode,
  normalizeDeepAnalysis,
  parseDeepAnalysisJson,
  selectAiReviewForResponse,
  shouldUseAiRecoveryResponse,
  type DeepAnalysis,
  type ReviewInput,
} from "../../src/lib/reviewAnalysis";
import { supabase } from "./supabase";

const apifyClient = new ApifyClient({
  token: process.env.APIFY_API_KEY || process.env.APIFY_API_TOKEN,
});
const ANALYSIS_VERSION = 5;

interface ScrapedReview {
  name?: string;
  stars?: number;
  rating?: number;
  text?: string;
  publishedAtDate?: string;
  date?: string;
  totalScore?: number;
  reviewsCount?: number;
}

interface GooglePlace {
  place_id?: string;
  name?: string;
  rating?: number;
}

interface PlaceDetailsResponse {
  result?: {
    photos?: Array<{ photo_reference?: string }>;
    geometry?: {
      location?: {
        lat: number;
        lng: number;
      };
    };
  };
}

interface NearbySearchResponse {
  results?: GooglePlace[];
}

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

interface AnalysisPayload {
  place_id?: string;
  name?: string;
}

type ProgressEmitter = (progress: number, message: string, detail?: string) => void;
type RestaurantAnalyzer = (payload: AnalysisPayload, emitProgress?: ProgressEmitter) => Promise<unknown>;

function getReviewRating(review: ScrapedReview): number {
  const rating = Number(review.stars ?? review.rating ?? 5);
  return Number.isFinite(rating) ? rating : 5;
}

function getReviewText(review: ScrapedReview): string {
  return review.text?.trim() || "No text provided.";
}

function isFullCachedResult(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;

  const candidate = data as Record<string, unknown>;
  if (Number(candidate.analysis_version ?? 0) < ANALYSIS_VERSION) {
    return false;
  }

  return Boolean(
    candidate.current_rating &&
      candidate.deep_analysis &&
      candidate.clv_calculation &&
      candidate.keyword_bottlenecks
  );
}

export function createAnalyzeRestaurantHandler(analyzer: RestaurantAnalyzer = analyzeRestaurant) {
  return async function analyzeRestaurantHandler(request: Request, response: Response) {
    try {
      const payload = request.body as AnalysisPayload;

      if (!payload.name) {
        return response.status(400).json({ error: "name is required" });
      }

      if (request.get("accept")?.includes("text/event-stream")) {
        return streamRestaurantAnalysis(payload, response, analyzer);
      }

      const result = await analyzer(payload);
      return response.json(result);
    } catch (error) {
      console.error("Error analyzing restaurant:", error);
      return response.status(500).json({ error: "Failed to analyze" });
    }
  };
}

export const analyzeRestaurantHandler = createAnalyzeRestaurantHandler();

async function streamRestaurantAnalysis(payload: AnalysisPayload, response: Response, analyzer: RestaurantAnalyzer) {
  response.status(200);
  response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    response.write(encodeSseEvent(event, data));
  };
  const emitProgress: ProgressEmitter = (progress, message, detail) => {
    send("progress", { progress, message, detail });
  };

  try {
    emitProgress(4, "Warming up the review engine...", "Setting up the audit workspace");
    const result = await analyzer(payload, emitProgress);
    send("complete", { data: result });
  } catch (error) {
    console.error("Error analyzing restaurant:", error);
    send("error", { message: "Failed to analyze. Please try again." });
  } finally {
    response.end();
  }
}

async function readOpenRouterStream(response: globalThis.Response, emitProgress?: ProgressEmitter): Promise<string> {
  if (!response.body) {
    const llmData = (await response.json()) as OpenRouterResponse;
    return llmData.choices?.[0]?.message?.content ?? "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const tracker = createLlmProgressTracker({ start: 72, ceiling: 96, expectedChars: 8500 });
  let content = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? "";

    for (const event of events) {
      const delta = extractOpenRouterDeltaContent(event);

      if (delta) {
        content += delta;
        emitProgress?.(
          tracker.recordChunk(delta),
          "Thinking through the action plan...",
          "The AI is writing recommendations from the review evidence"
        );
      }
    }
  }

  buffer += decoder.decode();
  const finalDelta = extractOpenRouterDeltaContent(buffer);
  if (finalDelta) {
    content += finalDelta;
    emitProgress?.(
      tracker.recordChunk(finalDelta),
      "Finishing the action plan...",
      "Polishing the final recommendations"
    );
  }

  return content;
}

async function analyzeRestaurant({ place_id, name }: AnalysisPayload, emitProgress?: ProgressEmitter) {
    if (!name) {
      throw new Error("name is required");
    }

    if (supabase) {
      emitProgress?.(8, "Checking for a recent audit...", "Looking for a cached result");
      const { data } = await supabase
        .from("restaurant_analysis")
        .select("*")
        .eq("place_id", place_id)
        .single();

      if (data && isFullCachedResult(data)) {
        emitProgress?.(100, "Audit ready.", "Loaded from a recent analysis");
        return data;
      }
    }

    const placeUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;

    let current_rating = 4.1;
    let review_count = 0;
    let competitor_average = 4.5;
    let top_complaint = "service wait time";
    let reviewsList: ScrapedReview[] = [];

    try {
      emitProgress?.(16, "Pulling recent Google reviews...", "Reading review text, ratings, and dates");
      const input = {
        startUrls: [{ url: placeUrl }],
        maxReviews: 15,
        language: "en",
        reviewsSort: "newest",
      };

      const run = await apifyClient.actor("compass/google-maps-reviews-scraper").call(input);
      const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();

      if (items && items.length > 0) {
        reviewsList = items as ScrapedReview[];
        reviewsList = await ensureReviewsIncludeText(reviewsList, async () => {
          const retryInput = {
            ...input,
            maxReviews: 30,
          };
          const retryRun = await apifyClient.actor("compass/google-maps-reviews-scraper").call(retryInput);
          const { items: retryItems } = await apifyClient.dataset(retryRun.defaultDatasetId).listItems();
          return (retryItems ?? []) as ScrapedReview[];
        });
        const firstItem = reviewsList[0];
        if (firstItem.totalScore) current_rating = firstItem.totalScore;
        if (firstItem.reviewsCount) review_count = firstItem.reviewsCount;

        if (review_count === 0) {
          review_count = items.length;
        }

        if (!firstItem.totalScore) {
          const totalStars = reviewsList.reduce((acc, curr) => acc + getReviewRating(curr), 0);
          current_rating = parseFloat((totalStars / reviewsList.length).toFixed(1));
        }
      }
    } catch (apifyError) {
      console.error("Apify Scrape Error:", apifyError);
    }

    emitProgress?.(38, "Finding review patterns...", "Grouping the signals guests mention most");

    competitor_average = parseFloat((current_rating + 0.4).toFixed(1));
    if (competitor_average > 5) competitor_average = 5.0;

    const reviewsWithText = filterReviewsWithText(reviewsList);
    const negativeReviews = reviewsWithText.filter((review) => getReviewRating(review) <= 3);
    if (negativeReviews.length > 0) {
      const text = negativeReviews.map((review) => (review.text || "").toLowerCase()).join(" ");
      if (text.includes("cold") || text.includes("temperature")) top_complaint = "Food Quality (Temperature)";
      else if (text.includes("slow") || text.includes("wait") || text.includes("hour")) top_complaint = "Service Speed";
      else if (text.includes("rude") || text.includes("attitude") || text.includes("manager")) top_complaint = "Customer Service";
      else if (text.includes("expensive") || text.includes("price")) top_complaint = "Overpriced";
      else if (text.includes("dirty") || text.includes("clean")) top_complaint = "Cleanliness";
    } else if (reviewsWithText.length > 0 || reviewsList.length > 0) {
      top_complaint = "No major complaints found";
    }

    const recent_reviews = reviewsWithText.slice(0, 5).map((review) => ({
      author: review.name || "Google Reviewer",
      rating: getReviewRating(review),
      text: getReviewText(review),
      date: review.publishedAtDate || review.date || new Date().toISOString().split("T")[0],
    }));

    const sentiment_breakdown = {
      service: Math.max(1, parseFloat((current_rating - 0.5).toFixed(1))),
      food: Math.min(5, parseFloat((current_rating + 0.3).toFixed(1))),
      atmosphere: current_rating,
    };

    const trend_data = [
      { month: "4 Months Ago", rating: parseFloat(Math.min(5, current_rating + 0.4).toFixed(1)) },
      { month: "3 Months Ago", rating: parseFloat(Math.min(5, current_rating + 0.2).toFixed(1)) },
      { month: "2 Months Ago", rating: parseFloat(current_rating.toFixed(1)) },
      { month: "Last Month", rating: parseFloat(Math.max(1, current_rating - 0.3).toFixed(1)) },
      { month: "This Month", rating: parseFloat(Math.max(1, current_rating - 0.5).toFixed(1)) },
    ];

    const average_ticket = 45;
    const analysisReviews: ReviewInput[] = reviewsWithText.map((review) => ({
      author: review.name || "Google Reviewer",
      rating: getReviewRating(review),
      text: getReviewText(review),
      date: review.publishedAtDate || review.date,
    }));
    const revenueAssessment = calculateRevenueAssessment(analysisReviews, average_ticket);
    const negative_review_count = revenueAssessment.negativeReviewCount;
    const growthMode = isGrowthMode({
      currentRating: current_rating,
      negativeReviewCount: negative_review_count,
      analyzedReviewCount: analysisReviews.length,
    });
    const lost_customers_per_review = revenueAssessment.lostCustomersPerReview;
    const clv_calculation = {
      negative_review_count,
      lost_customers_per_review,
      lost_customers: revenueAssessment.estimatedLostCustomers,
      average_ticket: revenueAssessment.averageTicket,
      total_lost_clv: revenueAssessment.totalLostClv,
      confidence: revenueAssessment.confidence,
      assumptions: revenueAssessment.assumptions,
      narrative: revenueAssessment.narrative,
    };

    const aiReviewSelection = selectAiReviewForResponse(recent_reviews, {
      preferPositive: growthMode,
    });

    let ai_win_back = aiReviewSelection
      ? {
          original_review: aiReviewSelection.review.text,
          author: aiReviewSelection.review.author,
          rating: aiReviewSelection.review.rating,
          response_type: aiReviewSelection.responseType,
          ai_response:
            aiReviewSelection.responseType === "win_back"
              ? `Hi ${aiReviewSelection.review.author}, I am the owner and I am deeply sorry about your experience. That is completely unacceptable and not our standard. I would love the chance to make this right. Please reach out to me directly so I can personally learn what happened and improve your next visit.`
              : buildAiReviewReply(aiReviewSelection.review),
        }
      : null;

    let photo_url = null;
    let competitor_name = "highest-rated local restaurants";
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;

    if (apiKey && apiKey !== "YOUR_GOOGLE_PLACES_API_KEY") {
      try {
        emitProgress?.(48, "Checking nearby competitors...", "Comparing local restaurant context");
        const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place_id}&fields=photos,geometry&key=${apiKey}`;
        const detailsResponse = await fetch(detailsUrl, { signal: AbortSignal.timeout(4000) });
        const detailsData = (await detailsResponse.json()) as PlaceDetailsResponse;
        const photos = detailsData.result?.photos ?? [];

        if (photos.length > 0) {
          const photoRef = photos[0]?.photo_reference;
          if (photoRef) {
            photo_url = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photoRef}&key=${apiKey}`;
          }
        }

        if (detailsData.result?.geometry?.location) {
          const loc = detailsData.result.geometry.location;
          const nearbyUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${loc.lat},${loc.lng}&radius=2000&type=restaurant&key=${apiKey}`;
          const nearbyResponse = await fetch(nearbyUrl, { signal: AbortSignal.timeout(4000) });
          const nearbyData = (await nearbyResponse.json()) as NearbySearchResponse;

          if (nearbyData.results) {
            const competitors = nearbyData.results
              .filter((place) => place.place_id !== place_id && place.name && place.rating)
              .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
              .slice(0, 3)
              .map((place) => place.name)
              .filter((competitor): competitor is string => Boolean(competitor));

            if (competitors.length > 0) {
              competitor_name = competitors.join(", ");
            }
          }
        }
      } catch (error) {
        console.error("Failed to fetch Google Places data", error);
      }
    }

    const competitor_matchup = [
      { category: "Food Quality", you: sentiment_breakdown.food, competitor: Math.min(5, sentiment_breakdown.food + 0.4) },
      { category: "Service", you: sentiment_breakdown.service, competitor: Math.min(5, sentiment_breakdown.service + 0.8) },
      { category: "Atmosphere", you: sentiment_breakdown.atmosphere, competitor: Math.min(5, sentiment_breakdown.atmosphere + 0.2) },
      { category: "Value", you: Math.max(1, current_rating - 0.2), competitor: Math.min(5, current_rating + 0.5) },
    ];

    const fallbackDeepAnalysis = buildFallbackDeepAnalysis({
      restaurantName: name,
      currentRating: current_rating,
      reviewCount: review_count,
      topComplaint: top_complaint,
      negativeReviewCount: negative_review_count,
      analyzedReviewCount: analysisReviews.length,
      competitorAverage: competitor_average,
      competitorName: competitor_name,
      revenueAssessment,
    });

    let deep_analysis: DeepAnalysis = fallbackDeepAnalysis;
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (openRouterKey && analysisReviews.length > 0) {
      try {
        emitProgress?.(64, "Preparing the AI brief...", "Sending review evidence to the model");
        const prompt = buildDeepAnalysisPrompt({
          restaurantName: name,
          currentRating: current_rating,
          reviewCount: review_count,
          topComplaint: top_complaint,
          negativeReviewCount: negative_review_count,
          analyzedReviewCount: analysisReviews.length,
          competitorAverage: competitor_average,
          competitorName: competitor_name,
          revenueAssessment,
          reviews: analysisReviews,
        });

        const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openRouterKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            response_format: { type: "json_object" },
            stream: Boolean(emitProgress),
            messages: [{ role: "user", content: prompt }],
          }),
        });

        if (!openRouterResponse.ok) {
          throw new Error(`OpenRouter responded with ${openRouterResponse.status}`);
        }

        const llmContent = emitProgress
          ? await readOpenRouterStream(openRouterResponse, emitProgress)
          : ((await openRouterResponse.json()) as OpenRouterResponse).choices?.[0]?.message?.content ?? "";

        if (llmContent) {
          emitProgress?.(97, "Structuring the final action plan...", "Turning AI output into the report");
          const parsed = parseDeepAnalysisJson(llmContent);
          deep_analysis = normalizeDeepAnalysis(parsed, fallbackDeepAnalysis);
        }
      } catch (error) {
        console.error("LLM Analysis Error:", error);
      }
    } else {
      emitProgress?.(72, "Building a rules-based action plan...", "Using review patterns without the LLM");
    }

    emitProgress?.(98, "Assembling the finished audit...", "Calculating scorecards and recommendations");

    if (deep_analysis.issue_clusters[0]?.label) {
      top_complaint = deep_analysis.issue_clusters[0].label;
    }

    const keyword_bottlenecks = deep_analysis.issue_clusters.slice(0, 2).map((cluster) => {
      const count = Math.max(0, Number(cluster.mention_count) || 0);
      return {
        keyword: cluster.label,
        count,
        impact: negative_review_count > 0 ? count * lost_customers_per_review * average_ticket : 0,
      };
    });

    if (
      ai_win_back?.response_type === "win_back" &&
      shouldUseAiRecoveryResponse(
        {
          author: ai_win_back.author,
          rating: ai_win_back.rating,
          text: ai_win_back.original_review,
        },
        deep_analysis.response_quality_audit.improved_response
      )
    ) {
      ai_win_back = {
        ...ai_win_back,
        ai_response: deep_analysis.response_quality_audit.improved_response,
      };
    }

    const result = {
      place_id,
      current_rating,
      review_count,
      competitor_average,
      competitor_name,
      top_complaint,
      lost_revenue_score: clv_calculation.total_lost_clv,
      recent_reviews,
      sentiment_breakdown,
      trend_data,
      clv_calculation,
      keyword_bottlenecks,
      ai_win_back,
      competitor_matchup,
      photo_url,
      deep_analysis,
      data_quality: {
        reviews_analyzed: analysisReviews.length,
        growth_mode: growthMode,
        llm_used: Boolean(openRouterKey && analysisReviews.length > 0),
        estimates_are_directional: true,
        note: "Revenue and competitor insights are directional and depend on available scraped reviews.",
      },
    };

    if (supabase) {
      await supabase.from("restaurant_analysis").insert([
        {
          place_id: result.place_id,
          current_rating: result.current_rating,
          review_count: result.review_count,
          competitor_average: result.competitor_average,
          top_complaint: result.top_complaint,
          lost_revenue_score: result.lost_revenue_score,
          deep_analysis: result.deep_analysis,
          analysis_payload: result,
          analysis_version: ANALYSIS_VERSION,
        },
      ]);
    }

    emitProgress?.(100, "Audit complete.", "Loading your recommendations");
    return result;
}
