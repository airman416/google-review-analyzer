"use client";

import { Lock } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

interface DataCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  isBlurred?: boolean;
  color?: "primary" | "secondary" | "accent" | "white";
}

const MAX_FONT_PX = 28;
const MIN_FONT_PX = 13;
const MAX_VALUE_LINES = 3;

function formatValueDisplay(value: string) {
  const yrMatch = value.match(/^(\$[\d,]+)(\/yr)$/);
  if (yrMatch) {
    return (
      <>
        {yrMatch[1]}
        <span className="whitespace-nowrap">{yrMatch[2]}</span>
      </>
    );
  }
  return value;
}

export default function DataCard({ title, value, subtitle, isBlurred = false, color = "white" }: DataCardProps) {
  const bgClasses = {
    primary: "bg-[#fbf8f5] border-[#dfdcd9]", // Sand
    secondary: "bg-[#fafaf9] border-[#dfdcd9]", // Warm off-white
    accent: "bg-white border-[#dfdcd9]", // White
    white: "bg-white border-[#dfdcd9]", // White
  };

  const isRiskCard = title.includes("Revenue at Risk") || title.includes("Complaint");
  const isGoodCard = title === "Your Rating" || title.includes("Opportunity") || title.includes("Growth Status");

  // Determine left border highlight and text color highlight based on metrics state
  const borderHighlight = isGoodCard 
    ? "border-l-4 border-l-[#094413]" 
    : isRiskCard 
      ? "border-l-4 border-l-[#c2410c]" 
      : "";

  const valueColorClass = isGoodCard 
    ? "text-[#094413]" 
    : isRiskCard 
      ? "text-[#c2410c]" 
      : "text-gray-900";

  const valueStr = String(value);
  const valueRef = useRef<HTMLParagraphElement>(null);
  const [fontSizePx, setFontSizePx] = useState(MAX_FONT_PX);

  useLayoutEffect(() => {
    const el = valueRef.current;
    if (!el) return;

    const fitText = () => {
      const containerWidth = el.clientWidth;
      if (containerWidth <= 0) return;

      const words = valueStr.split(/\s+/).filter(Boolean);
      const longestWord = words.reduce((longest, word) => (word.length > longest.length ? word : longest), valueStr);

      const measure = document.createElement("span");
      measure.style.position = "absolute";
      measure.style.visibility = "hidden";
      measure.style.whiteSpace = "nowrap";
      measure.style.fontWeight = "900";
      measure.style.fontFamily = getComputedStyle(el).fontFamily;
      document.body.appendChild(measure);

      let size = MAX_FONT_PX;
      let bestSize = MIN_FONT_PX;

      while (size >= MIN_FONT_PX) {
        el.style.fontSize = `${size}px`;
        measure.style.fontSize = `${size}px`;
        measure.textContent = longestWord;

        const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || size * 1.3;
        const lineCount = Math.max(1, Math.round(el.scrollHeight / lineHeight));
        const longestWordFits = measure.offsetWidth <= containerWidth;

        if (lineCount <= MAX_VALUE_LINES && longestWordFits) {
          bestSize = size;
          break;
        }

        bestSize = size;
        size -= 1;
      }

      document.body.removeChild(measure);
      setFontSizePx(bestSize);
    };

    fitText();

    const observer = new ResizeObserver(fitText);
    observer.observe(el);
    return () => observer.disconnect();
  }, [valueStr]);

  return (
    <div
      className={`flex min-h-full min-w-0 flex-col gap-3 p-6 border rounded-xl shadow-sm hover:shadow-md transition-all duration-300 relative ${bgClasses[color]} ${borderHighlight}`}
    >
      <h3 className="font-bold text-xs uppercase tracking-wider text-gray-500 border-b border-gray-100 pb-2.5 shrink-0">{title}</h3>

      <div className={`relative min-w-0 flex-1 ${isBlurred ? "filter blur-md select-none" : ""}`}>
        <p
          ref={valueRef}
          className={`font-bold leading-snug [overflow-wrap:normal] [word-break:normal] hyphens-none ${valueColorClass}`}
          style={{ fontSize: `${fontSizePx}px` }}
        >
          {formatValueDisplay(valueStr)}
        </p>
        {subtitle && <p className="text-sm font-semibold mt-2.5 text-gray-500 leading-snug">{subtitle}</p>}
      </div>

      {isBlurred && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 backdrop-blur-[2px] rounded-xl z-10">
          <Lock size={24} className="text-gray-400" />
          <span className="font-bold mt-2 bg-[#094413] text-white px-2 py-0.5 rounded text-[10px] uppercase tracking-wider">Locked</span>
        </div>
      )}
    </div>
  );
}
