import * as React from "react";
import { ArrowDown } from "lucide-react";

import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import type { RepaymentRecord } from "@/lib/types";

/**
 * The repayment waterfall, drawn from a real repayment record — the amounts are
 * the ledger's allocations, never a re-computation. Order is the contract:
 * principal first, then the credit fee, then the reserve, and the owner is paid
 * only from what remains. A loss appears only when the backend explicitly
 * booked one.
 */

/** Keyed by the ledger's own allocation step codes. */
const STEP_META: Record<string, { label: string; tone: string; explain: string }> = {
  REPAY_PRINCIPAL: {
    label: "Principal repaid",
    tone: "bg-info",
    explain: "Returns the drawn credit to the pool first.",
  },
  PAY_FEE: {
    label: "Credit fee",
    tone: "bg-neutral",
    explain: "The platform's charge for extending the credit.",
  },
  REPLENISH_RESERVE: {
    label: "Reserve",
    tone: "bg-caution",
    explain: "Held back as a buffer against future shortfalls, up to the mandate's cap.",
  },
  APPLY_REVENUE: {
    label: "Revenue applied",
    tone: "bg-info",
    explain: "Incoming task revenue applied to the facility during recovery.",
  },
  RELEASE_TO_OWNER: {
    label: "Owner proceeds",
    tone: "bg-positive",
    explain: "What the agent's owner actually receives, paid last.",
  },
  SWEEP_UNSPENT: {
    label: "Unspent funds swept",
    tone: "bg-info",
    explain: "Undrawn credit returned to the pool during recovery.",
  },
  DRAW_RESERVE_CAPPED: {
    label: "Reserve drawn",
    tone: "bg-caution",
    explain: "The buffer applied against the shortfall, up to its cap.",
  },
  SIMULATED_LOSS: {
    label: "Recognised loss (simulated)",
    tone: "bg-critical",
    explain: "Booked explicitly after sweeping unspent funds and drawing the reserve. Sandbox: simulated, no real funds.",
  },
  DEFAULT_LOSS: {
    label: "Recognised loss",
    tone: "bg-critical",
    explain: "Booked explicitly after sweeping unspent funds and drawing the reserve.",
  },
  LOSS_DEFAULT: {
    label: "Recognised loss",
    tone: "bg-critical",
    explain: "Booked explicitly after sweeping unspent funds and drawing the reserve.",
  },
};

export function Waterfall({ repayment }: { repayment: RepaymentRecord }) {
  const steps = repayment.allocations.filter((allocation) => allocation.amount_minor !== 0);
  const total = steps.reduce((sum, allocation) => sum + Math.abs(allocation.amount_minor), 0);

  if (steps.length === 0) {
    return <p className="text-xs text-muted">This repayment allocated no funds.</p>;
  }

  return (
    <div className="space-y-1.5">
      {steps.map((allocation, index) => {
        const meta = STEP_META[allocation.step.toUpperCase()] ?? {
          label: allocation.step,
          tone: "bg-neutral",
          explain: "",
        };
        const share = total === 0 ? 0 : (Math.abs(allocation.amount_minor) / total) * 100;

        return (
          <React.Fragment key={`${allocation.step}-${index}`}>
            {index > 0 && (
              <div className="flex justify-center">
                <ArrowDown className="size-3 text-faint" aria-hidden />
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="w-36 shrink-0 text-right">
                <p className="text-xs font-medium text-ink">{meta.label}</p>
              </div>
              <div className="h-6 flex-1 overflow-hidden rounded-md bg-surface-sunken">
                <div
                  className={cn("flex h-full items-center rounded-md px-2", meta.tone)}
                  style={{ width: `${Math.max(share, 4)}%` }}
                  title={meta.explain}
                >
                  <span className="tnum truncate text-[0.6875rem] font-medium text-white">
                    {money(allocation.amount_minor)}
                  </span>
                </div>
              </div>
            </div>
          </React.Fragment>
        );
      })}
      <p className="pt-1.5 text-right text-xs text-muted">
        Waterfall order is fixed: principal → fee → reserve → owner. The owner is paid only from
        what remains.
      </p>
    </div>
  );
}
