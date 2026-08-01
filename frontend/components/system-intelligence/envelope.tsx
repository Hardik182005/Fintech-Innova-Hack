import * as React from "react";

import { absenceLabel, Unavailable, type AbsenceReason } from "@/components/data/states";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { count, money, moneyCompact, percent } from "@/lib/format";
import type { MetricEnvelope, MetricStatus } from "@/lib/types";

/**
 * The single place a metric envelope becomes pixels.
 *
 * The telemetry contract (docs/system-intelligence-contract.md) wraps every
 * figure in `{ value, unit, sample_size, status }`, with `value: null` whenever
 * `status != "ok"`. The rule this file enforces — in exactly one place, so no
 * panel can get it wrong independently — is that a non-ok envelope renders as
 * its honest absence reason and never, under any circumstance, as `0`. Zero is
 * a claim; absence is not. Even a malformed envelope that says "ok" while
 * carrying a null value renders as unavailable rather than inventing a number.
 */

/** Contract status → the product's absence vocabulary. */
export function absenceReasonOf(status: MetricStatus): AbsenceReason {
  switch (status) {
    case "not_evaluated":
      return "not-evaluated";
    case "not_connected":
      return "not-connected";
    case "insufficient_sample":
      return "insufficient";
    default:
      // "unavailable" — and "ok" with a null value, which is a contract
      // violation and must still never surface as a figure.
      return "unavailable";
  }
}

/** True only when the envelope genuinely carries a number the UI may show. */
export function envelopeOk(
  envelope: MetricEnvelope | null | undefined,
): envelope is MetricEnvelope & { value: number } {
  return (
    envelope !== null &&
    envelope !== undefined &&
    envelope.status === "ok" &&
    envelope.value !== null &&
    Number.isFinite(envelope.value)
  );
}

/** Durations arrive as integer ms; render sub-second values as ms, then s. */
export function formatMs(ms: number): string {
  if (ms < 1_000) return `${count(ms)} ms`;
  const seconds = ms / 1_000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  return `${(seconds / 60).toFixed(1)} min`;
}

/** "n = 42" — the honest denominator, or null when the contract gave none. */
export function sampleNote(envelope: MetricEnvelope | null | undefined): string | null {
  if (envelope === null || envelope === undefined) return null;
  if (envelope.sample_size === null || envelope.sample_size === undefined) return null;
  return `n = ${count(envelope.sample_size)}`;
}

/**
 * Render an envelope. Formatting follows the envelope's own `unit`, so a
 * caller cannot accidentally present a ppm rate as a count. Absences render
 * through `Unavailable` with the reason mapped from the contract status;
 * `absentText` substitutes custom words for headline positions ("Not enough
 * evaluated cases") while keeping the same tooltip-explained absence marker.
 */
export function EnvelopeValue({
  envelope,
  compact = false,
  digits = 1,
  label = false,
  detail,
  absentText,
  className,
}: {
  envelope: MetricEnvelope | null | undefined;
  /** Money only: compact ₹1.2L form for headlines. */
  compact?: boolean;
  /** Ppm only: decimal places on the percentage. */
  digits?: number;
  /** Absences only: words instead of a dash, for headline figures. */
  label?: boolean;
  /** Absences only: overrides the stock tooltip explanation. */
  detail?: string;
  /** Absences only: custom words in place of the stock short label. */
  absentText?: string;
  className?: string;
}) {
  if (!envelopeOk(envelope)) {
    const reason =
      envelope === null || envelope === undefined
        ? "unavailable"
        : absenceReasonOf(envelope.status);
    if (absentText !== undefined) {
      return (
        <Tooltip content={detail ?? absenceLabel(reason)} className={className}>
          <span
            data-slot="unavailable"
            data-reason={reason}
            className="cursor-help text-sm font-normal text-faint decoration-dotted underline-offset-4 hover:underline"
          >
            {absentText}
          </span>
        </Tooltip>
      );
    }
    return <Unavailable reason={reason} label={label} detail={detail} className={className} />;
  }

  const text =
    envelope.unit === "ppm"
      ? percent(envelope.value, digits)
      : envelope.unit === "minor"
        ? compact
          ? moneyCompact(envelope.value)
          : money(envelope.value)
        : envelope.unit === "ms"
          ? formatMs(envelope.value)
          : count(envelope.value);

  return <span className={cn("tnum", className)}>{text}</span>;
}
