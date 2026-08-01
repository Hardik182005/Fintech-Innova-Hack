import * as React from "react";

import { cn } from "@/lib/cn";

/**
 * A loading placeholder, not a value. It carries no digits on purpose: a
 * skeleton shaped like "₹0.00" would be read as a balance by anyone glancing at
 * the screen mid-fetch.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("animate-pulse rounded-md bg-surface-sunken", className)}
      {...props}
    />
  );
}

/** Skeleton rows sized for a table body, so the layout does not jump on load. */
function SkeletonRows({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} className="border-t border-line-soft">
          {Array.from({ length: cols }, (_, c) => (
            <td key={c} className="px-4 py-3">
              <Skeleton className={c === 0 ? "h-4 w-40" : "h-4 w-20"} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export { Skeleton, SkeletonRows };
