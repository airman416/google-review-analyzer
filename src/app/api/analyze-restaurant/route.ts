import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { ApifyClient } from 'apify-client';
import {
  createLlmProgressTracker,
  encodeSseEvent,
  extractOpenRouterDeltaContent,
} from '@/lib/analysisStream';
import {
  buildAiReviewReply,
  buildDeepAnalysisPrompt,
  buildFallbackDeepAnalysis,
  calculateRevenueAssessment,
  calculateReviewSentiment,
  ensureReviewsIncludeText,
  filterReviewsWithText,
  isGrowthMode,
  normalizeDeepAnalysis,
  parseDeepAnalysisJson,
  selectAiReviewAmplifierReview,
  selectAiWinBackReview,
  type DeepAnalysis,
  type ReviewInput,
} from '@/lib/reviewAnalysis';

const apifyClient = new ApifyClient({
    token: process.env.APIFY_API_KEY || process.env.APIFY_API_TOKEN,
});
const ANALYSIS_VERSION = 3;

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

function getReviewRating(review: ScrapedReview): number {
  const rating = Number(review.stars ?? review.rating ?? 5);
  return Number.isFinite(rating) ? rating : 5;
}

function getReviewText(review: ScrapedReview): string {
  return review.text?.trim() || 'No text provided.';
}

function isFullCachedResult(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;

  const candidate = data as Record<string, unknown>;
  return Boolean(
    candidate.current_rating &&
    candidate.deep_analysis &&
    candidate.clv_calculation &&
    candidate.keyword_bottlenecks
  );
}

function getFullCachedResult(data: unknown): unknown | null {
  if (!data || typeof data !== 'object') return null;

  const candidate = data as Record<string, unknown>;
  if (Number(candidate.analysis_version ?? 0) < ANALYSIS_VERSION) {
    return null;
  }
  if (isFullCachedResult(candidate.analysis_payload)) {
    return candidate.analysis_payload;
  }
  if (isFullCachedResult(candidate)) {
    return candidate;
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as AnalysisPayload;

    if (!payload.name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    if (request.headers.get('accept')?.includes('text/event-stream')) {
      return streamRestaurantAnalysis(payload);
    }

    const result = await analyzeRestaurant(payload);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error analyzing restaurant:", error);
    return NextResponse.json({ error: 'Failed to analyze' }, { status: 500 });
  }
}

function streamRestaurantAnalysis(payload: AnalysisPayload) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(encodeSseEvent(event, data)));
        };
        const emitProgress: ProgressEmitter = (progress, message, detail) => {
          send('progress', { progress, message, detail });
        };

        try {
          emitProgress(4, 'Warming up the review engine...', 'Setting up the audit workspace');
          const result = await analyzeRestaurant(payload, emitProgress);
          send('complete', { data: result });
        } catch (error) {
          console.error("Error analyzing restaurant:", error);
          send('error', { message: 'Failed to analyze. Please try again.' });
        } finally {
          controller.close();
        }
      },
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    }
  );
}

async function readOpenRouterStream(response: Response, emitProgress?: ProgressEmitter): Promise<string> {
  if (!response.body) {
    const llmData = (await response.json()) as OpenRouterResponse;
    return llmData.choices?.[0]?.message?.content ?? '';
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const tracker = createLlmProgressTracker({ start: 72, ceiling: 96, expectedChars: 8500 });
  let content = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? '';

    for (const event of events) {
      const delta = extractOpenRouterDeltaContent(event);

      if (delta) {
        content += delta;
        emitProgress?.(
          tracker.recordChunk(delta),
          'Thinking through the action plan...',
          'The AI is writing recommendations from the review evidence'
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
      'Finishing the action plan...',
      'Polishing the final recommendations'
    );
  }

  return content;
}

async function analyzeRestaurant(
  { place_id, name }: AnalysisPayload,
  emitProgress?: ProgressEmitter
) {
    if (!name) {
      throw new Error('name is required');
    }

    // 1. Check cache (Supabase)
    emitProgress?.(8, 'Checking for a recent audit...', 'Looking for a cached result');
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://dummy.supabase.co') {
      const { data } = await supabase
        .from('restaurant_analysis')
        .select('*')
        .eq('place_id', place_id)
        .single();
      
      const cachedResult = getFullCachedResult(data);
      if (cachedResult) {
        emitProgress?.(100, 'Audit ready.', 'Loaded from a recent analysis');
        return cachedResult;
      }
    }

    const placeUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;

    let current_rating = 4.1;
    let review_count = 0;
    let competitor_average = 4.5;
    let top_complaint = "service wait time";
    let reviewsList: ScrapedReview[] = [];

    // 2. Fetch Google Reviews via Apify
    try {
        emitProgress?.(16, 'Pulling recent Google reviews...', 'Reading review text, ratings, and dates');
        const input = {
            startUrls: [{ url: placeUrl }],
            maxReviews: 50, // Keep this low during development to save money
            language: "en",
            reviewsSort: "newest",
        };

        const run = await apifyClient.actor('compass/google-maps-reviews-scraper').call(input);
        const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
        
        if (items && items.length > 0) {
            reviewsList = items as ScrapedReview[];
            reviewsList = await ensureReviewsIncludeText(reviewsList, async () => {
              const retryInput = {
                ...input,
                maxReviews: 100,
              };
              const retryRun = await apifyClient.actor('compass/google-maps-reviews-scraper').call(retryInput);
              const { items: retryItems } = await apifyClient.dataset(retryRun.defaultDatasetId).listItems();
              return (retryItems ?? []) as ScrapedReview[];
            });
            
            // Apify usually includes totalScore and reviewsCount on each review item representing the place's overall stats
            const firstItem = reviewsList[0];
            if (firstItem.totalScore) current_rating = firstItem.totalScore;
            if (firstItem.reviewsCount) review_count = firstItem.reviewsCount;
            
            if (review_count === 0) {
               review_count = items.length;
            }

            // Calculate current_rating from scraped reviews if not provided by the scraper overall
            if (!firstItem.totalScore) {
               const totalStars = reviewsList.reduce((acc, curr) => acc + getReviewRating(curr), 0);
               current_rating = parseFloat((totalStars / reviewsList.length).toFixed(1));
            }
        }
    } catch (apifyError) {
        console.error("Apify Scrape Error:", apifyError);
        // Fallback to mock data if Apify fails
    }

    emitProgress?.(38, 'Finding review patterns...', 'Grouping the signals guests mention most');

    // 3. Competitor Data (Mocked for now since SerpApi key isn't provided)
    // Could be expanded later
    competitor_average = parseFloat((current_rating + 0.4).toFixed(1));
    if (competitor_average > 5) competitor_average = 5.0;

    const reviewsWithText = filterReviewsWithText(reviewsList);
    const recent_reviews = reviewsWithText.slice(0, 5).map((r) => ({
      author: r.name || 'Google Reviewer',
      rating: getReviewRating(r),
      text: getReviewText(r),
      date: r.publishedAtDate || r.date || new Date().toISOString().split('T')[0]
    }));

    const analysisReviews: ReviewInput[] = reviewsWithText.map((review) => ({
      author: review.name || 'Google Reviewer',
      rating: getReviewRating(review),
      text: getReviewText(review),
      date: review.publishedAtDate || review.date,
    }));
    const reviewSentiment = calculateReviewSentiment(analysisReviews);
    top_complaint = reviewSentiment.topComplaint;
    const sentiment_breakdown = reviewSentiment.breakdown;

    // 1. Trend Data (Mocked recent dip)
    const trend_data = [
      { month: '4 Months Ago', rating: parseFloat(Math.min(5, current_rating + 0.4).toFixed(1)) },
      { month: '3 Months Ago', rating: parseFloat(Math.min(5, current_rating + 0.2).toFixed(1)) },
      { month: '2 Months Ago', rating: parseFloat(current_rating.toFixed(1)) },
      { month: 'Last Month', rating: parseFloat(Math.max(1, current_rating - 0.3).toFixed(1)) },
      { month: 'This Month', rating: parseFloat(Math.max(1, current_rating - 0.5).toFixed(1)) },
    ];

    // 2. CLV Calculation
    const average_ticket = 45;
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

    // 3. Initial review response. The deep LLM audit can replace recovery replies later.
    const recoveryReview = selectAiWinBackReview(recent_reviews);
    const amplifierReview = selectAiReviewAmplifierReview(recent_reviews);
    const reviewForResponse = growthMode ? amplifierReview : recoveryReview ?? amplifierReview;
    const responseType = reviewForResponse?.rating && reviewForResponse.rating <= 3 ? "win_back" : "amplifier";
    
    let ai_win_back = reviewForResponse
      ? {
          original_review: reviewForResponse.text,
          author: reviewForResponse.author,
          rating: reviewForResponse.rating,
          response_type: responseType,
          ai_response: buildAiReviewReply(reviewForResponse),
        }
      : null;

    let photo_url = null;
    let competitor_name = "highest-rated local restaurants";
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
    
    if (apiKey && apiKey !== 'YOUR_GOOGLE_PLACES_API_KEY') {
      try {
        emitProgress?.(48, 'Checking nearby competitors...', 'Comparing local restaurant context');
        const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place_id}&fields=photos,geometry&key=${apiKey}`;
        const detailsRes = await fetch(detailsUrl);
        const detailsData = (await detailsRes.json()) as PlaceDetailsResponse;
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
          const nearbyRes = await fetch(nearbyUrl);
          const nearbyData = (await nearbyRes.json()) as NearbySearchResponse;
          
          if (nearbyData.results) {
            const competitors = nearbyData.results
              .filter((r) => r.place_id !== place_id && r.name && r.rating)
              .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
              .slice(0, 3)
              .map((r) => r.name)
              .filter((competitor): competitor is string => Boolean(competitor));
            
            if (competitors.length > 0) {
              competitor_name = competitors.join(', ');
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch Google Places data", err);
      }
    }

    // 5. Competitor Matchup
    const competitor_matchup = [
      { category: 'Food Quality', you: sentiment_breakdown.food, competitor: Math.min(5, sentiment_breakdown.food + 0.4) },
      { category: 'Service', you: sentiment_breakdown.service, competitor: Math.min(5, sentiment_breakdown.service + 0.8) },
      { category: 'Atmosphere', you: sentiment_breakdown.atmosphere, competitor: Math.min(5, sentiment_breakdown.atmosphere + 0.2) },
      { category: 'Value', you: Math.max(1, current_rating - 0.2), competitor: Math.min(5, current_rating + 0.5) },
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

    // 6. Deep LLM Analysis via OpenRouter
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (openRouterKey && analysisReviews.length > 0) {
      try {
        emitProgress?.(64, 'Preparing the AI brief...', 'Sending review evidence to the model');
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

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openRouterKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            response_format: { type: "json_object" },
            stream: Boolean(emitProgress),
            messages: [{ role: "user", content: prompt }]
          })
        });

        if (!response.ok) {
          throw new Error(`OpenRouter responded with ${response.status}`);
        }

        const llmContent = emitProgress
          ? await readOpenRouterStream(response, emitProgress)
          : ((await response.json()) as OpenRouterResponse).choices?.[0]?.message?.content ?? '';

        if (llmContent) {
          emitProgress?.(97, 'Structuring the final action plan...', 'Turning AI output into the report');
          const parsed = parseDeepAnalysisJson(llmContent);
          deep_analysis = normalizeDeepAnalysis(parsed, fallbackDeepAnalysis);
        }
      } catch (err) {
        console.error("LLM Analysis Error:", err);
      }
    } else {
      emitProgress?.(72, 'Building a rules-based action plan...', 'Using review patterns without the LLM');
    }

    emitProgress?.(98, 'Assembling the finished audit...', 'Calculating scorecards and recommendations');

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

    if (ai_win_back?.response_type === "win_back" && deep_analysis.response_quality_audit.improved_response) {
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
      lost_revenue_score: clv_calculation.total_lost_clv, // Update this to match CLV
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

    // 7. Cache result to Supabase. Include the full payload when the table supports it.
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL !== 'YOUR_SUPABASE_URL' && process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://dummy.supabase.co') {
      await supabase.from('restaurant_analysis').insert([{
        place_id: result.place_id,
        current_rating: result.current_rating,
        review_count: result.review_count,
        competitor_average: result.competitor_average,
        top_complaint: result.top_complaint,
        lost_revenue_score: result.lost_revenue_score,
        deep_analysis: result.deep_analysis,
        analysis_payload: result,
        analysis_version: ANALYSIS_VERSION,
      }]);
    }

    emitProgress?.(100, 'Audit complete.', 'Loading your recommendations');
    return result;
}
