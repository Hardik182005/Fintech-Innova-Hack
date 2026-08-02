"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Play, Vault } from "lucide-react";

import { Unavailable } from "@/components/data/states";
import { statusLabel } from "@/components/data/status";
import { Mono } from "@/components/data/value";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api";
import { count, money, rupeeInputToMinor, shortHash } from "@/lib/format";
import { useInvalidateWorkspace } from "@/lib/queries";
import type { UnderwritingView } from "@/lib/types";

/**
 * Run the application, and read the whole decision on one line each.
 *
 * The detail is already on this page in three panels; what was missing was a
 * way to *start* it from the browser and a single strip a reader can take in
 * without knowing where to look. Every row below is either a stored value or an
 * explicit absence — none of them is computed here for display.
 *
 * Two rows say something the product's own marketing copy does not:
 *
 *   Retrieval — there is no embedding model and no reranker in this service.
 *   Evidence is selected by a tenant-scoped SQL query on the task, and saying
 *   otherwise would be inventing a component. The row states what actually ran.
 *
 *   Policy — the engine name comes from the stored decision record. Policy is
 *   evaluated in-process and the record says so; labelling it as something else
 *   would be a claim about where enforcement lives that the record contradicts.
 */

const RUNNABLE = new Set(["DRAFT", "IDENTITY_VERIFIED", "EVIDENCE_READY", "UNDERWRITING"]);
const APPROVED = new Set(["APPROVED", "VAULT_CREATED", "DISBURSEMENT_ENABLED"]);

export function UnderwritingSummary({
  view,
  onRefetch,
}: {
  view: UnderwritingView;
  onRefetch: () => void;
}) {
  const router = useRouter();
  const invalidateWorkspace = useInvalidateWorkspace();
  const { application, deterministic_engine: engine, ai_recommendation: ai } = view;

  const [busy, setBusy] = React.useState<"evaluate" | "vault" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [perTransaction, setPerTransaction] = React.useState("600");

  const canRun = RUNNABLE.has(application.status);
  const canFund = application.status === "APPROVED";

  const run = React.useCallback(async () => {
    setBusy("evaluate");
    setError(null);
    try {
      await api.evaluateApplication(application.application_id);
      invalidateWorkspace();
      onRefetch();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.detail
          : "Underwriting could not be run for this application.",
      );
    } finally {
      setBusy(null);
    }
  }, [application.application_id, invalidateWorkspace, onRefetch]);

  const fund = React.useCallback(async () => {
    const perTransactionMinor = rupeeInputToMinor(perTransaction);
    if (perTransactionMinor === null) {
      setError("Enter a per-payment ceiling in rupees, above zero.");
      return;
    }
    setBusy("vault");
    setError(null);
    try {
      const vault = await api.createVault({
        application_id: application.application_id,
        per_transaction_limit_minor: perTransactionMinor,
      });
      invalidateWorkspace();
      router.push(`/vaults/${vault.vault_id}`);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.detail : "The credit vault could not be created.",
      );
    } finally {
      setBusy(null);
    }
  }, [application.application_id, invalidateWorkspace, perTransaction, router]);

  // The cap that actually bound. Showing the smallest is what "the
  // deterministic maximum" means — the others did not decide anything.
  const binding = React.useMemo(() => {
    if (engine === null) return null;
    const entries: [string, number][] = [
      ["the amount requested", engine.caps.requested_minor],
      ["remaining owner exposure", engine.caps.available_exposure_minor],
      ["the revenue advance cap", engine.caps.revenue_advance_cap_minor],
      ["the task cost cap", engine.caps.task_cost_cap_minor],
      ["the policy cap", engine.caps.policy_cap_minor],
    ];
    return entries.reduce((lowest, entry) => (entry[1] < lowest[1] ? entry : lowest));
  }, [engine]);

  const policy = view.policy_decisions.at(-1) ?? null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Underwriting result</CardTitle>
            <p className="mt-0.5 max-w-xl text-xs leading-relaxed text-muted">
              The model advises. The deterministic engine sets the amount. Neither this page nor
              the model can change what is recorded below.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canRun && (
              <Button variant="primary" onClick={() => void run()} disabled={busy !== null}>
                <Play /> {busy === "evaluate" ? "Running…" : "Run underwriting"}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <dl className="divide-y divide-line-soft">
          <SummaryRow label="Requested">
            <span className="tnum font-medium text-ink">{money(application.requested_minor)}</span>
          </SummaryRow>

          <SummaryRow label="Evidence retrieved">
            {view.evidence.length === 0 ? (
              <Unavailable
                reason="unavailable"
                detail="No evidence is stored against this task, so nothing was retrieved."
              />
            ) : (
              <span className="text-ink">
                {count(view.evidence.length)} records, content-hashed on arrival
              </span>
            )}
          </SummaryRow>

          <SummaryRow
            label="Retrieval method"
            hint="What actually ran, not what a retrieval pipeline usually implies."
          >
            <span className="text-ink">Tenant-scoped selection on the task</span>
          </SummaryRow>

          <SummaryRow label="Embedding and reranking">
            <Unavailable
              reason="not-applicable"
              label
              detail="This service embeds nothing and ranks nothing. Evidence for an application is every record stored against its task, scoped to the tenant. There is no vector index and no reranker to report a status for."
            />
          </SummaryRow>

          <SummaryRow label="Analyst model">
            {ai === null ? (
              <Unavailable
                reason="unavailable"
                detail="No model analysis is recorded against this application."
              />
            ) : (
              <span className="flex flex-wrap items-center justify-end gap-1.5">
                <Badge tone={ai.schema_valid ? "info" : "critical"} size="sm">
                  {ai.schema_valid ? "Advisory, schema valid" : "Advisory, schema invalid"}
                </Badge>
                <Mono className="text-faint">{ai.model_profile}</Mono>
              </span>
            )}
          </SummaryRow>

          <SummaryRow
            label="Deterministic maximum"
            hint="The lowest of the five caps. It is the one that bound."
          >
            {engine === null ? (
              <Unavailable
                reason="unavailable"
                detail="The engine has not evaluated this application yet."
              />
            ) : (
              <span className="text-right">
                <span className="tnum block font-medium text-ink">
                  {money(engine.approved_limit_minor)}
                </span>
                {binding !== null && (
                  <span className="block text-xs text-muted">
                    bound by {binding[0]} at {money(binding[1])}
                  </span>
                )}
              </span>
            )}
          </SummaryRow>

          <SummaryRow
            label="Policy decision"
            hint="Recorded with the engine that produced it."
          >
            {policy === null ? (
              <Unavailable
                reason="unavailable"
                detail="No policy decision has been recorded for this application."
              />
            ) : (
              <span className="flex flex-wrap items-center justify-end gap-1.5">
                <Badge tone={policy.allow ? "positive" : "critical"} size="sm">
                  {policy.allow ? "Allowed" : "Denied"}
                </Badge>
                <Mono className="text-faint">
                  {policy.engine}
                  {policy.policy_version !== null ? ` · ${policy.policy_version}` : ""}
                </Mono>
              </span>
            )}
          </SummaryRow>

          <SummaryRow label="Final decision">
            <span className="flex flex-wrap items-center justify-end gap-1.5">
              <Badge tone={decisionTone(application.status)}>
                {statusLabel(application.status)}
              </Badge>
              {engine !== null && engine.decision !== application.status && (
                <Mono className="text-faint">engine: {engine.decision}</Mono>
              )}
            </span>
          </SummaryRow>

          <SummaryRow label="Reason codes">
            {engine === null || engine.reason_codes.length === 0 ? (
              <Unavailable
                reason="unavailable"
                detail="No reason codes are recorded against this decision yet."
              />
            ) : (
              <span className="flex max-w-md flex-wrap justify-end gap-1">
                {engine.reason_codes.map((code) => (
                  <Badge key={code} tone="outline" size="sm">
                    {code}
                  </Badge>
                ))}
              </span>
            )}
          </SummaryRow>

          <SummaryRow
            label="Audit receipt"
            hint="Hash of the decision inputs and outputs, chained into the audit trail."
          >
            {engine === null || engine.receipt_hash === null ? (
              <Unavailable
                reason="unavailable"
                detail="No decision receipt exists until the engine has evaluated this application."
              />
            ) : (
              <Mono className="text-body">{shortHash(engine.receipt_hash)}</Mono>
            )}
          </SummaryRow>
        </dl>

        {canFund && (
          <div className="rounded-lg border border-line bg-surface-sunken p-4">
            <p className="text-sm font-medium text-ink">Fund this application</p>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted">
              Opens a credit vault holding {money(engine?.approved_limit_minor ?? 0)}. The vault,
              not this application, is what money is spent from — every payment out of it is
              checked against the per-payment ceiling and the vendor allowlist first.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <Field
                label="Per-payment ceiling (₹)"
                htmlFor="vault-per-transaction"
                className="w-48"
              >
                <Input
                  id="vault-per-transaction"
                  inputMode="decimal"
                  value={perTransaction}
                  onChange={(event) => setPerTransaction(event.target.value)}
                  disabled={busy !== null}
                />
              </Field>
              <Button variant="primary" onClick={() => void fund()} disabled={busy !== null}>
                <Vault /> {busy === "vault" ? "Creating…" : "Create credit vault"}
              </Button>
            </div>
          </div>
        )}

        {APPROVED.has(application.status) && !canFund && (
          <p className="text-xs text-muted">
            This application is funded. Its vault holds the granted limit and enforces the spend
            controls.
          </p>
        )}

        {error !== null && (
          <p className="rounded-lg bg-critical-wash px-3 py-2 text-sm text-critical">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-2.5">
      <dt className="min-w-0">
        <span className="text-sm text-muted">{label}</span>
        {hint !== undefined && (
          <span className="block max-w-md text-xs leading-relaxed text-faint">{hint}</span>
        )}
      </dt>
      <dd className="min-w-0 text-right text-sm">{children}</dd>
    </div>
  );
}

function decisionTone(status: string): BadgeTone {
  if (APPROVED.has(status)) return "positive";
  if (status === "REJECTED") return "critical";
  if (status === "HUMAN_REVIEW_REQUIRED") return "caution";
  return "outline";
}
