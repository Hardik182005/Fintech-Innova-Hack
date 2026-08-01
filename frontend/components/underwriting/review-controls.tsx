"use client";

import * as React from "react";
import { Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { ApiError } from "@/lib/api";
import { money, rupeeInputToMinor, rupeeInputValue } from "@/lib/format";
import { useReviewApplication } from "@/lib/queries";

/**
 * The human decision on a referred application. This is the one place in the
 * product where a person moves an amount, so the form takes rupees (what a
 * person types) and converts to minor units exactly once, on submit.
 *
 * The approval amount defaults to the engine's limit — a reviewer approving
 * more than the deterministic engine allowed is a deliberate act, typed by
 * hand, and the backend still re-checks it against policy.
 */
export function ReviewControls({
  applicationId,
  requestedMinor,
  engineLimitMinor,
}: {
  applicationId: string;
  requestedMinor: number;
  engineLimitMinor: number | null;
}) {
  const review = useReviewApplication(applicationId);
  const defaultRupees = rupeeInputValue(engineLimitMinor ?? requestedMinor);

  const [amount, setAmount] = React.useState(defaultRupees);
  const [notes, setNotes] = React.useState("");

  const amountMinor = rupeeInputToMinor(amount);
  const amountValid = amountMinor !== null;

  function decide(action: "APPROVE" | "REJECT") {
    review.mutate({
      action,
      ...(action === "APPROVE" && amountMinor !== null
        ? { approved_limit_minor: amountMinor }
        : {}),
      ...(notes.trim() !== "" ? { notes: notes.trim() } : {}),
    });
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="grid gap-4 md:grid-cols-[14rem_1fr_auto] md:items-end">
          <Field
            label="Approved limit (₹)"
            htmlFor="review-amount"
            hint={
              engineLimitMinor !== null
                ? `Engine decided ${money(engineLimitMinor)} · requested ${money(requestedMinor)}`
                : `Requested ${money(requestedMinor)}`
            }
          >
            <Input
              id="review-amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              aria-invalid={!amountValid}
              className="tnum"
            />
          </Field>

          <Field label="Notes" htmlFor="review-notes" hint="Recorded in the audit chain with the decision.">
            <Textarea
              id="review-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="min-h-9 py-1.5"
              rows={1}
            />
          </Field>

          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              onClick={() => decide("APPROVE")}
              disabled={review.isPending || !amountValid}
            >
              <Check />
              Approve
            </Button>
            <Button variant="danger" onClick={() => decide("REJECT")} disabled={review.isPending}>
              <X />
              Reject
            </Button>
          </div>
        </div>

        {review.isError && (
          <p className="mt-3 rounded-lg bg-critical-wash px-3 py-2 text-sm text-critical">
            {review.error instanceof ApiError
              ? review.error.detail
              : "The decision could not be recorded. Nothing was changed."}
          </p>
        )}
        {review.isSuccess && (
          <p className="mt-3 rounded-lg bg-positive-wash px-3 py-2 text-sm text-positive">
            Decision recorded and anchored in the audit chain.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
