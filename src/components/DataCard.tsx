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
  const bgColors = {
    primary: "bg-[#facc15]",
    secondary: "bg-[#3b82f6]",
    accent: "bg-[#ef4444]",
    white: "bg-white",
  };

  const textColor = color === "secondary" || color === "accent" ? "text-white" : "text-black";
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
      className={`flex min-h-full min-w-0 flex-col gap-3 p-5 border-brutal border-black shadow-brutal relative ${bgColors[color]} ${textColor}`}
      style={{ borderWidth: "3px" }}
    >
      <h3 className="font-bold text-sm uppercase tracking-wide border-b-2 border-current pb-2 shrink-0">{title}</h3>

      <div className={`relative min-w-0 flex-1 ${isBlurred ? "filter blur-md select-none" : ""}`}>
        <p
          ref={valueRef}
          className="font-black leading-snug [overflow-wrap:normal] [word-break:normal] hyphens-none"
          style={{ fontSize: `${fontSizePx}px` }}
        >
          {formatValueDisplay(valueStr)}
        </p>
        {subtitle && <p className="text-sm font-bold mt-3 opacity-90 leading-snug">{subtitle}</p>}
      </div>

      {isBlurred && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/10 backdrop-blur-[2px] z-10">
          <Lock size={32} className={textColor} />
          <span className="font-bold mt-2 bg-black text-white px-2 py-1 uppercase text-xs">Locked</span>
        </div>
      )}
    </div>
  );
}
