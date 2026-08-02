"use client";

import * as React from "react";
import {
  Brain,
  Calculator,
  CheckCircle2,
  ShieldQuestion,
  XCircle,
} from "lucide-react";

import { Unavailable } from "@/components/data/states";
import { statusLabel } from "@/components/data/status";
import { Mono, Row, Rows } from "@/components/data/value";
import { AuthorityNote } from "@/components/data/section";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoHint } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { count, money, percent, shortHash } from "@/lib/format";
import type {
  AiRecommendation,
  DeterministicEngine,
  IndependentVerifier,
} from "@/lib/types";

/**
 * The three-panel decision comparison — the product's argument, laid out as
 * architecture. Left: what the model thinks. Centre: what the deterministic
 * engine decided, with every cap that bound the number. Right: an independent
 * check that the model's claims trace to stored evidence.
 *
 * The centre panel is visually senior on purpose. The AI panel never shows an
 * amount, because the model never produces one.
 */

export function DecisionPanels({
  ai,
  engine,
  verifier,
}: {
  ai: AiRecommendation | null;
  engine: DeterministicEngine | null;
  verifier: IndependentVerifier;
}) {
  return (
    <div>
      <div className="grid gap-4 xl:grid-cols-3">
        <AiPanel ai={ai} />
        <EnginePanel engine={engine} />
        <VerifierPanel verifier={verifier} />
      </div>
      <AuthorityNote className="mt-3 text-center" />
    </div>
  );
}

function PanelHeading({
  icon: Icon,
  title,
  subtitle,
  badge,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  badge?: React.ReactNode;
}) {
  return (
    <CardHeader className="items-center">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-sunken">
          <Icon className="size-3.5 text-body" />
        </div>
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
        </div>
      </div>
      {badge}
    </CardHeader>
  );
}

// ------------------------------------------------------------------- AI --

function AiPanel({ ai }: { ai: AiRecommendation | null }) {
  return (
    <Card className="border-line">
      <PanelHeading
        icon={Brain}
        title="AI Recommendation"
        subtitle="Advisory only — proposes no amount"
        badge={
          ai !== null ? (
            <Badge tone={ai.schema_valid ? "info" : "caution"} size="sm">
              {ai.schema_valid ? "Schema valid" : "Schema invalid"}
            </Badge>
          ) : undefined
        }
      />
      <CardContent className="space-y-3">
        {ai === null ? (
          <div className="py-4">
            <Unavailable
              label
              detail="No model analysis ran for this application. The deterministic engine decided without one — the pipeline does not depend on the model."
            />
          </div>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-body">{ai.summary}</p>

            {ai.claims.length > 0 && (
              <div>
                <p className="eyebrow mb-1.5">Claims · each cites evidence</p>
                <ul className="space-y-1.5">
                  {ai.claims.map((claim) => (
                    <li key={claim.claim_id} className="rounded-lg bg-surface-muted px-2.5 py-2">
                      <p className="text-xs leading-relaxed text-body">{claim.text}</p>
                      <p className="mt-1 flex flex-wrap gap-1">
                        {claim.evidence_ids.map((id) => (
                          <Badge key={id} tone="outline" size="sm" className="font-mono">
                            {id.length > 14 ? `${id.slice(0, 12)}…` : id}
                          </Badge>
                        ))}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {ai.risk_flags.length > 0 && (
              <div>
                <p className="eyebrow mb-1.5">Risk flags</p>
                <div className="flex flex-wrap gap-1.5">
                  {ai.risk_flags.map((flag) => (
                    <Badge key={flag} tone="caution" size="sm">
                      {statusLabel(flag)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {ai.missing_evidence.length > 0 && (
              <div>
                <p className="eyebrow mb-1.5">Evidence the model said it lacked</p>
                <div className="flex flex-wrap gap-1.5">
                  {ai.missing_evidence.map((item) => (
                    <Badge key={item} tone="outline" size="sm">
                      {statusLabel(item)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <p className="border-t border-line-soft pt-2.5 text-xs text-muted">
              {ai.model_profile} · {ai.role}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// --------------------------------------------------------------- engine --

function EnginePanel({ engine }: { engine: DeterministicEngine | null }) {
  const approved = engine?.decision === "APPROVED" || engine?.decision === "APPROVE";

  return (
    <Card className={cn("border-2", engine === null ? "border-line" : approved ? "border-positive/40" : "border-line")}>
      <PanelHeading
        icon={Calculator}
        title="Deterministic Credit Engine"
        subtitle="The decision of record"
        badge={
          engine !== null ? (
            <Badge tone={approved ? "positive" : "critical"}>{statusLabel(engine.decision)}</Badge>
          ) : undefined
        }
      />
      <CardContent className="space-y-3">
        {engine === null ? (
          <div className="py-4">
            <Unavailable
              label
              detail="The engine has not produced a decision yet — the application is still earlier in the pipeline."
            />
          </div>
        ) : (
          <>
            <div className="rounded-xl bg-surface-muted px-4 py-3 text-center">
              <p className="eyebrow">Approved limit</p>
              <p className="tnum mt-1 text-2xl font-semibold tracking-tight text-ink">
                {money(engine.approved_limit_minor)}
              </p>
              <p className="mt-1 text-xs text-muted">
                the minimum of the five caps below
                <InfoHint content="approved_limit = min(requested, available exposure, revenue advance cap, task cost cap, policy cap). The binding cap is the smallest row." />
              </p>
            </div>

            <CapRows caps={engine.caps} approved={engine.approved_limit_minor} />

            <Rows>
              <Row label="Probability of default" hint="From the versioned integer-arithmetic scorecard, in parts-per-million.">
                <span className="tnum">{percent(engine.pd_ppm, 2)}</span>
              </Row>
              <Row label="Loss given default">
                <span className="tnum">{percent(engine.lgd_ppm)}</span>
              </Row>
              <Row label="Exposure at default">
                <span className="tnum">{money(engine.ead_minor)}</span>
              </Row>
              <Row label="Expected loss" hint="PD × LGD × EAD, computed in integer arithmetic.">
                <span className="tnum">{money(engine.expected_loss_minor)}</span>
              </Row>
              <Row label="Scorecard">
                <Mono>{engine.model_name}</Mono>
              </Row>
              {engine.receipt_hash !== null && (
                <Row label="Decision receipt" hint="Hash of the decision inputs and outputs, anchored in the audit chain.">
                  <Mono>{shortHash(engine.receipt_hash)}</Mono>
                </Row>
              )}
            </Rows>

            {engine.reason_codes.length > 0 && (
              <div>
                <p className="eyebrow mb-1.5">Reason codes</p>
                <div className="flex flex-wrap gap-1.5">
                  {engine.reason_codes.map((code) => (
                    <Badge key={code} tone={approved ? "neutral" : "critical"} size="sm">
                      {code}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** The five caps, with the binding one marked. */
function CapRows({
  caps,
  approved,
}: {
  caps: DeterministicEngine["caps"];
  approved: number;
}) {
  const entries = [
    { label: "Requested", value: caps.requested_minor },
    { label: "Available exposure", value: caps.available_exposure_minor },
    { label: "Revenue advance cap", value: caps.revenue_advance_cap_minor },
    { label: "Task cost cap", value: caps.task_cost_cap_minor },
    { label: "Policy cap", value: caps.policy_cap_minor },
  ];
  const binding = Math.min(...entries.map((entry) => entry.value));

  return (
    <div>
      <p className="eyebrow mb-1.5">The five caps</p>
      <ul className="space-y-1">
        {entries.map((entry) => {
          const isBinding = entry.value === binding && entry.value === approved;
          return (
            <li
              key={entry.label}
              className={cn(
                "flex items-baseline justify-between rounded-md px-2 py-1 text-xs",
                isBinding ? "bg-info-wash font-medium text-info" : "text-body",
              )}
            >
              <span>
                {entry.label}
                {isBinding && <span className="ml-1.5 text-[0.625rem] uppercase">binding</span>}
              </span>
              <span className="tnum">{money(entry.value)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------- verifier --

const VERDICT_COPY: Record<
  IndependentVerifier["verdict"],
  { tone: "positive" | "critical" | "neutral"; label: string }
> = {
  CLAIMS_TRACE_TO_EVIDENCE: { tone: "positive", label: "Claims trace to evidence" },
  CONTRADICTIONS_FOUND: { tone: "critical", label: "Contradictions found" },
  NO_MODEL_ANALYSIS: { tone: "neutral", label: "No model analysis to verify" },
};

function VerifierPanel({ verifier }: { verifier: IndependentVerifier }) {
  const verdict = VERDICT_COPY[verifier.verdict];

  return (
    <Card>
      <PanelHeading
        icon={ShieldQuestion}
        title="Independent Risk Verifier"
        subtitle="Re-checks every model claim against stored evidence"
        badge={<Badge tone={verdict.tone}>{verdict.label}</Badge>}
      />
      <CardContent className="space-y-3">
        <Rows>
          <Row label="Claims checked">
            <span className="tnum">{count(verifier.claims_total)}</span>
          </Row>
          <Row label="Supported by evidence">
            <span className="tnum inline-flex items-center gap-1.5 text-positive">
              <CheckCircle2 className="size-3.5" /> {count(verifier.claims_supported)}
            </span>
          </Row>
          <Row label="Unsupported">
            <span
              className={cn(
                "tnum inline-flex items-center gap-1.5",
                verifier.claims_unsupported > 0 ? "text-critical" : "text-muted",
              )}
            >
              {verifier.claims_unsupported > 0 && <XCircle className="size-3.5" />}
              {count(verifier.claims_unsupported)}
            </span>
          </Row>
          <Row
            label="Model influenced amounts"
            hint="Whether any model output reached a financial figure. The architecture makes this structurally false: amounts come only from the deterministic engine."
          >
            {verifier.model_influenced_amounts ? (
              <span className="font-medium text-critical">Yes — investigate</span>
            ) : (
              <span className="text-positive">No</span>
            )}
          </Row>
          <Row label="Output schema">
            {verifier.model_output_schema_valid ? (
              <span className="text-positive">Valid</span>
            ) : (
              <span className="text-caution">Invalid</span>
            )}
          </Row>
        </Rows>

        {verifier.unsupported.length > 0 && (
          <div>
            <p className="eyebrow mb-1.5 text-critical">Unsupported claims</p>
            <ul className="space-y-1.5">
              {verifier.unsupported.map((claim) => (
                <li
                  key={claim.claim_id}
                  className="rounded-lg border border-critical/20 bg-critical-wash px-2.5 py-2"
                >
                  <p className="text-xs leading-relaxed text-body">{claim.text}</p>
                  {claim.unknown_evidence_ids.length > 0 && (
                    <p className="mt-1 text-[0.6875rem] text-critical">
                      cites unknown evidence: {claim.unknown_evidence_ids.join(", ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {verifier.analyst_risk_flags_unverified.length > 0 && (
          <div>
            <p className="eyebrow mb-1.5">Analyst flags — echoed, not verified</p>
            <p className="mb-1.5 text-[0.6875rem] leading-relaxed text-muted">
              The same flags the analyst raised above. The verifier checks claims against
              stored evidence IDs; a flag cites none, so there is nothing here it can
              independently confirm or contradict.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {verifier.analyst_risk_flags_unverified.map((flag) => (
                <Badge key={flag} tone="caution" size="sm">
                  {statusLabel(flag)}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <p className="border-t border-line-soft pt-2.5 text-xs leading-relaxed text-muted">
          {verifier.note}
        </p>
      </CardContent>
    </Card>
  );
}
