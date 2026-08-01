"use client";

import * as React from "react";
import { CheckCircle2, ChevronRight, RefreshCw, XCircle } from "lucide-react";

import { ErrorState, LoadingBlock, Unavailable } from "@/components/data/states";
import { Row, Rows } from "@/components/data/value";
import { PageHeader, Section } from "@/components/data/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api";
import { percent, ppmToBps } from "@/lib/format";
import { useAuditChain, useEvaluationMetrics, usePolicyParameters, useReadiness } from "@/lib/queries";

/**
 * Developer Lab — the internal surface, kept out of the product navigation's
 * main groups on purpose.
 *
 * What it deliberately does not have any more: a demo-token input. The token
 * lives in server-side environment and is attached inside the Node process by
 * the API proxy, so there is nothing here for a browser to hold, paste or leak.
 */

/** Read-only endpoints safe to inspect raw. Nothing here mutates state. */
const INSPECTABLE = [
  { label: "Readiness", run: () => api.getReadiness() },
  { label: "Evaluation metrics", run: () => api.getEvaluationMetrics() },
  { label: "Policy parameters", run: () => api.getPolicyParameters() },
  { label: "Workspace identity", run: () => api.getMe() },
  { label: "Agents", run: () => api.listAgents() },
  { label: "Credit applications", run: () => api.listCreditApplications() },
  { label: "Underwriting queue", run: () => api.getUnderwritingQueue() },
  { label: "Vaults", run: () => api.listVaults() },
  { label: "Transactions", run: () => api.listTransactions() },
  { label: "Repayments", run: () => api.listRepayments() },
  { label: "Risk summary", run: () => api.getRiskSummary() },
  { label: "Risk events", run: () => api.listRiskEvents() },
  { label: "Audit events", run: () => api.listAuditEvents() },
  { label: "Audit chain verification", run: () => api.verifyAuditChain() },
  { label: "Vendors", run: () => api.listVendors() },
  { label: "Dashboard summary", run: () => api.getDashboardSummary() },
] as const;

function Check({ ok, label }: { ok: boolean | undefined; label: string }) {
  if (ok === undefined) return <Unavailable />;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      {ok ? (
        <CheckCircle2 className="size-4 text-positive" />
      ) : (
        <XCircle className="size-4 text-critical" />
      )}
      <span className={ok ? "text-positive" : "text-critical"}>{label}</span>
    </span>
  );
}

function Inspector() {
  const [index, setIndex] = React.useState(0);
  const [payload, setPayload] = React.useState<unknown>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const fetchIt = React.useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setPayload(await INSPECTABLE[index].run());
    } catch (caught) {
      setPayload(null);
      setError(
        caught instanceof ApiError
          ? `${caught.status} ${caught.code}: ${caught.detail}`
          : String(caught),
      );
    } finally {
      setBusy(false);
    }
  }, [index]);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Raw response inspector</CardTitle>
          <p className="mt-0.5 text-xs text-muted">
            Read-only endpoints, fetched through the same proxy the product uses. Secrets are
            redacted server-side before the response reaches this page.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={index}
            onChange={(event) => setIndex(Number(event.target.value))}
            className="w-64"
            aria-label="Endpoint"
          >
            {INSPECTABLE.map((entry, i) => (
              <option key={entry.label} value={i}>
                {entry.label}
              </option>
            ))}
          </Select>
          <Button variant="primary" onClick={fetchIt} disabled={busy}>
            <RefreshCw className={busy ? "animate-spin" : undefined} />
            Fetch
          </Button>
        </div>

        {error !== null && (
          <p className="rounded-lg bg-critical-wash px-3 py-2 font-mono text-xs text-critical">
            {error}
          </p>
        )}

        {payload !== null && (
          <pre className="max-h-[28rem] overflow-auto rounded-lg bg-ink p-4 font-mono text-[0.7rem] leading-relaxed text-white/85">
            {JSON.stringify(payload, null, 2)}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}

export default function DeveloperConsolePage() {
  const readiness = useReadiness();
  const metrics = useEvaluationMetrics();
  const policy = usePolicyParameters();
  const chain = useAuditChain();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Developer Lab"
        description="Internal diagnostics: service configuration, ledger and chain invariants, and raw API responses. Not part of the product experience."
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              void readiness.refetch();
              void metrics.refetch();
              void policy.refetch();
              void chain.refetch();
            }}
          >
            <RefreshCw />
            Refresh
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Service</CardTitle>
          </CardHeader>
          <CardContent>
            {readiness.isPending ? (
              <LoadingBlock />
            ) : readiness.isError ? (
              <ErrorState
                detail={readiness.error.message}
                onRetry={() => void readiness.refetch()}
              />
            ) : (
              <Rows>
                <Row label="Status">
                  <Badge tone={readiness.data.status === "ready" ? "positive" : "caution"}>
                    {readiness.data.status}
                  </Badge>
                </Row>
                <Row label="Version">{readiness.data.version}</Row>
                <Row label="Run mode">{readiness.data.run_mode}</Row>
                <Row label="Environment">{readiness.data.environment}</Row>
                <Row label="Model provider">{readiness.data.model_provider}</Row>
                <Row label="Test credits only">
                  <Check ok={readiness.data.test_credits_only} label={String(readiness.data.test_credits_only)} />
                </Row>
              </Rows>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Invariants</CardTitle>
              <p className="mt-0.5 text-xs text-muted">
                Both must hold at all times. A failure here means the ledger or the audit chain
                disagrees with itself, which is a stop-everything condition.
              </p>
            </div>
          </CardHeader>
          <CardContent>
            {metrics.isPending ? (
              <LoadingBlock />
            ) : metrics.isError ? (
              <ErrorState detail={metrics.error.message} onRetry={() => void metrics.refetch()} />
            ) : (
              <Rows>
                <Row label="Double-entry ledger">
                  <Check
                    ok={metrics.data.ledger_balanced}
                    label={metrics.data.ledger_balanced ? "Balanced" : "Imbalanced"}
                  />
                </Row>
                <Row label="Imbalance detail">
                  {Object.keys(metrics.data.ledger_imbalance).length === 0 ? (
                    <span className="text-muted">None</span>
                  ) : (
                    <span className="font-mono text-xs text-critical">
                      {JSON.stringify(metrics.data.ledger_imbalance)}
                    </span>
                  )}
                </Row>
                <Row label="Audit hash chain">
                  <Check
                    ok={metrics.data.audit_chain_intact}
                    label={metrics.data.audit_chain_intact ? "Intact" : "Broken"}
                  />
                </Row>
                <Row label="Chain verified through">
                  {chain.isPending ? (
                    <span className="text-muted">Checking…</span>
                  ) : chain.isError || chain.data === undefined ? (
                    <Unavailable detail="The chain verification endpoint could not be reached." />
                  ) : chain.data.intact ? (
                    <span className="text-positive">No break found</span>
                  ) : (
                    <span className="tnum text-critical">
                      broken at sequence {chain.data.first_broken_seq}
                    </span>
                  )}
                </Row>
              </Rows>
            )}
          </CardContent>
        </Card>
      </div>

      <Section
        title="Policy parameters"
        description="The values the deterministic engine actually runs with, read from the service rather than restated here."
      >
        <Card>
          <CardContent className="pt-4">
            {policy.isPending ? (
              <LoadingBlock lines={6} />
            ) : policy.isError ? (
              <ErrorState detail={policy.error.message} onRetry={() => void policy.refetch()} />
            ) : (
              <div className="grid gap-x-8 gap-y-1 md:grid-cols-2">
                <Rows>
                  <Row label="Advance rate">{percent(policy.data.credit_policy.advance_rate_ppm)}</Row>
                  <Row label="Loss given default">
                    {percent(policy.data.credit_policy.lgd_ppm_default)}
                  </Row>
                  <Row label="Auto-approve max PD">
                    {percent(policy.data.credit_policy.auto_approve_max_pd_ppm, 2)}
                  </Row>
                  <Row label="Auto-approve max expected-loss ratio">
                    {percent(policy.data.credit_policy.auto_approve_max_el_ratio_ppm, 2)}
                  </Row>
                  <Row label="Credit fee">{ppmToBps(policy.data.credit_policy.fee_rate_ppm)}</Row>
                  <Row label="Decision version">
                    <span className="font-mono text-xs">{policy.data.credit_policy.decision_version}</span>
                  </Row>
                  <Row label="Scorecard version">
                    <span className="font-mono text-xs">{policy.data.credit_policy.scorecard_version}</span>
                  </Row>
                </Rows>
                <Rows>
                  <Row label="Active vault controls">
                    <span className="tnum">{policy.data.risk_policy.active_controls}</span>
                  </Row>
                  <Row label="Velocity window">
                    <span className="tnum">
                      {policy.data.risk_policy.velocity_max_transactions} in{" "}
                      {policy.data.risk_policy.velocity_window_seconds / 60} min
                    </span>
                  </Row>
                  <Row label="Default transaction cap">
                    <span className="tnum">{policy.data.risk_policy.max_transactions_default}</span>
                  </Row>
                  <Row label="Anti-splitting">{policy.data.risk_policy.anti_splitting}</Row>
                  <Row label="Model provider">{policy.data.environment.model_provider}</Row>
                  <Row label="Voice provider">{policy.data.environment.voice_provider}</Row>
                  <Row label="Test credits only">
                    <Check
                      ok={policy.data.environment.test_credits_only}
                      label={String(policy.data.environment.test_credits_only)}
                    />
                  </Row>
                </Rows>
                <p className="mt-3 text-xs leading-relaxed text-muted md:col-span-2">
                  <ChevronRight className="mr-1 inline size-3 text-faint" />
                  Approved limit ={" "}
                  <span className="font-mono">{policy.data.credit_policy.limit_formula}</span>
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </Section>

      <Section title="Inspector">
        <Inspector />
      </Section>
    </div>
  );
}
