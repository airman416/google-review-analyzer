"use client";

import { Lock } from "lucide-react";

interface DataCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  isBlurred?: boolean;
  color?: "primary" | "secondary" | "accent" | "white";
}

export default function DataCard({ title, value, subtitle, isBlurred = false, color = "white" }: DataCardProps) {
  const bgColors = {
    primary: "bg-[#facc15]",
    secondary: "bg-[#3b82f6]",
    accent: "bg-[#ef4444]",
    white: "bg-white",
  };

  const textColor = color === "secondary" || color === "accent" ? "text-white" : "text-black";

  return (
    <div className={`p-6 border-brutal border-black shadow-brutal relative min-h-full break-words ${bgColors[color]} ${textColor}`} style={{ borderWidth: "3px" }}>
      <h3 className="font-bold text-xl uppercase mb-2 border-b-2 border-current pb-2">{title}</h3>
      
      <div className={`relative ${isBlurred ? "filter blur-md select-none" : ""}`}>
        <p className="font-black leading-tight whitespace-normal" style={{ fontSize: "clamp(1.25rem, 2vw, 2.25rem)" }}>{value}</p>
        {subtitle && <p className="text-sm font-bold mt-2 opacity-90">{subtitle}</p>}
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
