import * as React from "react";
import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { NO_VALUE } from "@/lib/format";

/**
 * The seven states a figure on this product can be in.
 *
 * A credit dashboard that renders every absence as `0` tells the reader
 * something false: that nothing was repaid, that no case failed, that exposure
 * is nil. Each of these states is a different sentence, and the reader is owed
 * the right one:
 *
 *   value            — the backend returned a number; show it, zero included
 *   loading          — the request is in flight
 *   error            — the request failed; the number is unknown, not zero
 *   unavailable      — the backend has no value for this yet
 *   not-evaluated    — the evaluation suite has not scored this
 *   not-connected    — an upstream integration is not configured
 *   insufficient     — there is data, but too little to state a rate honestly
 *
 * `Unavailable` renders the last four as a dash carrying its reason, so the
 * distinction survives all the way to the screen instead of collapsing into one
 * grey em-dash a reader cannot interpret.
 */

export type AbsenceReason =
  | "unavailable"
  | "not-evaluated"
  | "not-connected"
  | "insufficient"
  | "not-applicable";

const ABSENCE_COPY: Record<AbsenceReason, { short: string; explain: string }> = {
  unavailable: {
    short: "Not available",
    explain: "No value has been recorded for this yet. This is not a zero.",
  },
  "not-evaluated": {
    short: "Not evaluated",
    explain:
      "The evaluation suite has not scored this metric. A score will appear after an evaluation run completes.",
  },
  "not-connected": {
    short: "Not connected",
    explain:
      "The upstream source for this figure is not configured in this deployment, so no value can be reported.",
  },
  insufficient: {
    short: "Insufficient sample",
    explain:
      "There are too few cases to state a rate honestly. The figure will appear once the sample is large enough.",
  },
  "not-applicable": {
    short: "Not applicable",
    explain: "This measure does not apply in the current state.",
  },
};

/**
 * The absence marker. Reads as a dash in the column, explains itself on hover.
 * Deliberately the same width class as a figure so columns still align.
 */
function Unavailable({
  reason = "unavailable",
  detail,
  label = false,
  className,
}: {
  reason?: AbsenceReason;
  /** Overrides the stock explanation when the backend supplied a specific one. */
  detail?: string;
  /** Show the words instead of a dash — for headline figures where a bare dash is too quiet. */
  label?: boolean;
  className?: string;
}) {
  const copy = ABSENCE_COPY[reason];
  return (
    <Tooltip content={detail ?? copy.explain} className={className}>
      <span
        data-slot="unavailable"
        data-reason={reason}
        className={cn(
          "cursor-help text-faint decoration-dotted underline-offset-4 hover:underline",
          label && "text-sm font-normal",
        )}
      >
        {label ? copy.short : NO_VALUE}
      </span>
    </Tooltip>
  );
}

/** The short form of an absence reason, for chart captions and axis notes. */
export function absenceLabel(reason: AbsenceReason): string {
  return ABSENCE_COPY[reason].short;
}

function LoadingBlock({ className, lines = 3 }: { className?: string; lines?: number }) {
  return (
    <div className={cn("space-y-2.5", className)} role="status" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-4", i === lines - 1 ? "w-2/5" : "w-full")} />
      ))}
    </div>
  );
}

function EmptyState({
  title,
  body,
  icon: Icon = Inbox,
  action,
  className,
}: {
  title: string;
  body?: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-12 text-center",
        className,
      )}
    >
      <div className="mb-3 flex size-9 items-center justify-center rounded-full bg-surface-sunken">
        <Icon className="size-4 text-faint" />
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {body !== undefined && <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">{body}</p>}
      {action !== undefined && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * Failure, stated in the reader's language. The technical detail is kept but
 * folded away: an operator debugging needs it, and an ordinary user reading a
 * stack trace on a credit screen learns nothing except that something is wrong.
 */
function ErrorState({
  title = "This could not be loaded",
  detail,
  onRetry,
  className,
}: {
  title?: string;
  detail?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-10 text-center", className)}>
      <div className="mb-3 flex size-9 items-center justify-center rounded-full bg-critical-wash">
        <AlertTriangle className="size-4 text-critical" />
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">
        The figures on this panel are unknown right now — they are not zero.
      </p>
      {detail !== undefined && detail !== "" && (
        <details className="mt-3 max-w-sm text-left">
          <summary className="cursor-pointer text-xs text-muted hover:text-body">
            Technical details
          </summary>
          <p className="mt-1.5 rounded-md bg-surface-sunken px-2.5 py-2 font-mono text-[0.6875rem] leading-relaxed break-words text-body">
            {detail}
          </p>
        </details>
      )}
      {onRetry !== undefined && (
        <Button size="sm" variant="secondary" onClick={onRetry} className="mt-4">
          <RefreshCw />
          Try again
        </Button>
      )}
    </div>
  );
}

export { EmptyState, ErrorState, LoadingBlock, Unavailable };
