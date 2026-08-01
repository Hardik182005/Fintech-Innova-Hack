import * as React from "react";

import { cn } from "@/lib/cn";
import { NO_VALUE } from "@/lib/format";

/**
 * Utilisation bar. Takes `value` and `max` in the same integer minor units the
 * backend uses, and refuses to draw at all when either is missing — a bar with
 * no data would render as an empty track, which reads as "nothing drawn" rather
 * than "not known".
 */

const TONES = {
  neutral: "bg-neutral",
  positive: "bg-positive",
  caution: "bg-caution",
  critical: "bg-critical",
  info: "bg-info",
} as const;

export type MeterTone = keyof typeof TONES;

function Meter({
  value,
  max,
  tone = "info",
  label,
  className,
}: {
  value: number | null | undefined;
  max: number | null | undefined;
  tone?: MeterTone;
  label?: string;
  className?: string;
}) {
  const known =
    value !== null &&
    value !== undefined &&
    max !== null &&
    max !== undefined &&
    Number.isFinite(value) &&
    Number.isFinite(max) &&
    max > 0;

  if (!known) {
    return (
      <div className={cn("flex h-1.5 items-center", className)} aria-label={label}>
        <span className="text-xs text-faint">{NO_VALUE}</span>
      </div>
    );
  }

  const pct = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken", className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", TONES[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export { Meter };
