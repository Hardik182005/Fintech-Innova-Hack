"use client";

import * as React from "react";
import { AlertCircle, Check, Circle, Loader2 } from "lucide-react";

import { Mono } from "@/components/data/value";
import type { StepState } from "@/lib/onboarding";

/**
 * The write sequence, shown as it runs.
 *
 * A form that posts once can get away with a spinner. These forms post four or
 * five times, and if the third call fails the first two have already written
 * rows to the database. Hiding that behind one "submitting…" would leave a
 * person unable to tell whether their agent exists, so each step names what it
 * did and shows the id it got back.
 */
export function StepList({ steps }: { steps: StepState[] }) {
  if (steps.length === 0) return null;

  return (
    <ol className="space-y-2" aria-live="polite">
      {steps.map((step) => (
        <li key={step.label} className="flex items-start gap-2.5 text-sm">
          <Icon status={step.status} />
          <div className="min-w-0 flex-1">
            <p className={step.status === "pending" ? "text-faint" : "text-ink"}>{step.label}</p>
            {step.detail !== undefined && (
              <Mono className="mt-0.5 block text-faint">{step.detail}</Mono>
            )}
            {step.error !== undefined && (
              <p className="mt-0.5 text-xs leading-relaxed text-critical">{step.error}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Icon({ status }: { status: StepState["status"] }) {
  const className = "mt-0.5 size-4 shrink-0";
  switch (status) {
    case "done":
      return <Check className={`${className} text-positive`} aria-label="done" />;
    case "running":
      return <Loader2 className={`${className} animate-spin text-info`} aria-label="running" />;
    case "failed":
      return <AlertCircle className={`${className} text-critical`} aria-label="failed" />;
    default:
      return <Circle className={`${className} text-faint`} aria-hidden />;
  }
}
