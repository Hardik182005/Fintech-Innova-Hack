"use client";

import * as React from "react";
import { Info } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * Hover/focus explanation. Used heavily on this product because most figures on
 * screen are derived — a limit is the minimum of five caps, a score is a
 * weighted sum — and a reader is entitled to know how a number was reached
 * without leaving the page.
 *
 * CSS-driven rather than positioned in JavaScript: the tooltip is anchored to
 * its trigger and clipped by nothing, which is enough for short definitions and
 * costs no measurement pass.
 */

function Tooltip({
  content,
  side = "top",
  className,
  children,
}: {
  content: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
  children: React.ReactNode;
}) {
  const position = {
    top: "bottom-full left-1/2 mb-2 -translate-x-1/2",
    bottom: "top-full left-1/2 mt-2 -translate-x-1/2",
    left: "top-1/2 right-full mr-2 -translate-y-1/2",
    right: "top-1/2 left-full ml-2 -translate-y-1/2",
  }[side];

  return (
    <span className={cn("group/tt relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-40 hidden w-max max-w-[17rem] rounded-lg bg-ink px-2.5 py-1.5 text-xs leading-relaxed font-normal text-white shadow-lg group-hover/tt:block group-focus-within/tt:block",
          position,
        )}
      >
        {content}
      </span>
    </span>
  );
}

/** The standard "why is this number what it is" affordance beside a label. */
function InfoHint({ content, className }: { content: React.ReactNode; className?: string }) {
  return (
    <Tooltip content={content}>
      <button
        type="button"
        aria-label="What this means"
        className={cn("text-faint transition-colors hover:text-muted", className)}
      >
        <Info className="size-3.5" />
      </button>
    </Tooltip>
  );
}

export { InfoHint, Tooltip };
