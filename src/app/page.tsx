"use client";

import { useState } from "react";
import Image from "next/image";
import SearchBar from "@/components/SearchBar";
import DataCard from "@/components/DataCard";
import LeadCaptureForm from "@/components/LeadCaptureForm";
import { buildApiUrl } from "@/lib/apiBaseUrl";
import {
  filterReviewsWithText,
  hasRealReviewText,
  isGrowthMode as getIsGrowthMode,
} from "@/lib/reviewAnalysis";
import { TrendingDown, Star, AlertCircle, ArrowRight, ThumbsUp, MessageSquare, Lock, Activity, Calculator, Bot, Crosshair } from "lucide-react";
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

  const handleSearch = async (name: string, placeId: string) => {
    setRestaurantName(name);
    setStep("loading");
    setLoadingPhase(0);
    setLoadingProgress(0);
    setLoadingMessage("Warming up the review engine...");
    setLoadingDetail("Setting up the audit workspace");

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
    }
  };

  const shortName = restaurantName.split(',')[0];
  const addressInfo = restaurantName.includes(',') ? restaurantName.split(',').slice(1).join(',').trim() : "";
  const deepAnalysis = metrics?.deep_analysis;
  const freeActionPlan = deepAnalysis?.free_action_plan ?? [];
  const ownerSolutionMap = deepAnalysis?.owner_solution_map ?? [];
  const recentReviews = filterReviewsWithText(metrics?.recent_reviews ?? []);
  const aiWinBack =
    metrics?.ai_win_back && hasRealReviewText({ text: metrics.ai_win_back.original_review })
      ? metrics.ai_win_back
      : null;
  const negativeReviewCount = metrics?.clv_calculation?.negative_review_count ?? 0;
  const analyzedReviewCount =
    metrics?.data_quality?.reviews_analyzed ??
    Math.max(recentReviews.length, Math.min(metrics?.review_count ?? 0, 50));
  const isGrowthMode = metrics?.data_quality?.growth_mode ?? getIsGrowthMode({
    currentRating: metrics?.current_rating,
    negativeReviewCount,
    analyzedReviewCount,
  });
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
  const shortText = (value = "", max = 110) =>
    value.length > max ? `${value.slice(0, max).trimEnd()}...` : value;
  const firstSentence = (value = "", max = 120) => {
    const sentence = value.match(/^[^.!?]+[.!?]/)?.[0] ?? value;
    return shortText(sentence, max);
  };
  const loadingStages = [
    { threshold: 16, icon: Star, label: "Pulling recent Google reviews..." },
    { threshold: 38, icon: TrendingDown, label: "Finding review patterns..." },
    { threshold: 64, icon: AlertCircle, label: "Preparing the AI brief..." },
    { threshold: 96, icon: Bot, label: "Generating AI action plan..." },
  ];

  return (
    <div className="min-h-screen bg-[#fdfdfd] text-black font-sans selection:bg-yellow-300 relative">
      <header className="border-b-4 border-black bg-white p-6 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <button 
            onClick={() => { setStep("search"); setRestaurantName(""); setMetrics(null); }}
            className="text-3xl font-black uppercase tracking-tighter flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <span className="bg-[#facc15] px-2 py-1 border-2 border-black">Owner</span>
            <span>Review Analyzer</span>
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 py-12 md:py-24">
        {step === "search" && (
          <div className="text-center space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-5xl md:text-7xl font-black uppercase leading-[1.1] max-w-4xl mx-auto">
              Are <span className="text-[#ef4444] inline-block -rotate-2 bg-black px-4 py-2 border-4 border-black shadow-[8px_8px_0px_0px_#ef4444]">Bad Reviews</span><br/> Costing You Business?
            </h2>
            <p className="text-xl md:text-2xl font-bold max-w-2xl mx-auto bg-yellow-100 p-4 border-2 border-black inline-block">
              Get an instant audit of your Google Business Profile and see the next growth move.
            </p>
            <div className="pt-8">
              <SearchBar onSearch={handleSearch} />
            </div>
          </div>
        )}

        {step === "loading" && (
          <div className="text-center space-y-8 py-20 animate-in fade-in duration-500">
            <div className="inline-block w-full max-w-3xl p-8 md:p-12 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] bg-[#facc15] relative overflow-hidden">
              <div className="absolute top-0 left-0 h-2 bg-black animate-pulse w-full"></div>
              <h2 className="text-4xl font-black uppercase mb-4">Analyzing {shortName}...</h2>
              <p className="text-2xl font-black uppercase bg-white border-4 border-black px-4 py-3 inline-block">
                {loadingMessage}
              </p>
              <p className="mt-4 text-lg font-bold text-black/80">{loadingDetail}</p>
              <p className="mt-2 text-base font-black uppercase tracking-wide bg-black text-white inline-block px-3 py-1">
                {loadingQuips[loadingPhase]}
              </p>

              <div className="mt-8 text-left">
                <div className="flex items-end justify-between mb-2">
                  <span className="font-black uppercase">Live AI Progress</span>
                  <span className="font-black text-2xl">{Math.round(loadingProgress)}%</span>
                </div>
                <div className="h-8 border-4 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
                  <div
                    className="h-full bg-green-400 transition-[width] duration-500 ease-out"
                    style={{ width: `${Math.max(3, loadingProgress)}%` }}
                  />
                </div>
              </div>

              <ul className="text-xl font-bold space-y-5 text-left relative z-10 mt-8">
                {loadingStages.map((stage, index) => {
                  const Icon = stage.icon;
                  const isComplete = loadingProgress >= stage.threshold;
                  const isActive =
                    !isComplete &&
                    loadingProgress >= (loadingStages[index - 1]?.threshold ?? 0);

                  return (
                    <li
                      key={stage.label}
                      className={`flex items-center gap-4 transition-opacity duration-500 ${
                        isComplete || isActive ? "opacity-100" : "opacity-50"
                      }`}
                    >
                      <div className={`p-2 border-2 border-black ${isComplete ? 'bg-green-400' : 'bg-white'}`}>
                        <Icon className={isActive ? "animate-pulse" : ""} />
                      </div>
                      {stage.label}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}

        {(step === "partial" || step === "full") && metrics && (
          <div className="space-y-12 animate-in fade-in zoom-in-95 duration-500">
            <div className="flex flex-col md:flex-row items-center gap-8 bg-white border-4 border-black p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
              <div className="w-full md:w-1/3 aspect-video bg-gray-200 border-4 border-black relative overflow-hidden">
                <Image 
                  src={metrics.photo_url || "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=80"}
                  alt="Restaurant Location"
                  fill
                  unoptimized
                  sizes="(min-width: 768px) 33vw, 100vw"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // Fallback to generic image if API image fails
                    (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=80";
                  }}
                />
              </div>
              <div className="w-full md:w-2/3 text-left">
                <h2 className="text-4xl md:text-5xl font-black uppercase mb-2 bg-[#facc15] inline-block px-4 py-1 border-4 border-black">
                  {shortName}
                </h2>
                {addressInfo && (
                  <p className="text-xl font-bold mt-2 text-gray-800 uppercase max-w-2xl">
                    {addressInfo}
                  </p>
                )}
                <p className="mt-4 font-bold text-xl inline-flex items-center gap-2 bg-black text-white px-3 py-1 uppercase">
                  Business Audit Complete
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <DataCard 
                title="Your Rating" 
                value={metrics.current_rating ?? "N/A"} 
                subtitle={`${metrics.review_count ?? 0} Reviews`} 
                color="white"
              />
              <DataCard 
                title="Competitor Avg" 
                value={metrics.competitor_average ?? "N/A"} 
                isBlurred={false} 
                color="secondary"
              />
              <DataCard 
                title={isGrowthMode ? "Top Opportunity" : "Top Complaint"} 
                value={isGrowthMode ? growthOpportunityLabel : (metrics.top_complaint ?? "No major complaints found")} 
                isBlurred={false} 
                color="primary"
              />
              <DataCard 
                title={isGrowthMode ? "Growth Status" : "Revenue at Risk"} 
                value={isGrowthMode ? "Ready" : `$${metrics.lost_revenue_score?.toLocaleString() || 0}/yr`} 
                subtitle={isGrowthMode ? "0 low-star reviews found" : undefined}
                isBlurred={false} 
                color="accent"
              />
            </div>

            {deepAnalysis && (
              <section className="bg-black text-white border-4 border-black p-8 md:p-10 shadow-[8px_8px_0px_0px_#facc15]">
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-8">
                  <div>
                    <p className="font-black uppercase text-[#facc15] mb-3">AI Diagnosis</p>
                    <h3 className="text-3xl md:text-4xl font-black uppercase leading-tight mb-4">
                      {isGrowthMode ? "Next-Level Opportunity" : "The Real Opportunity"}
                    </h3>
                    <p className="text-xl font-black leading-tight bg-white text-black p-5 border-4 border-[#facc15]">
                      {firstSentence(deepAnalysis.executive_summary, 135)}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {diagnosisFindings.slice(0, 3).map((finding, idx) => (
                      <div key={idx} className="bg-white text-black p-5 border-4 border-[#facc15] min-h-40">
                        <p className="text-5xl font-black text-red-500 mb-3">0{idx + 1}</p>
                        <p className="font-black text-sm leading-tight">{shortText(finding, 85)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {issueClusters.length > 0 && (
              <section className="bg-white border-4 border-black p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                <h3 className="text-3xl font-black uppercase mb-6">{isGrowthMode ? "Growth Map" : "Issue Map"}</h3>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {issueClusters.map((cluster, idx) => (
                    <div key={idx} className="border-4 border-black p-5 bg-yellow-50 min-h-56">
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <h4 className="font-black text-xl uppercase leading-tight">{cluster.label}</h4>
                        <span className="bg-red-500 text-white border-2 border-black px-2 py-1 font-black text-sm">
                          {cluster.severity}/5
                        </span>
                      </div>
                      <div className="h-5 bg-white border-2 border-black mb-4">
                        <div
                          className="h-full bg-red-500"
                          style={{ width: `${Math.min(100, Math.max(8, cluster.severity * 20))}%` }}
                        />
                      </div>
                      <p className="font-black text-sm uppercase mb-2">{isGrowthMode ? "Upside" : "Signal"}</p>
                      <p className="font-bold text-sm leading-snug">{cluster.business_impact}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {reviewEvidence.length > 0 && (
              <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white border-4 border-black p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] lg:col-span-2">
                  <h3 className="text-2xl font-black uppercase mb-6">Customer Voice</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {reviewEvidence.map((evidence, idx) => (
                      <div key={idx} className="border-2 border-black p-4 bg-gray-50">
                        <p className="font-black uppercase text-red-600 mb-3 text-sm">{shortText(evidence.issue, 34)}</p>
                        <p className="text-4xl font-black text-gray-300 leading-none mb-1">&ldquo;</p>
                        <p className="font-bold text-sm leading-snug">{shortText(evidence.quote, 95)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* Row 1: Sentiment & Competitor Matchup */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-white border-4 border-black p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                <h3 className="text-2xl font-black uppercase mb-6 flex items-center gap-2"><ThumbsUp /> Sentiment Breakdown</h3>
                <div className="space-y-5 font-bold text-lg">
                  {sentimentScores.map((score) => (
                    <div key={score.label}>
                      <div className="flex justify-between mb-2">
                        <span>{score.label}</span>
                        <span>{score.value}/5</span>
                      </div>
                      <div className="h-5 bg-gray-100 border-2 border-black">
                        <div className={`h-full ${score.color}`} style={{ width: `${Math.min(100, score.value * 20)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border-4 border-black p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between">
                <div>
                  <h3 className="text-2xl font-black uppercase mb-2 flex items-center gap-2"><Crosshair /> Competitor Matchup</h3>
                  <p className="font-bold text-sm mb-1 text-gray-800">You vs Top Local Competitors</p>
                  <p className="text-xs text-gray-600 font-medium mb-4 italic">*Aggregated from: {metrics.competitor_name || "highest-rated local restaurants"}.</p>
                </div>
                <div className="h-[250px] w-full mt-auto overflow-x-auto flex justify-center">
                    <RadarChart width={500} height={250} cx="50%" cy="50%" outerRadius="75%" data={metrics.competitor_matchup || []}>
                      <PolarGrid stroke="#000" strokeWidth={2} />
                      <PolarAngleAxis dataKey="category" tick={{ fill: '#000', fontWeight: '900', fontSize: 12 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 5]} tick={false} axisLine={false} />
                      <Radar name="You" dataKey="you" stroke="#ef4444" strokeWidth={4} fill="#ef4444" fillOpacity={0.6} />
                      <Radar name="Competitor" dataKey="competitor" stroke="#3b82f6" strokeWidth={4} fill="#3b82f6" fillOpacity={0.6} />
                    </RadarChart>
                </div>
                <div className="flex justify-center gap-6 mt-4 font-bold uppercase text-sm border-t-4 border-black pt-4">
                  <div className="flex items-center gap-2"><span className="w-4 h-4 bg-[#ef4444] border-2 border-black inline-block"></span> You</div>
                  <div className="flex items-center gap-2"><span className="w-4 h-4 bg-[#3b82f6] border-2 border-black inline-block"></span> Competitor</div>
                </div>
              </div>
            </div>

            {/* Row 2: Trend & Keywords */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-white border-4 border-black p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                <h3 className="text-2xl font-black uppercase mb-2 flex items-center gap-2"><Activity /> Rating Trend</h3>
                {ratingIsDropping && (
                  <p className="font-bold text-sm mb-4 text-red-600">
                    {isGrowthMode ? "Keep fresh reviews flowing." : "Warning: Your rating is dropping!"}
                  </p>
                )}
                <div className="h-64 w-full mt-4 overflow-x-auto flex justify-center">
                    <LineChart width={500} height={250} data={metrics.trend_data || []} margin={{ top: 10, right: 30, left: -20, bottom: 5 }}>
                      <XAxis dataKey="month" stroke="#000" tick={{ fill: '#000', fontWeight: 'bold', fontSize: 12 }} />
                      <YAxis domain={[1, 5]} stroke="#000" tick={{ fill: '#000', fontWeight: 'bold' }} tickCount={5} />
                      <Tooltip contentStyle={{ border: '4px solid black', fontWeight: 'bold', borderRadius: 0, boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }} />
                      <Line type="monotone" dataKey="rating" stroke="#facc15" strokeWidth={6} activeDot={{ r: 8, stroke: '#000', strokeWidth: 3 }} />
                    </LineChart>
                </div>
              </div>

              <div className="bg-white border-4 border-black p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                <h3 className="text-2xl font-black uppercase mb-6 flex items-center gap-2"><AlertCircle /> {isGrowthMode ? "Growth Levers" : "Keyword Bottlenecks"}</h3>
                <div className="space-y-4">
                  {metrics.keyword_bottlenecks?.map((kw, idx) => (
                    <div key={idx} className="bg-red-50 p-4 border-2 border-black">
                      <div className="flex justify-between gap-3 mb-2">
                        <span className="font-black text-lg text-red-600 uppercase">{shortText(kw.keyword, 30)}</span>
                        <span className="bg-black text-white font-black px-2 py-1 text-sm">{kw.count}x</span>
                      </div>
                      <div className="h-4 bg-white border-2 border-black">
                        <div
                          className="h-full bg-red-500"
                          style={{ width: `${Math.min(100, Math.max(8, (kw.count / maxKeywordCount) * 100))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Row 3: CLV Calculation */}
            <div className="bg-[#facc15] border-4 border-black p-8 md:p-12 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
              <h3 className="text-3xl font-black uppercase mb-6 flex items-center gap-2"><Calculator /> {isGrowthMode ? "Next-Level Growth Upside" : "Revenue at Risk"}</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-bold text-xl">
                <div className="bg-white p-6 border-4 border-black text-center">
                  <p className="text-5xl font-black text-red-600 mb-2">{isGrowthMode ? "0" : negativeReviewCount}</p>
                  <p>{isGrowthMode ? "Low-Star Reviews" : "Negative Reviews"}</p>
                </div>
                <div className="bg-white p-6 border-4 border-black text-center">
                  <p className="text-5xl font-black mb-2">{metrics.review_count ?? 0}</p>
                  <p className="text-sm">{isGrowthMode ? "Proof points to amplify" : "Public reviews"}</p>
                </div>
                <div className="bg-white p-6 border-4 border-black text-center">
                  <p className="text-5xl font-black mb-2">{isGrowthMode ? "Direct" : `$${metrics.clv_calculation?.average_ticket || 45}`}</p>
                  <p>{isGrowthMode ? "Order growth path" : "Avg Ticket Size"}</p>
                </div>
              </div>
              {!isGrowthMode && (
                <div className="mt-8 text-center text-3xl font-black uppercase">
                  = <span className="bg-white px-4 py-2 border-4 border-black text-red-600">${metrics.clv_calculation?.total_lost_clv?.toLocaleString() || 0}</span> At-Risk Value
                </div>
              )}
              {(metrics.clv_calculation?.narrative || deepAnalysis?.revenue_assessment?.narrative) && (
                <div className="mt-8 bg-white border-4 border-black p-5 font-bold text-lg text-center">
                  <p>
                    {isGrowthMode
                      ? "The review profile is strong. The upside is turning trust into more direct orders and repeat guests."
                      : firstSentence(metrics.clv_calculation?.narrative || deepAnalysis?.revenue_assessment?.narrative, 125)}
                  </p>
                  <p className="text-sm uppercase mt-3 text-gray-700">
                    Confidence: {metrics.clv_calculation?.confidence || deepAnalysis?.revenue_assessment?.confidence || "directional"}
                  </p>
                </div>
              )}
            </div>

            {/* Row 4: AI Win-Back & Recent Reviews */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-white border-4 border-black p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col">
                <h3 className="text-2xl font-black uppercase mb-6 flex items-center gap-2"><Bot /> {aiReviewIsAmplifier ? "AI Review Amplifier" : "AI Win-Back Preview"}</h3>
                
                {aiWinBack && (
                  <div className="space-y-6">
                    <div className={`${aiReviewIsAmplifier ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"} p-4 border-2 rounded-bl-none`}>
                      <p className={`font-bold text-xs mb-1 ${aiReviewIsAmplifier ? "text-green-700" : "text-red-600"}`}>{aiWinBack.author} ({aiWinBack.rating} ★)</p>
                      <p className="text-sm italic">&quot;{aiWinBack.original_review}&quot;</p>
                    </div>
                    
                    <div className="bg-blue-50 p-4 border-2 border-blue-200 rounded-br-none ml-8 relative">
                      <div className="absolute -left-6 top-4 bg-blue-500 text-white p-1 rounded-full"><Bot size={16} /></div>
                      <p className="font-bold text-xs text-blue-600 mb-1">{aiReviewIsAmplifier ? "AI Suggested Reply" : "AI Generated Reply"}</p>
                      <p className="text-sm font-medium">{aiWinBack.ai_response}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-white border-4 border-black p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col">
                <h3 className="text-2xl font-black uppercase mb-6 flex items-center gap-2"><MessageSquare /> Recent Reviews</h3>
                <div className="space-y-4">
                  {recentReviews.length > 0 ? (
                    recentReviews.map((r, idx) => (
                      <div key={idx} className={`p-4 border-2 border-black ${r.rating >= 4 ? 'bg-green-50' : 'bg-red-50'}`}>
                        <div className="flex justify-between mb-2">
                          <span className="font-bold">{r.author}</span>
                          <span className="font-black bg-white px-2 border-2 border-black">{r.rating} ★</span>
                        </div>
                        <p className="text-sm line-clamp-3">{r.text}</p>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 border-2 border-black bg-gray-50 italic">No recent reviews found.</div>
                  )}
                </div>
              </div>
            </div>

            {freeActionPlan.length > 0 && (
              <section className="mt-12 bg-[#facc15] border-4 border-black p-8 md:p-12 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                <h3 className="text-4xl font-black uppercase mb-3">{isGrowthMode ? "Your Next-Level Plan" : "Your Free Action Plan"}</h3>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {freeActionPlan.slice(0, 3).map((item, idx) => (
                    <div key={idx} className="bg-white border-4 border-black p-6">
                      <div className="flex items-center justify-between gap-3 mb-4">
                        <span className="bg-black text-white px-3 py-1 border-2 border-black font-black">{idx + 1}</span>
                        <span className="font-black uppercase text-sm text-red-600">{item.timeframe}</span>
                      </div>
                      <p className="font-black text-xl mb-5 leading-tight">{item.action}</p>
                      <div className="bg-green-200 border-2 border-black px-3 py-2 font-black text-sm uppercase">
                        Watch: {item.metric_to_watch}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {ownerSolutionMap.length > 0 && (
              <section className="bg-white border-4 border-black p-8 md:p-12 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                <h3 className="text-4xl font-black uppercase mb-3">
                  {isGrowthMode ? "How Owner.com Gets You To The Next Level" : "Why Owner.com Is The Easy Fix"}
                </h3>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-8">
                  {ownerSolutionMap.slice(0, 3).map((item, idx) => (
                    <div key={idx} className="border-4 border-black p-5 bg-gray-50 text-center">
                      <p className="text-5xl font-black mb-4">{idx + 1}</p>
                      <p className="font-black uppercase text-red-600 mb-3">
                        {isGrowthMode ? growthSolutionLabels[idx] : shortText(item.problem, 55)}
                      </p>
                      <ArrowRight className="mx-auto my-4" size={34} />
                      <p className="font-black text-blue-600 text-sm uppercase mb-2">
                        {ownerFeatureLabels[idx] ?? "Owner.com feature"}
                      </p>
                      <p className="font-black text-sm leading-snug mb-3">
                        {firstSentence(item.owner_solution, 105)}
                      </p>
                      <p className="font-bold text-sm leading-snug">{firstSentence(item.dream_outcome, 95)}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {step === "partial" && (
              <div 
                className="mt-12 bg-black text-white border-4 border-black p-8 md:p-12 shadow-[8px_8px_0px_0px_#ef4444] cursor-pointer hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all"
                onClick={() => setShowModal(true)}
              >
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                  <div>
                    <p className="font-black uppercase text-[#facc15] mb-2">Ready to make this easy?</p>
                    <h3 className="text-4xl font-black uppercase mb-3">
                      Have Owner.com Turn This Into A Growth System
                    </h3>
                    <p className="font-bold text-lg max-w-3xl">
                      Get a customized Owner.com implementation plan for more direct orders, more 5-star reviews, and more repeat guests.
                    </p>
                  </div>
                  <div className="bg-[#ef4444] text-white px-6 py-4 font-black uppercase text-xl border-4 border-white flex items-center gap-2">
                    <Lock /> Get My Owner.com Plan
                  </div>
                </div>
              </div>
            )}

            {step === "full" && deepAnalysis?.owner_pitch && (
              <div className="mt-12 bg-[#facc15] border-4 border-black p-8 md:p-12 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] text-center space-y-8 animate-in zoom-in duration-500">
                <h3 className="text-4xl font-black uppercase">{deepAnalysis.owner_pitch.headline}</h3>
                <p className="text-2xl font-black max-w-4xl mx-auto bg-white p-8 border-4 border-black">
                  {deepAnalysis.owner_pitch.dream_outcome}
                </p>
                <p className="font-bold text-xl max-w-3xl mx-auto">
                  {deepAnalysis.owner_pitch.call_to_action}
                </p>
                <div className="pt-6">
                  <a 
                    href="https://owner.com" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-3 bg-black text-white px-8 py-4 text-2xl font-black uppercase hover:bg-gray-800 transition-colors border-4 border-black hover:translate-x-1 hover:translate-y-1 shadow-[8px_8px_0px_0px_#ef4444] hover:shadow-none"
                  >
                    Build My Growth System <ArrowRight size={32} />
                  </a>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="relative max-w-md w-full animate-in zoom-in-95 duration-300">
            <button 
              onClick={() => setShowModal(false)} 
              className="absolute -top-12 right-0 text-white font-bold uppercase tracking-wider hover:underline flex items-center gap-2"
            >
              Close <span className="text-2xl leading-none">&times;</span>
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
