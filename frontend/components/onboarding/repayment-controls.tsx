"use client";

import * as React from "react";
import { AlertTriangle, Banknote, CheckCircle2, FlaskConical } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { ApiError } from "@/lib/api";
import { money, rupeeInputToMinor, rupeeInputValue } from "@/lib/format";
import { useReceiveRevenue, useSimulateFailure } from "@/lib/queries";
import type { VaultDetail } from "@/lib/types";

/**
 * Sandbox controls for what happens after the money is spent.
 *
 * These call the same endpoints the demonstration scenarios call. There is no
 * client-side simulation here: recording revenue runs the real waterfall
 * against the real ledger, and the numbers that appear afterwards on this page
 * are the ledger's allocations, not a preview of them.
 *
 * There is no separate "task completed" endpoint, and this does not invent one.
 * Completion is a property of the revenue event — `task_completed` is what
 * tells the backend to settle the facility rather than take a part payment —
 * so the two buttons here differ in exactly that flag, and say so.
 *
 * `external_event_id` is the idempotency key. It is derived from the vault, the
 * amount and the sequence number rather than randomised, so a double-clicked
 * button is one credit event and not two.
 */

const SETTLED = new Set(["REPAID", "CLOSED", "DEFAULTED"]);

export function RepaymentControls({ vault }: { vault: VaultDetail }) {
  const receive = useReceiveRevenue(vault.vault_id);
  const fail = useSimulateFailure(vault.vault_id);

  const outstanding = vault.principal_outstanding_minor + vault.fee_due_minor;
  const [amount, setAmount] = React.useState(() => rupeeInputValue(outstanding));
  const amountMinor = rupeeInputToMinor(amount);

  // Track what the field last auto-followed, so a typed value is never
  // overwritten by a background refetch.
  const followed = React.useRef(outstanding);
  React.useEffect(() => {
    if (followed.current !== outstanding && amount === rupeeInputValue(followed.current)) {
      setAmount(rupeeInputValue(outstanding));
    }
    followed.current = outstanding;
  }, [outstanding, amount]);

  const settled = SETTLED.has(vault.status);
  const busy = receive.isPending || fail.isPending;
  const eventCount = vault.revenue_events.length;

  const submit = React.useCallback(
    (taskCompleted: boolean) => {
      if (amountMinor === null) return;
      receive.mutate({
        amount_minor: amountMinor,
        // Stable per (vault, amount, position): re-submitting the identical
        // payment is the same event, which is what idempotency means here.
        external_event_id: `web-${vault.vault_id}-${eventCount}-${amountMinor}`,
        task_completed: taskCompleted,
      });
    },
    [amountMinor, eventCount, receive, vault.vault_id],
  );

  const error = receive.error ?? fail.error;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Record task revenue</CardTitle>
            <p className="mt-0.5 max-w-xl text-xs leading-relaxed text-muted">
              Sandbox controls. These post to the live repayment endpoints and persist — revenue
              runs the waterfall, and the failure control draws on the reserve.
            </p>
          </div>
          <Badge tone="outline" size="sm">
            <FlaskConical /> Sandbox
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Revenue received (₹)"
            hint={
              amountMinor === null
                ? "Enter an amount in rupees, above zero."
                : `Outstanding right now: ${money(outstanding)} (${money(vault.principal_outstanding_minor)} principal, ${money(vault.fee_due_minor)} fee).`
            }
            htmlFor="revenue-amount"
          >
            <Input
              id="revenue-amount"
              inputMode="decimal"
              value={amount}
              disabled={settled || busy}
              onChange={(event) => setAmount(event.target.value)}
              aria-invalid={amountMinor === null}
            />
          </Field>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={settled || busy || amountMinor === null}
            onClick={() => submit(false)}
          >
            <Banknote /> Record partial repayment
          </Button>
          <Button
            variant="primary"
            disabled={settled || busy || amountMinor === null}
            onClick={() => submit(true)}
          >
            <CheckCircle2 /> Record task complete &amp; full repayment
          </Button>
          <Button
            variant="danger"
            disabled={settled || busy}
            onClick={() => fail.mutate()}
            className="ml-auto"
          >
            <AlertTriangle /> Simulate task failure
          </Button>
        </div>

        <p className="text-xs leading-relaxed text-muted">
          The second button sets <code className="font-mono text-faint">task_completed</code>,
          which is what lets the backend settle the facility rather than take a part payment.
          Simulating failure sweeps whatever the vault still holds, draws the reserve, and records
          the shortfall as a loss against the agent.
        </p>

        {settled && (
          <p className="rounded-lg bg-surface-sunken px-3 py-2 text-xs text-muted">
            This vault is {vault.status.toLowerCase()}. Nothing further is collected against it.
          </p>
        )}

        {error !== null && (
          <p className="rounded-lg bg-critical-wash px-3 py-2 text-sm text-critical">
            {error instanceof ApiError ? error.detail : "That could not be recorded."}
          </p>
        )}

        {receive.isSuccess && receive.data !== undefined && (
          <div className="rounded-lg border border-positive/30 bg-positive-wash p-3">
            <p className="text-sm font-medium text-ink">Revenue recorded and allocated</p>
            <ul className="mt-1.5 space-y-0.5 text-xs text-body">
              <li>Principal repaid {money(receive.data.principal_minor)}</li>
              <li>Fee {money(receive.data.fee_minor)}</li>
              <li>Released to owner {money(receive.data.owner_minor)}</li>
            </ul>
          </div>
        )}

        {fail.isSuccess && fail.data !== undefined && (
          <div className="rounded-lg border border-caution/30 bg-caution-wash p-3">
            <p className="text-sm font-medium text-ink">Failure recorded</p>
            <ul className="mt-1.5 space-y-0.5 text-xs text-body">
              <li>Swept from the vault {money(fail.data.swept_minor)}</li>
              <li>Drawn from reserve {money(fail.data.reserve_drawn_minor)}</li>
              <li>Shortfall booked as loss {money(fail.data.simulated_loss_minor)}</li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
