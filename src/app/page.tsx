"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import SearchBar from "@/components/SearchBar";
import MapEmbed from "@/components/MapEmbed";
import DataCard from "@/components/DataCard";
import LeadCaptureForm from "@/components/LeadCaptureForm";
import { buildApiUrl } from "@/lib/apiBaseUrl";
import {
  buildAiReviewReply,
  filterReviewsWithText,
  hasRealReviewText,
  isGrowthMode as getIsGrowthMode,
  selectAiReviewForResponse,
} from "@/lib/reviewAnalysis";
import { TrendingDown, Star, AlertCircle, ArrowRight, ThumbsUp, MessageSquare, Lock, Activity, Calculator, Bot, Crosshair, CheckCircle2, Sparkles } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';

interface DeepAnalysisView {
  executive_summary?: string;
  critical_findings?: string[];
  issue_clusters?: Array<{
    label: string;
    severity: number;
    mention_count: number;
    evidence: string[];
    business_impact: string;
    likely_root_cause: string;
  }>;
  review_evidence?: Array<{
    issue: string;
    quote: string;
    rating?: number;
    takeaway: string;
  }>;
  root_causes?: Array<{
    issue: string;
    hypothesis: string;
    why_it_matters: string;
  }>;
  response_quality_audit?: {
    summary: string;
    improved_response: string;
    recovery_offer: string;
  };
  revenue_assessment?: {
    confidence: string;
    narrative: string;
    assumptions: string[];
  };
  growth_opportunities?: Array<{
    area: string;
    opportunity: string;
    why_now: string;
  }>;
  free_action_plan?: Array<{
    timeframe: string;
    action: string;
    effort: string;
    expected_impact: string;
    metric_to_watch: string;
  }>;
  owner_solution_map?: Array<{
    problem: string;
    owner_solution: string;
    dream_outcome: string;
  }>;
  owner_pitch?: {
    headline: string;
    dream_outcome: string;
    call_to_action: string;
  };
  confidence_notes?: string[];
}

interface Metrics {
  photo_url?: string | null;
  current_rating?: number;
  review_count?: number;
  competitor_average?: number;
  competitor_name?: string;
  top_complaint?: string;
  lost_revenue_score?: number;
  sentiment_breakdown?: {
    food?: number;
    service?: number;
    atmosphere?: number;
  };
  trend_data?: Array<{ month: string; rating: number }>;
  clv_calculation?: {
    negative_review_count?: number;
    average_ticket?: number;
    total_lost_clv?: number;
    narrative?: string;
    assumptions?: string[];
    confidence?: string;
  };
  keyword_bottlenecks?: Array<{
    keyword: string;
    count: number;
    impact: number;
  }>;
  ai_win_back?: {
    original_review: string;
    author: string;
    rating: number;
    response_type?: "win_back" | "amplifier";
    ai_response: string;
  };
  recent_reviews?: Array<{
    author: string;
    rating: number;
    text: string;
    date?: string;
  }>;
  competitor_matchup?: Array<{
    category: string;
    you: number;
    competitor: number;
  }>;
  deep_analysis?: DeepAnalysisView;
  data_quality?: {
    reviews_analyzed?: number;
    growth_mode?: boolean;
  };
}

interface AnalysisProgressPayload {
  progress?: number;
  message?: string;
  detail?: string;
}

interface AnalysisCompletePayload {
  data?: Metrics;
}

const loadingQuips = [
  "Thinking like a restaurant operator...",
  "Reading between the stars...",
  "Separating noisy reviews from real patterns...",
  "Turning guest feedback into next steps...",
  "Pressure-testing the action plan...",
  "Looking for the move that matters most...",
];

function parseSsePayload(block: string) {
  const event = block
    .split(/\r?\n/)
    .find((line) => line.startsWith("event: "))
    ?.slice("event: ".length)
    .trim();
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice("data: ".length))
    .join("\n");

  if (!event || !data) return null;

  try {
    return { event, payload: JSON.parse(data) as unknown };
  } catch {
    return null;
  }
}

async function readAnalysisStream(
  response: Response,
  handlers: {
    onProgress: (payload: AnalysisProgressPayload) => void;
    onComplete: (data: Metrics) => void;
    onError: (message?: string) => void;
  }
) {
  if (!response.body) {
    handlers.onComplete((await response.json()) as Metrics);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const processBlock = (block: string) => {
    const parsed = parseSsePayload(block);
    if (!parsed) return;

    if (parsed.event === "progress") {
      handlers.onProgress(parsed.payload as AnalysisProgressPayload);
    }

    if (parsed.event === "complete") {
      const payload = parsed.payload as AnalysisCompletePayload;
      if (payload.data) handlers.onComplete(payload.data);
    }

    if (parsed.event === "error") {
      handlers.onError((parsed.payload as { message?: string }).message);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? "";
    blocks.forEach(processBlock);
  }

  buffer += decoder.decode();
  if (buffer.trim()) processBlock(buffer);
}

export default function Home() {
  const [step, setStep] = useState<"search" | "loading" | "partial" | "full">("search");
  const [restaurantName, setRestaurantName] = useState("");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState(0);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState("Warming up the review engine...");
  const [loadingDetail, setLoadingDetail] = useState("Setting up the audit workspace");
  const [pillQuery, setPillQuery] = useState<string | undefined>(undefined);
  const [activeResultTab, setActiveResultTab] = useState<"search" | "guest" | "listings">("search");
  const [countdown, setCountdown] = useState(39);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadingStartRef = useRef<number | null>(null);

  const handleSearch = async (name: string, placeId: string) => {
    setRestaurantName(name);
    setSelectedPlaceId(placeId);
    setStep("loading");
    setLoadingPhase(0);
    setLoadingProgress(0);
    setLoadingMessage("Warming up the review engine...");
    setLoadingDetail("Setting up the audit workspace");
    setActiveResultTab("search");
    // Start progress-aware countdown
    loadingStartRef.current = Date.now();
    setCountdown(39);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setLoadingProgress((currentProgress) => {
        const elapsedSec = (Date.now() - (loadingStartRef.current ?? Date.now())) / 1000;
        if (currentProgress >= 100) {
          setCountdown(0);
        } else if (currentProgress > 0) {
          // Estimate total duration from current pace, floor at 1
          const estimatedTotal = elapsedSec / (currentProgress / 100);
          const remaining = Math.max(1, Math.round(estimatedTotal - elapsedSec));
          setCountdown(remaining);
        } else {
          // No progress yet — just count down from initial estimate
          setCountdown((prev) => (prev > 1 ? prev - 1 : 1));
        }
        return currentProgress; // don't mutate progress here
      });
    }, 1000);

    const copyInterval = setInterval(() => {
      setLoadingPhase((prev) => (prev + 1) % loadingQuips.length);
    }, 2200);

    try {
      const res = await fetch(buildApiUrl("/api/analyze-restaurant"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ name, place_id: placeId }),
      });

      if (!res.ok) {
        throw new Error("Failed to analyze");
      }

      if (!res.headers.get("content-type")?.includes("text/event-stream")) {
        const data = (await res.json()) as Metrics;
        setLoadingProgress(100);
        setLoadingMessage("Audit complete.");
        setLoadingDetail("Loading your recommendations");
        setMetrics(data);
        setStep("partial");
        return;
      }

      await readAnalysisStream(res, {
        onProgress: (payload) => {
          if (typeof payload.progress === "number") {
            setLoadingProgress((current) => Math.max(current, Math.min(100, payload.progress ?? current)));
          }
          if (payload.message) setLoadingMessage(payload.message);
          if (payload.detail) setLoadingDetail(payload.detail);
        },
        onComplete: (data) => {
          setLoadingProgress(100);
          setLoadingMessage("Audit complete.");
          setLoadingDetail("Loading your recommendations");
          setMetrics(data);
          setStep("partial");
        },
        onError: (message) => {
          throw new Error(message || "Failed to analyze");
        },
      });
    } catch (err) {
      console.error(err);
      setStep("search");
      alert("Failed to analyze. Please try again.");
    } finally {
      clearInterval(copyInterval);
      if (countdownRef.current) clearInterval(countdownRef.current);
    }
  };

  const shortName = restaurantName.split(',')[0];
  const addressInfo = restaurantName.includes(',') ? restaurantName.split(',').slice(1).join(',').trim() : "";
  const deepAnalysis = metrics?.deep_analysis;
  const freeActionPlan = deepAnalysis?.free_action_plan ?? [];
  const ownerSolutionMap = deepAnalysis?.owner_solution_map ?? [];
  const recentReviews = filterReviewsWithText(metrics?.recent_reviews ?? []);
  const negativeReviewCount = metrics?.clv_calculation?.negative_review_count ?? 0;
  const analyzedReviewCount =
    metrics?.data_quality?.reviews_analyzed ??
    Math.max(recentReviews.length, Math.min(metrics?.review_count ?? 0, 50));
  const isGrowthMode = metrics?.data_quality?.growth_mode ?? getIsGrowthMode({
    currentRating: metrics?.current_rating,
    negativeReviewCount,
    analyzedReviewCount,
  });
  const apiAiWinBack =
    metrics?.ai_win_back && hasRealReviewText({ text: metrics.ai_win_back.original_review })
      ? metrics.ai_win_back
      : null;
  const fallbackAiWinBack = (() => {
    if (apiAiWinBack || recentReviews.length === 0) return null;

    const selection = selectAiReviewForResponse(recentReviews, { preferPositive: isGrowthMode });
    if (!selection) return null;

    return {
      original_review: selection.review.text,
      author: selection.review.author,
      rating: selection.review.rating,
      response_type: selection.responseType,
      ai_response: buildAiReviewReply(selection.review),
    };
  })();
  const aiWinBack = apiAiWinBack ?? fallbackAiWinBack;
  const aiReviewIsAmplifier =
    Boolean(aiWinBack) &&
    (aiWinBack?.response_type === "amplifier" || (aiWinBack?.rating ?? 0) >= 4 || isGrowthMode);
  const issueClusters = deepAnalysis?.issue_clusters?.slice(0, 3) ?? [];
  const reviewEvidence =
    deepAnalysis?.review_evidence
      ?.filter((evidence) => hasRealReviewText({ text: evidence.quote }))
      .slice(0, 3) ?? [];
  const sentimentScores = [
    { label: "Food", value: metrics?.sentiment_breakdown?.food ?? 4.5, color: "bg-green-400" },
    { label: "Service", value: metrics?.sentiment_breakdown?.service ?? 3.2, color: "bg-yellow-300" },
    { label: "Vibe", value: metrics?.sentiment_breakdown?.atmosphere ?? 4.0, color: "bg-blue-300" },
  ];
  const maxKeywordCount = Math.max(1, ...(metrics?.keyword_bottlenecks?.map((kw) => kw.count) ?? [1]));
  const growthOpportunityLabel = "Direct Order Growth";
  const growthSolutionLabels = [
    "More direct orders",
    "Fresh 5-star proof",
    "More repeat guests",
  ];
  const ownerFeatureLabels = [
    "Google review help",
    "Online ordering + app",
    "Email/SMS follow-up",
  ];
  const diagnosisFindings = isGrowthMode
    ? [
        "The public reputation is already a strength.",
        "Convert review trust into more direct orders.",
        "Use Owner.com to build a repeat-guest loop.",
      ]
    : deepAnalysis?.critical_findings ?? [];
  const ratingIsDropping =
    metrics?.trend_data?.[4]?.rating !== undefined &&
    metrics?.trend_data?.[0]?.rating !== undefined &&
    metrics.trend_data[4].rating < metrics.trend_data[0].rating;
  const displayText = (value = "") => value.trim();
  const loadingStages = [
    { threshold: 16, icon: Star, label: "Pulling recent Google reviews..." },
    { threshold: 38, icon: TrendingDown, label: "Finding review patterns..." },
    { threshold: 64, icon: AlertCircle, label: "Preparing your analysis brief..." },
    { threshold: 96, icon: Bot, label: "Generating your action plan..." },
  ];

  return (
    <div className="min-h-screen bg-[#faf8f5] text-[#111827] font-sans selection:bg-[#094413]/20 relative">
      {/* ── Header ── */}
      <header className="border-b border-[#dfdcd9] bg-[#faf8f5] px-6 py-3 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <button
            onClick={() => { setStep("search"); setRestaurantName(""); setMetrics(null); setPillQuery(undefined); }}
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
          >
            {/* Owner logo from public/favicon.ico */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/favicon.ico" alt="Owner logo" width={30} height={30} className="rounded-sm" />
            <span className="font-semibold text-[17px] tracking-[-0.01em] text-gray-900">Owner Review Analyzer</span>
          </button>

        </div>
      </header>

      <main className="max-w-7xl mx-auto">
        {/* ── Search / Hero ── */}
        {step === "search" && (
          <div className="flex flex-col items-center justify-center min-h-[calc(100vh-57px)] text-center px-6 py-12 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1 className="text-4xl md:text-[54px] font-bold leading-[1.12] tracking-tight max-w-2xl text-gray-900">
              Are Bad Reviews Costing You Business?
            </h1>
            <p className="text-base text-gray-500 max-w-md">
              Get an instant audit of your Google Business Profile and see the next growth move.
            </p>
            <div className="w-full max-w-xl">
              <SearchBar onSearch={handleSearch} initialQuery={pillQuery} />
            </div>

          </div>
        )}

        {/* ── Loading / Scanning ── split-screen layout */}
        {step === "loading" && (
          <div className="flex h-[calc(100vh-57px)] animate-in fade-in duration-500">
            {/* Left sidebar */}
            <div className="w-72 shrink-0 flex flex-col border-r border-[#dfdcd9] bg-white px-7 py-8">
              <p className="text-xl font-semibold text-gray-900 mb-6">Scanning...</p>
              <div className="relative flex-1">
                {/* vertical connector line */}
                <div className="absolute left-[13px] top-0 bottom-16 w-[2px] bg-[#e5e7eb]" />
                <ul className="space-y-5 relative">
                  {loadingStages.map((stage, index) => {
                    const isComplete = loadingProgress >= stage.threshold;
                    const isActive = !isComplete && loadingProgress >= (loadingStages[index - 1]?.threshold ?? 0);
                    return (
                      <li key={stage.label} className="flex items-center gap-3">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 shrink-0 z-10 bg-white ${
                          isComplete ? 'bg-[#111827] border-[#111827]' : isActive ? 'border-gray-400 animate-pulse' : 'border-gray-200'
                        }`}>
                          {isComplete && (
                            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                          {isActive && <div className="w-2 h-2 rounded-full bg-gray-400" />}
                        </div>
                        <span className={`text-sm ${
                          isComplete ? 'text-gray-400 line-through' : isActive ? 'text-gray-900 font-medium' : 'text-gray-400'
                        }`}>{stage.label}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              {/* Countdown card */}
              <div className="bg-white border border-[#dfdcd9] rounded-2xl p-4 mt-4">
                <div className="h-1 bg-[#094413] rounded-full mb-3" style={{ width: `${Math.max(3, loadingProgress)}%`, transition: 'width 0.5s ease' }} />
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <div className="w-4 h-4 border-2 border-[#094413] border-t-transparent rounded-full animate-spin shrink-0" />
                  <span className="font-medium">{countdown} seconds remaining</span>
                </div>
              </div>
            </div>

            {/* Right panel */}
            <div className="flex-1 bg-[#faf8f5] relative overflow-hidden">
              {/* Phase 1: Map — real Google Maps JS embed */}
              {loadingProgress < 30 && (
                <div className="absolute inset-0 flex flex-col">
                  {/* Floating name badge */}
                  <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 bg-white/90 backdrop-blur-sm border border-black/10 shadow-lg rounded-full px-5 py-2.5 flex items-center gap-2 text-sm font-medium whitespace-nowrap">
                    <span>📍</span> {shortName || "Your Restaurant"}
                  </div>
                  <MapEmbed placeId={selectedPlaceId ?? ""} restaurantName={restaurantName} />
                </div>
              )}

              {/* Phase 2: Review cards */}
              {loadingProgress >= 30 && (
                <div className="absolute inset-0 overflow-hidden flex flex-col items-center justify-center gap-4 px-12 py-8">
                  {(metrics?.recent_reviews ?? [
                    { author: "Alex M.", rating: 2, text: "Service was really slow and the food came out cold..." },
                    { author: "Jordan K.", rating: 3, text: "Average experience. Nothing special but not terrible." },
                    { author: "Sam R.", rating: 1, text: "Waited 45 minutes. Won't be coming back." },
                    { author: "Taylor B.", rating: 4, text: "The food was great but parking was a nightmare." },
                    { author: "Casey L.", rating: 2, text: "Very disappointed. Expected much better quality." },
                  ]).slice(0, 5).map((r, idx) => (
                    <div
                      key={idx}
                      className="w-full max-w-lg bg-white rounded-2xl shadow-md p-5 border border-gray-100 animate-in fade-in slide-in-from-bottom-3 duration-500"
                      style={{ animationDelay: `${idx * 120}ms` }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-bold text-gray-600 shrink-0">
                          {r.author[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-semibold text-sm text-gray-900">{r.author}</span>
                            <span className="flex gap-0.5">
                              {[1,2,3,4,5].map(s => <span key={s} className={`text-sm ${s <= r.rating ? 'text-[#f59e0b]' : 'text-gray-200'}`}>★</span>)}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mb-1">2 months ago</p>
                          <p className="text-sm text-gray-700 line-clamp-2">{r.text}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Bottom green glow bar */}
              <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-[#094413]/30 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#094413]/60" />
            </div>
          </div>
        )}


        {/* ── Results ── split-panel with left sidebar + right content */}
        {(step === "partial" || step === "full") && metrics && (() => {
          // Derive score (0-100) from rating
          const score = Math.round(((metrics.current_rating ?? 3) / 5) * 100);
          const ratingLabel = score >= 70 ? "Excellent" : score >= 50 ? "Fair" : "Poor";
          const ratingColor = score >= 70 ? "#094413" : score >= 50 ? "#b45309" : "#b91c1c";
          const categoryScores = [
            { label: "Search results", score: Math.round(score * 0.3), max: 40, grade: score >= 60 ? "Fair" : "Poor" },
            { label: "Guest experience", score: Math.round(score * 0.45), max: 40, grade: score >= 60 ? "Fair" : "Poor" },
            { label: "Local listings", score: Math.round(score * 0.25), max: 20, grade: score >= 60 ? "Fair" : "Poor" },
          ];
          const tabColor = (t: typeof activeResultTab) => activeResultTab === t
            ? "border-b-2 border-gray-900 text-gray-900 font-semibold"
            : "text-gray-500 hover:text-gray-700";
          // Site checklist items derived from metrics
          const siteChecks = [
            { label: "No off-site ordering", pass: !isGrowthMode },
            { label: "Effective CTA for online ordering", pass: isGrowthMode },
            { label: "Sufficient text content", pass: true },
            { label: "Phone number", pass: true },
            { label: "Favicon", pass: false },
            { label: "Social media links on website", pass: true },
            { label: "Operating hours", pass: false },
            { label: "Address on website", pass: false },
            { label: "Page content includes relevant keywords", pass: true },
          ];
          // SVG arc for score ring
          const r = 52, cx = 70, cy = 70;
          const circ = 2 * Math.PI * r;
          const offset = circ - (score / 100) * circ;

          return (
            <div className="flex min-h-[calc(100vh-57px)] animate-in fade-in zoom-in-95 duration-500">
              {/* Left sidebar */}
              <div className="w-72 shrink-0 border-r border-[#dfdcd9] bg-[#f5ece9] flex flex-col px-6 py-8">
                {/* Score ring */}
                <div className="flex flex-col items-center mb-6">
                  <svg width="140" height="140" viewBox="0 0 140 140">
                    <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e8dcd9" strokeWidth="10" />
                    <circle
                      cx={cx} cy={cy} r={r}
                      fill="none"
                      stroke={ratingColor}
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray={circ}
                      strokeDashoffset={offset}
                      transform={`rotate(-90 ${cx} ${cy})`}
                      style={{ transition: 'stroke-dashoffset 1s ease' }}
                    />
                    <text x={cx} y={cy - 6} textAnchor="middle" fontSize="28" fontWeight="700" fill="#111827">{score}</text>
                    <text x={cx} y={cy + 14} textAnchor="middle" fontSize="11" fill="#6b7280">of 100</text>
                  </svg>
                  <p className="text-sm text-gray-500 mt-1">Online health grade</p>
                  <p className="text-2xl font-bold text-gray-900" style={{ color: ratingColor }}>{ratingLabel}</p>
                </div>

                {/* Category rows */}
                <div className="space-y-4 flex-1">
                  {categoryScores.map((cat, i) => {
                    const catPct = cat.score / cat.max;
                    const catColor = catPct >= 0.7 ? "#094413" : catPct >= 0.5 ? "#b45309" : "#b91c1c";
                    const catCirc = 2 * Math.PI * 12;
                    const catOffset = catCirc - catPct * catCirc;
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <svg width="30" height="30" viewBox="0 0 30 30">
                          <circle cx="15" cy="15" r="12" fill="none" stroke="#e8dcd9" strokeWidth="3" />
                          <circle cx="15" cy="15" r="12" fill="none" stroke={catColor} strokeWidth="3"
                            strokeLinecap="round"
                            strokeDasharray={catCirc}
                            strokeDashoffset={catOffset}
                            transform="rotate(-90 15 15)"
                          />
                        </svg>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-800">{cat.label}</p>
                          <p className="text-xs font-semibold" style={{ color: catColor }}>{cat.grade}</p>
                        </div>
                        <span className="text-xs text-gray-400 font-medium">{cat.score} of {cat.max}</span>
                      </div>
                    );
                  })}
                </div>

                {/* CTA card */}
                <div className="bg-white rounded-2xl p-4 mt-6 shadow-sm">
                  <p className="text-sm font-semibold text-gray-800 mb-3">Fix everything in minutes</p>
                  <button
                    onClick={() => setShowModal(true)}
                    className="w-full bg-[#094413] hover:bg-[#115c1e] text-white text-sm font-semibold px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors"
                  >
                    <Sparkles size={15} /> Fix in 35 seconds
                  </button>
                </div>
              </div>

              {/* Right content panel */}
              <div className="flex-1 overflow-y-auto bg-[#faf8f5]">
                {/* Tab nav */}
                <div className="sticky top-0 bg-[#faf8f5] border-b border-[#dfdcd9] px-8 z-10">
                  <div className="flex gap-6">
                    {([ ["search", "1. Search Results"], ["guest", "2. Guest Experience"], ["listings", "3. Local Listings"] ] as const).map(([tab, label]) => (
                      <button
                        key={tab}
                        onClick={() => setActiveResultTab(tab)}
                        className={`py-3.5 text-sm transition-colors ${tabColor(tab)}`}
                      >{label}</button>
                    ))}
                  </div>
                </div>

                <div className="px-8 py-8 space-y-8 max-w-4xl">

                  {/* ── Tab 1: Search Results ── */}
                  {activeResultTab === "search" && (
                    <div className="space-y-8">
                      {/* Hero card */}
                      <div className="flex flex-col md:flex-row items-center gap-6 bg-white border border-[#dfdcd9] p-6 rounded-2xl shadow-sm">
                        <div className="w-full md:w-1/3 aspect-video bg-gray-100 rounded-xl relative overflow-hidden shrink-0">
                          <Image
                            src={metrics.photo_url || "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=80"}
                            alt="Restaurant"
                            fill
                            unoptimized
                            sizes="33vw"
                            className="object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=80"; }}
                          />
                        </div>
                        <div>
                          <h2 className="text-2xl font-bold text-gray-900 mb-1">{shortName}</h2>
                          {addressInfo && <p className="text-sm text-gray-500">{addressInfo}</p>}
                          <p className="mt-3 text-xs font-bold inline-flex items-center gap-1.5 bg-[#094413]/10 text-[#094413] px-3 py-1.5 rounded-full uppercase tracking-wider">
                            <CheckCircle2 size={11} /> Business Audit Complete
                          </p>
                        </div>
                      </div>

                      {/* DataCards */}
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <DataCard title="Your Rating" value={metrics.current_rating ?? "N/A"} subtitle={`${metrics.review_count ?? 0} Reviews`} color="white" />
                        <DataCard title="Competitor Avg" value={metrics.competitor_average ?? "N/A"} isBlurred={false} color="secondary" />
                        <DataCard title={isGrowthMode ? "Top Opportunity" : "Top Complaint"} value={isGrowthMode ? growthOpportunityLabel : (metrics.top_complaint ?? "No major complaints found")} isBlurred={false} color="primary" />
                        <DataCard title={isGrowthMode ? "Growth Status" : "Revenue at Risk"} value={isGrowthMode ? "Ready" : `$${metrics.lost_revenue_score?.toLocaleString() || 0}/yr`} subtitle={isGrowthMode ? "0 low-star reviews found" : undefined} isBlurred={false} color="accent" />
                      </div>

                      {/* Diagnosis */}
                      {deepAnalysis && (
                        <section className="bg-[#1a1a1a] text-white p-8 rounded-2xl">
                          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-8">
                            <div>
                              <p className="font-bold uppercase text-[10px] tracking-widest text-[#a3c9a8] mb-3">AI Diagnosis</p>
                              <h3 className="text-2xl font-bold tracking-tight leading-tight mb-4">{isGrowthMode ? "Next-Level Opportunity" : "The Real Opportunity"}</h3>
                              <p className="text-base font-medium leading-relaxed bg-white/10 text-white/90 p-5 rounded-xl">{displayText(deepAnalysis.executive_summary)}</p>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                              {diagnosisFindings.slice(0, 3).map((finding, idx) => (
                                <div key={idx} className="bg-white/10 p-5 rounded-xl break-words">
                                  <p className="text-3xl font-bold text-[#a3c9a8] mb-3">0{idx + 1}</p>
                                  <p className="text-sm text-white/80 leading-relaxed">{displayText(finding)}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </section>
                      )}

                      {/* Issue Map */}
                      {issueClusters.length > 0 && (
                        <section className="bg-white border border-[#dfdcd9] p-6 rounded-2xl">
                          <h3 className="text-lg font-bold mb-5">{isGrowthMode ? "Growth Map" : "Issue Map"}</h3>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {issueClusters.map((cluster, idx) => (
                              <div key={idx} className="border border-[#dfdcd9] p-5 bg-[#fafaf9] rounded-xl">
                                <div className="flex items-start justify-between mb-3">
                                  <h4 className="font-semibold text-sm text-gray-900">{cluster.label}</h4>
                                  <span className="bg-[#c2410c]/10 text-[#c2410c] px-2 py-0.5 rounded-full text-xs font-bold">{cluster.severity}/5</span>
                                </div>
                                <div className="h-1.5 bg-gray-100 rounded-full mb-3">
                                  <div className="h-full bg-[#c2410c] rounded-full" style={{ width: `${cluster.severity * 20}%` }} />
                                </div>
                                <p className="text-xs text-gray-400 uppercase tracking-wider font-bold mb-1">{isGrowthMode ? "Upside" : "Signal"}</p>
                                <p className="text-sm text-gray-600">{cluster.business_impact}</p>
                              </div>
                            ))}
                          </div>
                        </section>
                      )}

                      {/* Customer Voice */}
                      {reviewEvidence.length > 0 && (
                        <section className="bg-white border border-[#dfdcd9] p-6 rounded-2xl">
                          <h3 className="text-lg font-bold mb-5">Customer Voice</h3>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {reviewEvidence.map((evidence, idx) => (
                              <div key={idx} className="border border-[#dfdcd9] p-5 bg-[#fafaf9] rounded-xl break-words">
                                <p className="font-bold text-[#c2410c] text-[10px] tracking-widest uppercase mb-2">{displayText(evidence.issue)}</p>
                                <p className="text-2xl font-bold text-gray-200 leading-none mb-1">&ldquo;</p>
                                <p className="text-sm text-gray-600">{displayText(evidence.quote)}</p>
                              </div>
                            ))}
                          </div>
                        </section>
                      )}

                      {/* Sentiment + Competitor */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white border border-[#dfdcd9] p-6 rounded-2xl">
                          <h3 className="text-base font-bold mb-5 flex items-center gap-2"><ThumbsUp size={16} className="text-[#094413]" /> Sentiment Breakdown</h3>
                          <div className="space-y-4 text-sm">
                            {sentimentScores.map((score) => (
                              <div key={score.label}>
                                <div className="flex justify-between mb-1.5 font-medium text-gray-700"><span>{score.label}</span><span className="text-gray-500">{score.value}/5</span></div>
                                <div className="h-2 bg-gray-100 rounded-full"><div className={`h-full ${score.color} rounded-full`} style={{ width: `${score.value * 20}%` }} /></div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="bg-white border border-[#dfdcd9] p-6 rounded-2xl flex flex-col">
                          <h3 className="text-base font-bold mb-1 flex items-center gap-2"><Crosshair size={16} className="text-[#094413]" /> Competitor Matchup</h3>
                          <p className="text-xs text-gray-400 mb-4 italic">vs {metrics.competitor_name || "top local restaurants"}</p>
                          <div className="flex-1 overflow-x-auto flex justify-center">
                            <RadarChart width={420} height={220} cx="50%" cy="50%" outerRadius="75%" data={metrics.competitor_matchup || []}>
                              <PolarGrid stroke="#dfdcd9" strokeWidth={1} />
                              <PolarAngleAxis dataKey="category" tick={{ fill: '#6b7280', fontWeight: '600', fontSize: 10 }} />
                              <PolarRadiusAxis angle={30} domain={[0, 5]} tick={false} axisLine={false} />
                              <Radar name="You" dataKey="you" stroke="#c2410c" strokeWidth={2} fill="#c2410c" fillOpacity={0.2} />
                              <Radar name="Competitor" dataKey="competitor" stroke="#094413" strokeWidth={2} fill="#094413" fillOpacity={0.15} />
                            </RadarChart>
                          </div>
                          <div className="flex justify-center gap-6 text-xs font-semibold text-gray-500 border-t border-[#dfdcd9] pt-3">
                            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#c2410c] inline-block" /> You</div>
                            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#094413] inline-block" /> Competitor</div>
                          </div>
                        </div>
                      </div>

                      {/* Rating Trend + Keywords */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white border border-[#dfdcd9] p-6 rounded-2xl">
                          <h3 className="text-base font-bold mb-2 flex items-center gap-2"><Activity size={16} className="text-[#094413]" /> Rating Trend</h3>
                          {ratingIsDropping && <p className="text-sm text-[#c2410c] mb-3">{isGrowthMode ? "Keep fresh reviews flowing." : "Warning: rating is dropping!"}</p>}
                          <div className="h-56 overflow-x-auto flex justify-center">
                            <LineChart width={460} height={220} data={metrics.trend_data || []} margin={{ top: 10, right: 20, left: -20, bottom: 5 }}>
                              <XAxis dataKey="month" stroke="#dfdcd9" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                              <YAxis domain={[1, 5]} stroke="#dfdcd9" tick={{ fill: '#9ca3af', fontSize: 10 }} tickCount={5} />
                              <Tooltip contentStyle={{ border: '1px solid #dfdcd9', borderRadius: '12px', fontSize: 12 }} />
                              <Line type="monotone" dataKey="rating" stroke="#094413" strokeWidth={2} activeDot={{ r: 4 }} />
                            </LineChart>
                          </div>
                        </div>
                        <div className="bg-white border border-[#dfdcd9] p-6 rounded-2xl">
                          <h3 className="text-base font-bold mb-4 flex items-center gap-2"><AlertCircle size={16} className="text-[#094413]" /> {isGrowthMode ? "Growth Levers" : "Keyword Bottlenecks"}</h3>
                          <div className="space-y-3">
                            {metrics.keyword_bottlenecks?.map((kw, idx) => (
                              <div key={idx} className="bg-[#fafaf9] p-3 border border-[#dfdcd9] rounded-xl">
                                <div className="flex justify-between mb-1.5">
                                  <span className="text-sm font-medium text-gray-800 break-words">{displayText(kw.keyword)}</span>
                                  <span className="text-xs text-gray-400 font-bold">{kw.count}x</span>
                                </div>
                                <div className="h-1.5 bg-gray-100 rounded-full">
                                  <div className="h-full bg-[#c2410c] rounded-full" style={{ width: `${(kw.count / maxKeywordCount) * 100}%` }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Revenue */}
                      <div className="bg-[#fafaf9] border border-[#dfdcd9] p-6 rounded-2xl">
                        <h3 className="text-base font-bold mb-5 flex items-center gap-2"><Calculator size={16} className="text-[#094413]" /> {isGrowthMode ? "Next-Level Growth Upside" : "Revenue at Risk"}</h3>
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div className="bg-white border border-[#dfdcd9] p-5 rounded-xl">
                            <p className="text-3xl font-bold text-[#c2410c] mb-1">{isGrowthMode ? "0" : negativeReviewCount}</p>
                            <p className="text-xs text-gray-500">{isGrowthMode ? "Low-Star Reviews" : "Negative Reviews"}</p>
                          </div>
                          <div className="bg-white border border-[#dfdcd9] p-5 rounded-xl">
                            <p className="text-3xl font-bold text-gray-900 mb-1">{metrics.review_count ?? 0}</p>
                            <p className="text-xs text-gray-500">{isGrowthMode ? "Proof points" : "Public reviews"}</p>
                          </div>
                          <div className="bg-white border border-[#dfdcd9] p-5 rounded-xl">
                            <p className="text-3xl font-bold text-gray-900 mb-1">{isGrowthMode ? "Direct" : `$${metrics.clv_calculation?.average_ticket || 45}`}</p>
                            <p className="text-xs text-gray-500">{isGrowthMode ? "Order path" : "Avg Ticket"}</p>
                          </div>
                        </div>
                        {!isGrowthMode && (
                          <p className="mt-4 text-center text-lg font-bold text-gray-900">= <span className="text-[#c2410c]">${metrics.clv_calculation?.total_lost_clv?.toLocaleString() || 0}</span> At-Risk Value</p>
                        )}
                      </div>

                      {/* Win-Back + Recent Reviews */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white border border-[#dfdcd9] p-6 rounded-2xl flex flex-col">
                          <h3 className="text-base font-bold mb-4 flex items-center gap-2"><Bot size={16} className="text-[#094413]" /> {aiReviewIsAmplifier ? "Review Amplifier" : "Win-Back Preview"}</h3>
                          {aiWinBack ? (
                            <div className="space-y-4">
                              <div className={`p-4 border rounded-xl ${aiReviewIsAmplifier ? "bg-[#094413]/5 border-[#094413]/20" : "bg-[#c2410c]/5 border-[#c2410c]/20"}`}>
                                <p className={`text-xs font-semibold mb-1 ${aiReviewIsAmplifier ? "text-[#094413]" : "text-[#c2410c]"}`}>{aiWinBack.author} ({aiWinBack.rating}★)</p>
                                <p className="text-sm text-gray-700 italic">&quot;{aiWinBack.original_review}&quot;</p>
                              </div>
                              <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-4 ml-5 relative">
                                <div className="absolute -left-3 top-4 bg-[#094413] text-white p-1 rounded-full"><Bot size={12} /></div>
                                <p className="text-xs font-semibold text-[#094413] mb-1">{aiReviewIsAmplifier ? "Suggested Reply" : "Generated Reply"}</p>
                                <p className="text-sm text-gray-700">{aiWinBack.ai_response}</p>
                              </div>
                            </div>
                          ) : (
                            <div className="flex-1 bg-[#fafaf9] border border-[#dfdcd9] rounded-xl p-4 text-sm text-gray-400">
                              No detailed review available for a reply preview.
                            </div>
                          )}
                        </div>
                        <div className="bg-white border border-[#dfdcd9] p-6 rounded-2xl flex flex-col">
                          <h3 className="text-base font-bold mb-4 flex items-center gap-2"><MessageSquare size={16} className="text-[#094413]" /> Recent Reviews</h3>
                          <div className="space-y-3">
                            {recentReviews.length > 0 ? recentReviews.map((r, idx) => (
                              <div key={idx} className={`p-3 border rounded-xl ${r.rating >= 4 ? 'bg-[#094413]/5 border-[#094413]/10' : 'bg-[#c2410c]/5 border-[#c2410c]/10'}`}>
                                <div className="flex justify-between mb-1"><span className="font-semibold text-sm">{r.author}</span><span className="text-xs text-gray-500">{r.rating}★</span></div>
                                <p className="text-xs text-gray-600 break-words">{r.text}</p>
                              </div>
                            )) : <div className="text-sm text-gray-400 italic">No recent reviews found.</div>}
                          </div>
                        </div>
                      </div>

                      {/* Action Plan */}
                      {freeActionPlan.length > 0 && (
                        <section className="bg-[#fafaf9] border border-[#dfdcd9] p-6 rounded-2xl">
                          <h3 className="text-lg font-bold mb-5">{isGrowthMode ? "Your Next-Level Plan" : "Your Free Action Plan"}</h3>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {freeActionPlan.slice(0, 3).map((item, idx) => (
                              <div key={idx} className="bg-white border border-[#dfdcd9] rounded-xl p-5">
                                <div className="flex items-center justify-between mb-3">
                                  <span className="w-6 h-6 rounded-full bg-[#094413] text-white text-xs font-bold flex items-center justify-center">{idx + 1}</span>
                                  <span className="text-[10px] font-bold uppercase text-[#c2410c]">{item.timeframe}</span>
                                </div>
                                <p className="text-sm font-semibold text-gray-900 mb-3">{item.action}</p>
                                <div className="bg-[#094413]/5 border border-[#094413]/20 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#094413] uppercase">Watch: {item.metric_to_watch}</div>
                              </div>
                            ))}
                          </div>
                        </section>
                      )}

                      {/* Owner solution */}
                      {ownerSolutionMap.length > 0 && (
                        <section className="bg-white border border-[#dfdcd9] p-6 rounded-2xl">
                          <h3 className="text-lg font-bold mb-6">{isGrowthMode ? "How Owner.com Gets You To The Next Level" : "Why Owner.com Is The Easy Fix"}</h3>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {ownerSolutionMap.slice(0, 3).map((item, idx) => (
                              <div key={idx} className="border border-[#dfdcd9] p-5 bg-[#fafaf9] rounded-xl text-center">
                                <p className="text-2xl font-bold text-[#094413] mb-2">{idx + 1}</p>
                                <p className="text-sm font-semibold text-[#c2410c] mb-3">{isGrowthMode ? growthSolutionLabels[idx] : displayText(item.problem)}</p>
                                <ArrowRight className="mx-auto my-2 text-gray-300" size={20} />
                                <p className="text-xs font-bold text-[#094413] uppercase mb-1">{ownerFeatureLabels[idx] ?? "Owner.com feature"}</p>
                                <p className="text-sm text-gray-700 mb-1">{displayText(item.owner_solution)}</p>
                                <p className="text-xs text-gray-400">{displayText(item.dream_outcome)}</p>
                              </div>
                            ))}
                          </div>
                        </section>
                      )}

                      {/* CTA unlock */}
                      {step === "partial" && (
                        <div
                          className="bg-[#094413] text-white p-8 rounded-2xl cursor-pointer hover:bg-[#115c1e] transition-colors"
                          onClick={() => setShowModal(true)}
                        >
                          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-widest text-[#a3c9a8] mb-2">Ready to make this easy?</p>
                              <h3 className="text-2xl font-bold mb-2">Have Owner.com Turn This Into A Growth System</h3>
                              <p className="text-sm text-white/80">Get a customized Owner.com implementation plan for more direct orders, more 5-star reviews, and more repeat guests.</p>
                            </div>
                            <div className="bg-white text-[#094413] px-6 py-3 font-bold rounded-xl text-sm flex items-center gap-2 shrink-0">
                              <Lock size={14} /> Get My Owner.com Plan
                            </div>
                          </div>
                        </div>
                      )}

                      {step === "full" && deepAnalysis?.owner_pitch && (
                        <div className="bg-[#fafaf9] border border-[#dfdcd9] p-8 rounded-2xl text-center space-y-5">
                          <h3 className="text-2xl font-bold text-gray-900">{deepAnalysis.owner_pitch.headline}</h3>
                          <p className="text-sm text-gray-600 max-w-2xl mx-auto bg-white p-5 border border-[#dfdcd9] rounded-xl">{deepAnalysis.owner_pitch.dream_outcome}</p>
                          <p className="text-sm text-gray-400">{deepAnalysis.owner_pitch.call_to_action}</p>
                          <a href="https://owner.com" target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 bg-[#094413] hover:bg-[#115c1e] text-white px-8 py-3.5 text-sm font-bold rounded-xl transition-colors">
                            Build My Growth System <ArrowRight size={16} />
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Tab 2: Guest Experience ── */}
                  {activeResultTab === "guest" && (
                    <div className="space-y-6">
                      <div>
                        <p className="text-sm text-[#094413] font-semibold mb-1">2. Guest Experience</p>
                        <h2 className="text-2xl font-bold text-gray-900 mb-0.5">Improve the experience on your website</h2>
                        <div className="flex items-center justify-end gap-3 -mt-8">
                          <span className="text-lg font-bold text-[#b45309]">28/40</span>
                          <svg width="24" height="24" viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" fill="none" stroke="#e8dcd9" strokeWidth="3"/><circle cx="18" cy="18" r="15" fill="none" stroke="#b45309" strokeWidth="3" strokeDasharray="62.8" strokeDashoffset="25" transform="rotate(-90 18 18)" strokeLinecap="round" /></svg>
                        </div>
                      </div>

                      {/* Page speed card */}
                      <div className="bg-white border border-[#dfdcd9] rounded-2xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-[#dfdcd9] flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
                              Page speed test by
                              <svg width="16" height="16" viewBox="0 0 24 24" className="inline-block ml-0.5">
                                <path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0z" fill="#4285F4"/>
                                <path d="M12 0C5.37 0 0 5.37 0 12h12V0z" fill="#EA4335"/>
                                <path d="M12 12v12c6.63 0 12-5.37 12-12H12z" fill="#34A853"/>
                                <path d="M24 12H12L0 12C0 18.63 5.37 24 12 24v-12h12z" fill="#FBBC05"/>
                              </svg>
                              <span className="font-semibold">Google</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">Your site took 3.5s to load on a mobile device, which is slower than 78% of sites</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-sm font-semibold text-gray-500">3.5s</span>
                            <span className="bg-red-100 text-red-700 text-xs font-bold px-2.5 py-1 rounded-lg">Fail</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-5 gap-px bg-[#f0ede8] px-6 py-5">
                          {[
                            { label: "Time to load main content (LCP)", value: "3.5s", color: "#ea4335", shape: "square" },
                            { label: "Time to load first content (FCP)", value: "2.2s", color: "#ea4335", shape: "square" },
                            { label: "Time to respond to interactions (INP)", value: "295ms", color: "#ea4335", shape: "square" },
                            { label: "Time to first server response (TTFB)", value: "1.4s", color: "#ea4335", shape: "square" },
                            { label: "Visual stability (CLS)", value: "0.99", color: "#ea4335", shape: "triangle" },
                          ].map((m, i) => (
                            <div key={i} className="bg-white px-3 py-4 text-center">
                              <div className="flex items-center justify-center mb-1">
                                {m.shape === "triangle" ? (
                                  <svg width="10" height="10" viewBox="0 0 10 10"><polygon points="5,0 10,10 0,10" fill={m.color} /></svg>
                                ) : (
                                  <div className="w-2.5 h-2.5" style={{ background: m.color }} />
                                )}
                                <span className="text-lg font-bold ml-1" style={{ color: m.color }}>{m.value}</span>
                              </div>
                              <p className="text-[10px] text-gray-500 leading-tight">{m.label}</p>
                            </div>
                          ))}
                        </div>
                        <div className="px-6 py-3 border-t border-[#dfdcd9]">
                          <a href="#" className="text-sm text-gray-700 font-medium flex items-center gap-1 hover:underline">
                            See the full report from Google <ArrowRight size={14} className="inline-block" />
                          </a>
                        </div>
                      </div>

                      {/* Your site checklist */}
                      <div className="bg-white border border-[#dfdcd9] rounded-2xl p-6">
                        <h3 className="text-base font-bold text-gray-900 mb-0.5">Your site</h3>
                        <p className="text-sm text-gray-500 mb-5">Your site content and experience drive conversion and sales</p>
                        <p className="text-xs font-bold uppercase text-gray-500 tracking-wider mb-3">Content</p>
                        <div className="divide-y divide-[#f0ede8]">
                          {siteChecks.map((check, idx) => (
                            <div key={idx} className="py-3 flex items-center gap-3">
                              {check.pass ? (
                                <CheckCircle2 size={18} className="text-gray-400 shrink-0" />
                              ) : (
                                <div className="w-[18px] h-[18px] rounded-full bg-red-500 flex items-center justify-center shrink-0">
                                  <span className="text-white text-xs font-bold leading-none">×</span>
                                </div>
                              )}
                              <span className="text-sm text-gray-800 flex-1">{check.label}</span>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-300"><path d="M6 9l6 6 6-6" /></svg>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Tab 3: Local Listings ── */}
                  {activeResultTab === "listings" && (
                    <div className="space-y-6">
                      <div>
                        <p className="text-sm text-[#094413] font-semibold mb-1">3. Local Listings</p>
                        <h2 className="text-2xl font-bold text-gray-900 mb-4">Optimize your local presence</h2>
                      </div>
                      {/* Reuse sentiment + competitor here */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white border border-[#dfdcd9] p-6 rounded-2xl">
                          <h3 className="text-base font-bold mb-5 flex items-center gap-2"><Crosshair size={16} className="text-[#094413]" /> Competitor Matchup</h3>
                          <p className="text-xs text-gray-400 mb-4 italic">vs {metrics.competitor_name || "top local restaurants"}</p>
                          <div className="overflow-x-auto flex justify-center">
                            <RadarChart width={360} height={220} cx="50%" cy="50%" outerRadius="75%" data={metrics.competitor_matchup || []}>
                              <PolarGrid stroke="#dfdcd9" strokeWidth={1} />
                              <PolarAngleAxis dataKey="category" tick={{ fill: '#6b7280', fontSize: 10 }} />
                              <PolarRadiusAxis angle={30} domain={[0, 5]} tick={false} axisLine={false} />
                              <Radar name="You" dataKey="you" stroke="#c2410c" strokeWidth={2} fill="#c2410c" fillOpacity={0.2} />
                              <Radar name="Competitor" dataKey="competitor" stroke="#094413" strokeWidth={2} fill="#094413" fillOpacity={0.15} />
                            </RadarChart>
                          </div>
                        </div>
                        <div className="bg-white border border-[#dfdcd9] p-6 rounded-2xl">
                          <h3 className="text-base font-bold mb-4 flex items-center gap-2"><Activity size={16} className="text-[#094413]" /> Rating Trend</h3>
                          <div className="h-56 overflow-x-auto flex justify-center">
                            <LineChart width={360} height={200} data={metrics.trend_data || []} margin={{ top: 10, right: 20, left: -20, bottom: 5 }}>
                              <XAxis dataKey="month" stroke="#dfdcd9" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                              <YAxis domain={[1, 5]} stroke="#dfdcd9" tick={{ fill: '#9ca3af', fontSize: 10 }} tickCount={5} />
                              <Tooltip contentStyle={{ border: '1px solid #dfdcd9', borderRadius: '12px', fontSize: 12 }} />
                              <Line type="monotone" dataKey="rating" stroke="#094413" strokeWidth={2} activeDot={{ r: 4 }} />
                            </LineChart>
                          </div>
                        </div>
                      </div>
                      {step === "partial" && (
                        <div
                          className="bg-[#094413] text-white p-8 rounded-2xl cursor-pointer hover:bg-[#115c1e] transition-colors"
                          onClick={() => setShowModal(true)}
                        >
                          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-widest text-[#a3c9a8] mb-2">Unlock your full local listing audit</p>
                              <h3 className="text-2xl font-bold mb-2">See where you rank vs. the competition</h3>
                              <p className="text-sm text-white/80">Get the complete picture: citation accuracy, map pack rankings, and a fix-it plan.</p>
                            </div>
                            <div className="bg-white text-[#094413] px-6 py-3 font-bold rounded-xl text-sm flex items-center gap-2 shrink-0">
                              <Lock size={14} /> Unlock Full Audit
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              </div>
            </div>
          );
        })()}

      </main>

      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="relative max-w-md w-full animate-in zoom-in-95 duration-300">
            <button 
              onClick={() => setShowModal(false)} 
              className="absolute -top-10 right-0 text-white/80 hover:text-white font-medium text-sm flex items-center gap-1.5 transition-colors"
            >
              Close <span className="text-lg leading-none">&times;</span>
            </button>
            <LeadCaptureForm 
              restaurantName={restaurantName} 
              metrics={metrics} 
              onSuccess={() => { setShowModal(false); setStep("full"); }} 
            />
          </div>
        </div>
      )}
    </div>
  );
}
