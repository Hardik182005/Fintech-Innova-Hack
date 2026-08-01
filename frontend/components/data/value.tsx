import * as React from "react";

import { Unavailable, type AbsenceReason } from "@/components/data/states";
import { InfoHint } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { count, money, moneyCompact, percent } from "@/lib/format";
import type { Money, Ppm } from "@/lib/types";

/**
 * Value renderers. Each takes the backend's `T | null` directly and decides
 * between a figure and an absence marker in one place, so no page has to
 * remember the rule. A component that received `null` and printed `0` would be
 * the single most damaging bug on this product; making that unrepresentable is
 * the point of this file.
 */

function MoneyValue({
  minor,
  compact = false,
  reason = "unavailable",
  className,
}: {
  minor: Money | null | undefined;
  compact?: boolean;
  reason?: AbsenceReason;
  className?: string;
}) {
  if (minor === null || minor === undefined) return <Unavailable reason={reason} />;
  return (
    <span className={cn("tnum", className)}>{compact ? moneyCompact(minor) : money(minor)}</span>
  );
}

function PercentValue({
  ppm,
  digits = 1,
  reason = "unavailable",
  className,
}: {
  ppm: Ppm | null | undefined;
  digits?: number;
  reason?: AbsenceReason;
  className?: string;
}) {
  if (ppm === null || ppm === undefined) return <Unavailable reason={reason} />;
  return <span className={cn("tnum", className)}>{percent(ppm, digits)}</span>;
}

function CountValue({
  value,
  reason = "unavailable",
  className,
}: {
  value: number | null | undefined;
  reason?: AbsenceReason;
  className?: string;
}) {
  if (value === null || value === undefined) return <Unavailable reason={reason} />;
  return <span className={cn("tnum", className)}>{count(value)}</span>;
}

/**
 * A headline figure with its label. `value` is a node so callers can compose
 * (an amount beside a badge, a rate beside a sample size), but the absence path
 * stays owned here: pass `absent` and the figure is replaced wholesale.
 */
function Metric({
  label,
  value,
  hint,
  sub,
  absent,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Tooltip on the label: how this number is derived. */
  hint?: React.ReactNode;
  /** One line beneath: sample size, denominator, timestamp. */
  sub?: React.ReactNode;
  /** When set, the value is not shown at all and this reason is rendered instead. */
  absent?: { reason: AbsenceReason; detail?: string };
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center gap-1.5">
        <span className="eyebrow">{label}</span>
        {hint !== undefined && <InfoHint content={hint} />}
      </div>
      <div className="mt-1.5 text-2xl leading-none font-semibold tracking-tight text-ink">
        {absent !== undefined ? (
          <Unavailable reason={absent.reason} detail={absent.detail} label />
        ) : (
          value
        )}
      </div>
      {sub !== undefined && <div className="mt-1.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

/** Label/value row for drawers and detail panels. */
function Row({
  label,
  children,
  hint,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-6 py-2", className)}>
      <dt className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
        {label}
        {hint !== undefined && <InfoHint content={hint} />}
      </dt>
      <dd className="min-w-0 text-right text-sm text-ink">{children}</dd>
    </div>
  );
}

function Rows({ className, children }: { className?: string; children: React.ReactNode }) {
  return <dl className={cn("divide-y divide-line-soft", className)}>{children}</dl>;
}

/** Monospaced identifier with the full value available on hover and selection. */
function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("font-mono text-xs tracking-tight text-body", className)}>{children}</span>
  );
}

export { CountValue, Metric, MoneyValue, Mono, PercentValue, Row, Rows };
