import { ApifyClient } from "apify-client";
import type { Request, Response } from "express";

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
  selectAiReviewAmplifierReview,
  selectAiWinBackReview,
  type DeepAnalysis,
  type ReviewInput,
} from "../../src/lib/reviewAnalysis";
import { supabase } from "./supabase";

const apifyClient = new ApifyClient({
  token: process.env.APIFY_API_KEY || process.env.APIFY_API_TOKEN,
});

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
  return Boolean(
    candidate.current_rating &&
      candidate.deep_analysis &&
      candidate.clv_calculation &&
      candidate.keyword_bottlenecks
  );
}

export async function analyzeRestaurantHandler(request: Request, response: Response) {
  try {
    const { place_id, name } = request.body;

    if (!name) {
      return response.status(400).json({ error: "name is required" });
    }

    if (supabase) {
      const { data } = await supabase
        .from("restaurant_analysis")
        .select("*")
        .eq("place_id", place_id)
        .single();

      if (data && isFullCachedResult(data)) {
        return response.json(data);
      }
    }

    const placeUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;

    let current_rating = 4.1;
    let review_count = 0;
    let competitor_average = 4.5;
    let top_complaint = "service wait time";
    let reviewsList: ScrapedReview[] = [];

    try {
      const input = {
        startUrls: [{ url: placeUrl }],
        maxReviews: 50,
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
            maxReviews: 100,
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

    const needsRecovery = !growthMode;
    const reviewForResponse = needsRecovery
      ? selectAiWinBackReview(recent_reviews)
      : selectAiReviewAmplifierReview(recent_reviews);

    let ai_win_back = reviewForResponse
      ? {
          original_review: reviewForResponse.text,
          author: reviewForResponse.author,
          rating: reviewForResponse.rating,
          ai_response: needsRecovery
            ? `Hi ${reviewForResponse.author}, I am the owner and I am deeply sorry about your experience. That is completely unacceptable and not our standard. I would love the chance to make this right. Please reach out to me directly so I can personally learn what happened and improve your next visit.`
            : buildAiReviewReply(reviewForResponse),
        }
      : null;

    let photo_url = null;
    let competitor_name = "highest-rated local restaurants";
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;

    if (apiKey && apiKey !== "YOUR_GOOGLE_PLACES_API_KEY") {
      try {
        const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place_id}&fields=photos,geometry&key=${apiKey}`;
        const detailsResponse = await fetch(detailsUrl);
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
          const nearbyResponse = await fetch(nearbyUrl);
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
            messages: [{ role: "user", content: prompt }],
          }),
        });

        if (!openRouterResponse.ok) {
          throw new Error(`OpenRouter responded with ${openRouterResponse.status}`);
        }

        const llmData = (await openRouterResponse.json()) as OpenRouterResponse;
        if (llmData.choices?.[0]?.message?.content) {
          const parsed = parseDeepAnalysisJson(llmData.choices[0].message.content);
          deep_analysis = normalizeDeepAnalysis(parsed, fallbackDeepAnalysis);
        }
      } catch (error) {
        console.error("LLM Analysis Error:", error);
      }
    }

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

    if (ai_win_back && needsRecovery && deep_analysis.response_quality_audit.improved_response) {
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
          analysis_version: 2,
        },
      ]);
    }

    return response.json(result);
  } catch (error) {
    console.error("Error analyzing restaurant:", error);
    return response.status(500).json({ error: "Failed to analyze" });
  }
}
