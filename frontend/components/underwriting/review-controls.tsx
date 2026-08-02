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
 * The amount defaults to the engine's limit. Leaving it there is an APPROVE;
 * lowering it is a REDUCE, which is a different action to the API and has to
 * be sent as one. This form previously sent every approval as APPROVE with
 * the amount under a field name the endpoint did not declare, so a reviewer
 * who typed a lower limit granted the full engine cap instead — silently,
 * with a success message. The API is the authority on the ceiling and
 * refuses anything above it; that error surfaces below.
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

  function decide(intent: "APPROVE" | "REJECT") {
    const notesPart = notes.trim() !== "" ? { notes: notes.trim() } : {};

    if (intent === "REJECT") {
      review.mutate({ action: "REJECT", ...notesPart });
      return;
    }
    // APPROVE means "the engine's cap" and carries no amount, so it may only
    // be used when the reviewer left the figure alone. Any other number is
    // sent as the amount it is — below the cap the API reduces to it, above
    // the cap the API refuses and says so. Neither may be quietly rounded to
    // the cap, which is what sending everything as APPROVE did.
    const unchanged = engineLimitMinor === null || amountMinor === engineLimitMinor;
    review.mutate(
      unchanged
        ? { action: "APPROVE", ...notesPart }
        : { action: "REDUCE", amount_minor: amountMinor as number, ...notesPart },
    );
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
