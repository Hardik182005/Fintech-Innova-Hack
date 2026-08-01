import * as React from "react";

import { InfoHint } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";

/**
 * Trust score dial. The score is computed deterministically on the backend from
 * task history, repayment record and violations — never by a model — and the
 * hint says so, because "trust score" is exactly the kind of label a reader
 * would otherwise assume an AI invented.
 */
export function TrustScore({
  score,
  size = "md",
  className,
}: {
  score: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const bounded = Math.min(100, Math.max(0, score));
  const tone =
    bounded >= 75 ? "text-positive" : bounded >= 50 ? "text-caution" : "text-critical";
  const track =
    bounded >= 75 ? "stroke-positive" : bounded >= 50 ? "stroke-caution" : "stroke-critical";

  const px = { sm: 40, md: 56, lg: 72 }[size];
  const stroke = { sm: 3.5, md: 4, lg: 5 }[size];
  const r = (px - stroke) / 2;
  const c = 2 * Math.PI * r;

  return (
    <span className={cn("relative inline-flex items-center justify-center", className)}>
      <svg width={px} height={px} className="-rotate-90" aria-hidden>
        <circle
          cx={px / 2}
          cy={px / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-surface-sunken"
        />
        <circle
          cx={px / 2}
          cy={px / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - bounded / 100)}
          className={cn("transition-[stroke-dashoffset] duration-700", track)}
        />
      </svg>
      <span
        className={cn(
          "tnum absolute font-semibold",
          tone,
          size === "sm" ? "text-[0.6875rem]" : size === "md" ? "text-sm" : "text-base",
        )}
      >
        {Math.round(bounded)}
      </span>
    </span>
  );
}

export function TrustScoreLabel() {
  return (
    <span className="flex items-center gap-1.5">
      Trust score
      <InfoHint content="Computed deterministically from task success, repayment record, policy violations and identity age. New agents start at a neutral 50. No AI model contributes to this number." />
    </span>
  );
}
