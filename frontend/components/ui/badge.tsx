import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/cn";

/**
 * Tone is meaning, not decoration. `positive` says a control held or a balance
 * settled; `critical` says money is at risk or a chain broke; `neutral` is the
 * default and covers everything that is merely a fact. A badge never gets a
 * tone because it looks better with one.
 */

export const badgeStyle = cva(
  "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        neutral: "border-transparent bg-neutral-wash text-neutral",
        positive: "border-transparent bg-positive-wash text-positive",
        caution: "border-transparent bg-caution-wash text-caution",
        critical: "border-transparent bg-critical-wash text-critical",
        info: "border-transparent bg-info-wash text-info",
        outline: "border-line bg-surface text-muted",
      },
      size: {
        sm: "px-1.5 py-0 text-[0.6875rem]",
        md: "",
      },
    },
    defaultVariants: { tone: "neutral", size: "md" },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeStyle>["tone"]>;

export interface BadgeProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof badgeStyle> {}

function Badge({ className, tone, size, ...props }: BadgeProps) {
  return (
    <span data-slot="badge" className={cn(badgeStyle({ tone, size }), className)} {...props} />
  );
}

/** A small filled circle carrying the same tone vocabulary, for dense rows. */
function Dot({ tone = "neutral", className }: { tone?: BadgeTone; className?: string }) {
  const fill: Record<BadgeTone, string> = {
    neutral: "bg-neutral",
    positive: "bg-positive",
    caution: "bg-caution",
    critical: "bg-critical",
    info: "bg-info",
    outline: "bg-faint",
  };
  return (
    <span
      aria-hidden
      className={cn("inline-block size-1.5 shrink-0 rounded-full", fill[tone], className)}
    />
  );
}

export { Badge, Dot };
