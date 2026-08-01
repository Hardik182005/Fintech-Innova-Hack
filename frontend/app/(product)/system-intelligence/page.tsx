"use client";

import * as React from "react";
import {
  Banknote,
  CheckCircle2,
  Gauge,
  Pause,
  Play,
  RefreshCw,
  XCircle,
  ZapOff,
} from "lucide-react";

import { AuthorityNote, PageHeader, Section } from "@/components/data/section";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/data/states";
import { Metric, Mono, Row, Rows } from "@/components/data/value";
import { EnvelopeValue, envelopeOk, sampleNote } from "@/components/system-intelligence/envelope";
import { PipelineRail } from "@/components/system-intelligence/pipeline";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoHint, Tooltip } from "@/components/ui/tooltip";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { count, dateTimeOf, humanise, relativeTime } from "@/lib/format";
import { useSystemIntelligence } from "@/lib/queries";
import type {
  AssuranceComponents,
  MetricEnvelope,
  ServiceHealthEntry,
  ServiceHealthStatus,
  SystemIntelligence,
  SystemIntelligenceWindow,
} from "@/lib/types";

/**
 * System Intelligence — the engine room, shown honestly.
 *
 * One rule runs through this page: a figure appears only when the backend
 * genuinely produced it. Every rate, count, duration and amount arrives in a
 * metric envelope, and every envelope reaches the screen through one shared
 * renderer (components/system-intelligence/envelope.tsx) that turns a non-ok
 * status into its truthful absence — "not evaluated", "not connected",
 * "insufficient sample" — and never into a zero. Nothing here is estimated,
 * nothing is hardcoded, and a section with nothing to report says so.
 */

const WINDOWS: SystemIntelligenceWindow[] = ["1h", "24h", "7d", "30d"];

const REFRESH_INTERVAL_MS = 15_000;

const SCORE_HINT =
  "A weighted composite: 20% identity verification + 20% decision agreement + 20% evidence " +
  "grounding + 15% hallucination containment + 15% adversarial block rate + 10% repayment " +
  "invariant. It is a system assurance measure, not a guarantee of loan repayment, and it " +
  "exists only when all six components come from a real evaluation run.";

const NAV_SECTIONS = [
  { id: "assurance", label: "Assurance" },
  { id: "pipeline", label: "Decision pipeline" },
  { id: "ai-quality", label: "AI quality" },
  { id: "models", label: "Models" },
  { id: "credit-engine", label: "Credit engine" },
  { id: "financial-safety", label: "Financial safety" },
  { id: "repayment", label: "Repayment" },
  { id: "service-health", label: "Service health" },
  { id: "fail-closed", label: "Fail-closed events" },
  { id: "infrastructure", label: "Infrastructure" },
] as const;

const ASSURANCE_COMPONENTS: {
  key: keyof AssuranceComponents;
  label: string;
  weight: string;
  hint?: string;
}[] = [
  { key: "identity_verification_accuracy", label: "Identity verification accuracy", weight: "20%" },
  {
    key: "underwriting_decision_agreement",
    label: "Underwriting decision agreement",
    weight: "20%",
    hint:
      "AI recommendation direction versus the deterministic outcome, on evaluated cases only. " +
      "It is never a live approval rate relabelled as accuracy.",
  },
  { key: "evidence_grounding_rate", label: "Evidence grounding rate", weight: "20%" },
  {
    key: "hallucination_containment_rate",
    label: "Hallucination containment rate",
    weight: "15%",
    hint:
      "An INSUFFICIENT_EVIDENCE reply counts toward containment, not against it — declining to " +
      "invent is the system working.",
  },
  { key: "adversarial_policy_block_rate", label: "Adversarial policy block rate", weight: "15%" },
  { key: "repayment_invariant_pass_rate", label: "Repayment invariant pass rate", weight: "10%" },
];

const HEALTH_TONE: Record<ServiceHealthStatus, BadgeTone> = {
  healthy: "positive",
  degraded: "caution",
  down: "critical",
  idle: "outline",
  not_connected: "outline",
};

const HEALTH_LABEL: Record<ServiceHealthStatus, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  down: "Down",
  idle: "Idle",
  not_connected: "Not connected",
};

const COMPONENT_LABEL: Record<string, string> = {
  api: "API",
  database: "Database",
  opa: "Policy engine (OPA)",
  model_runtime: "Model runtime",
};

export default function SystemIntelligencePage() {
  const [timeWindow, setTimeWindow] = React.useState<SystemIntelligenceWindow>("24h");
  const [live, setLive] = React.useState(true);

  const query = useSystemIntelligence(timeWindow, {
    // Data refresh only — the query refetches in place, the page never reloads.
    refetchInterval: live ? REFRESH_INTERVAL_MS : false,
  });

  const notDeployed =
    query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 501);

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Intelligence"
        description={
          <span>
            Windowed telemetry for the whole credit pipeline: what ran, what was refused on
            purpose, and what cannot honestly be measured yet.{" "}
            {query.data !== undefined && (
              <span className="whitespace-nowrap">
                Updated {relativeTime(query.data.generated_at)}.
              </span>
            )}
            <AuthorityNote className="mt-1" />
          </span>
        }
        actions={
          <>
            <Badge tone="caution">Sandbox — Test Credits</Badge>
            <WindowSelector value={timeWindow} onChange={setTimeWindow} />
            <Button
              variant="secondary"
              onClick={() => setLive((v) => !v)}
              aria-pressed={live}
              title={
                live
                  ? "Auto-refresh is on: data refetches every 15 seconds."
                  : "Auto-refresh is paused."
              }
            >
              {live ? <Pause /> : <Play />}
              {live ? "Live" : "Paused"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
              aria-label="Refresh now"
            >
              <RefreshCw className={query.isFetching ? "animate-spin" : undefined} />
              Refresh
            </Button>
          </>
        }
      />

      {query.isPending ? (
        <PageSkeleton />
      ) : query.isError ? (
        <Card>
          <ErrorState
            title={
              notDeployed
                ? "The telemetry endpoint is not deployed in this environment yet"
                : "System telemetry could not be loaded"
            }
            detail={`${query.error.message}${
              query.error instanceof ApiError && query.error.status > 0
                ? ` (HTTP ${query.error.status}, ${query.error.code})`
                : ""
            }`}
            onRetry={() => void query.refetch()}
            className="py-16"
          />
        </Card>
      ) : (
        <div className="flex items-start gap-8">
          <div className="min-w-0 flex-1 space-y-6">
            <KpiGrid data={query.data} />
            <AssuranceSection data={query.data} />
            <PipelineSection data={query.data} />
            <AiQualitySection data={query.data} />
            <ModelsSection data={query.data} />
            <CreditEngineSection data={query.data} />
            <FinancialSafetySection data={query.data} />
            <RepaymentSection data={query.data} />
            <ServiceHealthSection data={query.data} />
            <FailClosedSection data={query.data} />
            <InfrastructureSection data={query.data} />
          </div>
          <SectionNav />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- controls -- */

function WindowSelector({
  value,
  onChange,
}: {
  value: SystemIntelligenceWindow;
  onChange: (next: SystemIntelligenceWindow) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Time window"
      className="flex items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5"
    >
      {WINDOWS.map((w) => (
        <button
          key={w}
          type="button"
          onClick={() => onChange(w)}
          aria-pressed={value === w}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            value === w ? "bg-ink text-white" : "text-muted hover:bg-surface-muted hover:text-ink",
          )}
        >
          {w}
        </button>
      ))}
    </div>
  );
}

function SectionNav() {
  return (
    <nav aria-label="Page sections" className="hidden w-44 shrink-0 xl:block">
      <div className="sticky top-20">
        <p className="eyebrow mb-2 px-2">On this page</p>
        <ul className="space-y-0.5">
          {NAV_SECTIONS.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="block rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-surface-muted hover:text-ink"
              >
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading system intelligence">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Card key={i}>
            <CardContent className="pt-5">
              <LoadingBlock lines={2} />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="pt-5">
          <LoadingBlock lines={5} />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-5">
          <LoadingBlock lines={4} />
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------ kpi cards -- */

function KpiCard({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="group block rounded-xl">
      <Card className="h-full transition-colors group-hover:border-faint">
        <CardContent className="pt-5">{children}</CardContent>
      </Card>
    </a>
  );
}

function KpiGrid({ data }: { data: SystemIntelligence }) {
  const score = data.assurance.score;
  const health = rollupHealth(data.service_health);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <KpiCard href="#assurance">
        <Metric
          label="System assurance"
          hint={SCORE_HINT}
          value={
            envelopeOk(score) ? (
              <span>
                <EnvelopeValue envelope={score} />
                <span className="text-sm font-normal text-muted"> / 100</span>
              </span>
            ) : (
              <EnvelopeValue
                envelope={score}
                absentText="Not enough evaluated cases"
                detail="The score is computed only when every component metric comes from a completed evaluation run — it is never estimated or hardcoded."
              />
            )
          }
          sub={
            data.assurance.last_evaluation_run_at === null
              ? "no evaluation run recorded"
              : `last evaluation run ${relativeTime(data.assurance.last_evaluation_run_at)}`
          }
        />
      </KpiCard>

      <KpiCard href="#pipeline">
        <Metric
          label="Requests processed"
          value={<EnvelopeValue envelope={data.summary.requests_processed} label />}
          sub={
            <span>
              <EnvelopeValue envelope={data.summary.approvals} /> approved ·{" "}
              <EnvelopeValue envelope={data.summary.controlled_rejections} /> controlled
              rejections · <EnvelopeValue envelope={data.summary.human_reviews} /> human review
            </span>
          }
        />
      </KpiCard>

      <KpiCard href="#ai-quality">
        <Metric
          label="Evidence grounding"
          hint="Share of model claims that trace to stored evidence, from evaluated cases only."
          value={
            <EnvelopeValue envelope={data.assurance.components.evidence_grounding_rate} label />
          }
          sub={
            sampleNote(data.assurance.components.evidence_grounding_rate) ??
            "no evaluated sample in this window"
          }
        />
      </KpiCard>

      <KpiCard href="#financial-safety">
        <Metric
          label="Financial safety"
          hint="The summed value of spend attempts the deterministic controls refused in this window. Computed from real blocked transactions — never estimated."
          value={
            <EnvelopeValue envelope={data.summary.prevented_exposure_minor} compact label />
          }
          sub={
            <span>
              <EnvelopeValue envelope={data.summary.blocked_attempts} /> attempts blocked
            </span>
          }
        />
      </KpiCard>

      <KpiCard href="#repayment">
        <Metric
          label="Repayment integrity"
          hint="Share of repayment waterfall runs whose conservation invariant held, verified against the double-entry ledger."
          value={
            <EnvelopeValue
              envelope={data.assurance.components.repayment_invariant_pass_rate}
              label
            />
          }
          sub={
            <span>
              <span className={data.repayment.ledger_balanced ? undefined : "text-critical"}>
                {data.repayment.ledger_balanced ? "ledger balanced" : "ledger imbalanced"}
              </span>
              {" · "}
              <span className={data.repayment.audit_chain_intact ? undefined : "text-critical"}>
                {data.repayment.audit_chain_intact ? "audit chain intact" : "audit chain broken"}
              </span>
            </span>
          }
        />
      </KpiCard>

      <KpiCard href="#service-health">
        <Metric
          label="Platform health"
          hint="Rolled up from the service's own health probes. A component is never shown healthy without a real check behind it."
          value={
            <span className={cn("inline-flex items-center gap-2", health.textClass)}>
              {health.icon}
              {health.label}
            </span>
          }
          sub={
            data.service_health.length === 0
              ? "no probes reporting"
              : `${count(health.healthyCount)} of ${count(data.service_health.length)} components healthy`
          }
        />
      </KpiCard>
    </div>
  );
}

function rollupHealth(entries: ServiceHealthEntry[]): {
  label: string;
  textClass?: string;
  icon: React.ReactNode;
  healthyCount: number;
} {
  const healthyCount = entries.filter((e) => e.status === "healthy").length;
  if (entries.length === 0) {
    return { label: "No probes", textClass: "text-faint", icon: null, healthyCount };
  }
  if (entries.some((e) => e.status === "down")) {
    return {
      label: "Component down",
      textClass: "text-critical",
      icon: <XCircle className="size-5" />,
      healthyCount,
    };
  }
  if (entries.some((e) => e.status === "degraded")) {
    return { label: "Degraded", textClass: "text-caution", icon: null, healthyCount };
  }
  // "idle" is not a fault, but it is not a green light either: the component
  // simply has not been exercised in this window, so it must not be folded
  // into "All healthy".
  if (entries.some((e) => e.status === "not_connected" || e.status === "idle")) {
    return { label: "Partial telemetry", textClass: "text-muted", icon: null, healthyCount };
  }
  return {
    label: "All healthy",
    textClass: "text-positive",
    icon: <CheckCircle2 className="size-5" />,
    healthyCount,
  };
}

/* ------------------------------------------------------------- sections -- */

/** Envelope + its honest denominator, as one label/value row. */
function MetricRow({
  label,
  envelope,
  hint,
  compact = false,
}: {
  label: string;
  envelope: MetricEnvelope;
  hint?: string;
  compact?: boolean;
}) {
  const sample = sampleNote(envelope);
  return (
    <Row label={label} hint={hint}>
      <span>
        <EnvelopeValue envelope={envelope} compact={compact} />
        {sample !== null && <span className="ml-1.5 text-xs text-faint">{sample}</span>}
      </span>
    </Row>
  );
}

function AssuranceSection({ data }: { data: SystemIntelligence }) {
  const score = data.assurance.score;
  return (
    <Section
      id="assurance"
      title="System Assurance"
      description="Six weighted components, each computed from real evaluated cases or honestly absent."
    >
      <Card>
        <CardHeader>
          <div className="flex items-start gap-2.5">
            <Gauge className="mt-0.5 size-4 shrink-0 text-muted" />
            <div>
              <CardTitle>
                <span className="inline-flex items-center gap-1.5">
                  Assurance score
                  <InfoHint content={SCORE_HINT} />
                </span>
              </CardTitle>
              <CardDescription>
                A system assurance measure, not a guarantee of loan repayment.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <div className="text-3xl font-semibold tracking-tight text-ink">
              {envelopeOk(score) ? (
                <span>
                  <EnvelopeValue envelope={score} />
                  <span className="text-base font-normal text-muted"> / 100</span>
                </span>
              ) : (
                <EnvelopeValue
                  envelope={score}
                  absentText="Not enough evaluated cases"
                  detail="The score exists only when all six components are ok. It is never estimated, never hardcoded, and never shown from a partial evaluation."
                />
              )}
            </div>
            <span className="text-xs text-muted">
              Last evaluation run:{" "}
              {data.assurance.last_evaluation_run_at === null
                ? "none recorded"
                : `${relativeTime(data.assurance.last_evaluation_run_at)} (${dateTimeOf(data.assurance.last_evaluation_run_at)})`}
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {ASSURANCE_COMPONENTS.map(({ key, label, weight, hint }) => {
              const envelope = data.assurance.components[key];
              const sample = sampleNote(envelope);
              return (
                <div key={key} className="rounded-lg border border-line-soft p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs text-muted">
                      {label}
                      {hint !== undefined && <InfoHint content={hint} />}
                    </span>
                    <span className="eyebrow shrink-0">{weight}</span>
                  </div>
                  <div className="mt-1.5 text-lg font-semibold tracking-tight text-ink">
                    <EnvelopeValue envelope={envelope} label />
                  </div>
                  {sample !== null && (
                    <div className="mt-0.5 text-[0.6875rem] text-faint">{sample}</div>
                  )}
                </div>
              );
            })}
          </div>

          <p className="mt-4 border-t border-line-soft pt-3 text-xs leading-relaxed text-muted">
            A component reading &ldquo;not evaluated&rdquo; or &ldquo;insufficient sample&rdquo; is
            telling the truth: no evaluation run has produced that figure yet. This page never
            displays unavailable data as zero.
          </p>
        </CardContent>
      </Card>
    </Section>
  );
}

function PipelineSection({ data }: { data: SystemIntelligence }) {
  return (
    <Section
      id="pipeline"
      title="Live Credit Decision Pipeline"
      description="Sixteen stages in fixed order. Click a stage for its full telemetry. A stage with no recorded telemetry says so — it does not claim zeros."
      actions={
        <span className="text-xs text-muted">
          Success rate{" "}
          <EnvelopeValue envelope={data.summary.pipeline_success_rate} className="text-ink" /> ·
          True errors <EnvelopeValue envelope={data.summary.true_errors} className="text-ink" />
        </span>
      }
    >
      <PipelineRail pipeline={data.pipeline} />
    </Section>
  );
}

function AiQualitySection({ data }: { data: SystemIntelligence }) {
  return (
    <Section
      id="ai-quality"
      title="AI quality"
      description="How the bounded model behaved — including the times it correctly refused to answer."
    >
      <Card>
        <CardContent className="grid gap-x-8 gap-y-5 pt-5 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Structured output validity"
            hint="Share of model replies that parsed against the required schema on the first attempt."
            value={<EnvelopeValue envelope={data.ai_quality.structured_output_validity} label />}
            sub={sampleNote(data.ai_quality.structured_output_validity) ?? undefined}
          />
          <Metric
            label="Verifier disagreement"
            hint="How often the independent verifier contradicted the analyst's claims. Disagreement is the check working, not the system failing."
            value={<EnvelopeValue envelope={data.ai_quality.verifier_disagreement_rate} label />}
            sub={sampleNote(data.ai_quality.verifier_disagreement_rate) ?? undefined}
          />
          <Metric
            label="Model fallback"
            hint="Share of requests where the primary model was unavailable and a fallback path ran instead."
            value={<EnvelopeValue envelope={data.ai_quality.model_fallback_rate} label />}
            sub={sampleNote(data.ai_quality.model_fallback_rate) ?? undefined}
          />
          <Metric
            label="Evidence refusals"
            hint="Times the model returned INSUFFICIENT_EVIDENCE instead of guessing. Each one is successful containment — the system declining to invent — and counts toward hallucination containment, not against it."
            value={
              <EnvelopeValue envelope={data.ai_quality.insufficient_evidence_responses} label />
            }
            sub="successful containment, not failure"
          />
        </CardContent>
      </Card>
    </Section>
  );
}

function ModelsSection({ data }: { data: SystemIntelligence }) {
  const calls = data.models.external_llm_api_calls;
  return (
    <Section
      id="models"
      title="Models"
      description="Read from the running service's configuration and telemetry, not asserted by this page."
    >
      <Card>
        <CardContent className="pt-4">
          <Rows>
            <Row label="Provider">
              <Mono>{data.models.provider}</Mono>
            </Row>
            <Row label="Analyst model">
              {data.models.analyst_model === null ? (
                <EnvelopeValue envelope={null} label detail="The runtime did not report an analyst model." />
              ) : (
                <Mono>{data.models.analyst_model}</Mono>
              )}
            </Row>
            <Row label="Critic model">
              {data.models.critic_model === null ? (
                <EnvelopeValue envelope={null} label detail="The runtime did not report a critic model." />
              ) : (
                <Mono>{data.models.critic_model}</Mono>
              )}
            </Row>
            <Row label="External LLM API calls">
              {envelopeOk(calls) ? (
                <Tooltip content="Verified from configuration and telemetry, not hardcoded.">
                  <Badge tone={calls.value === 0 ? "positive" : "neutral"}>
                    <EnvelopeValue envelope={calls} />
                    external calls
                  </Badge>
                </Tooltip>
              ) : (
                <EnvelopeValue
                  envelope={calls}
                  label
                  detail="This figure is only ever shown when it can be verified from configuration and telemetry — it is never hardcoded, so an unverifiable zero is not claimed."
                />
              )}
            </Row>
          </Rows>
        </CardContent>
      </Card>
    </Section>
  );
}

function CreditEngineSection({ data }: { data: SystemIntelligence }) {
  return (
    <Section
      id="credit-engine"
      title="Credit engine"
      description="The deterministic engine that actually decides. Observability only — nothing on this page can act on it."
    >
      <Card>
        <CardContent className="pt-4">
          <Rows>
            <Row label="Decision engine version">
              <Mono>{data.credit_engine.decision_version}</Mono>
            </Row>
            <Row label="Scorecard version">
              <Mono>{data.credit_engine.scorecard_version}</Mono>
            </Row>
            <MetricRow label="Decisions in window" envelope={data.credit_engine.decisions} />
            <MetricRow label="Auto-approved" envelope={data.credit_engine.auto_approved} />
            <MetricRow
              label="Auto-rejected"
              hint="Deterministic rejections are controlled outcomes, recorded with reason codes."
              envelope={data.credit_engine.auto_rejected}
            />
            <MetricRow
              label="Referred to human"
              envelope={data.credit_engine.referred_to_human}
            />
          </Rows>
        </CardContent>
        <CardFooter>
          <AuthorityNote />
        </CardFooter>
      </Card>
    </Section>
  );
}

function FinancialSafetySection({ data }: { data: SystemIntelligence }) {
  const denials = data.financial_safety.policy_denials_by_code;
  const maxDenials = denials.reduce((max, d) => Math.max(max, d.count), 0);

  return (
    <Section
      id="financial-safety"
      title="Financial safety"
      description="What the deterministic controls refused. A large number here is the system refusing, not failing."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Policy denials by code</CardTitle>
              <CardDescription>
                Real counts from recorded policy decisions in this window.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {denials.length === 0 ? (
              <EmptyState
                title="No policy denials in this window"
                body="When the policy engine refuses a request, the refusal and its code are recorded here."
                className="py-6"
              />
            ) : (
              <div className="space-y-1">
                {denials.map((denial) => (
                  <div key={denial.code} className="py-1.5">
                    <div className="flex items-baseline justify-between gap-4 text-xs">
                      <span className="font-mono text-body">{denial.code}</span>
                      <span className="tnum font-medium text-ink">{count(denial.count)}</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                      <div
                        className="h-full rounded-full bg-info"
                        style={{
                          width: `${maxDenials > 0 ? (denial.count / maxDenials) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Containment</CardTitle>
              <CardDescription>Money and authority the controls took off the table.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Rows>
              <MetricRow label="Frozen vaults" envelope={data.financial_safety.frozen_vaults} />
              <MetricRow label="Revoked agents" envelope={data.financial_safety.revoked_agents} />
              <MetricRow
                label="Prevented exposure"
                hint="The summed value of blocked spend attempts. This money never left the platform."
                envelope={data.financial_safety.prevented_exposure_minor}
              />
            </Rows>
          </CardContent>
        </Card>
      </div>
    </Section>
  );
}

function RepaymentSection({ data }: { data: SystemIntelligence }) {
  return (
    <Section
      id="repayment"
      title="Repayment"
      description="Waterfall runs and the conservation invariant, verified against the double-entry ledger."
    >
      <Card>
        <CardContent className="pt-4">
          <Rows>
            <MetricRow label="Waterfall runs" envelope={data.repayment.waterfall_runs} />
            <MetricRow
              label="Invariants checked"
              hint="Incoming revenue must equal principal + credit fee + platform fee + owner proceeds, in integer arithmetic, on every run."
              envelope={data.repayment.invariant_checked}
            />
            <MetricRow label="Invariants passed" envelope={data.repayment.invariant_passed} />
            <Row label="Ledger balanced" hint="Verified live against the double-entry ledger, not assumed.">
              {data.repayment.ledger_balanced ? (
                <span className="inline-flex items-center gap-1.5 text-positive">
                  <CheckCircle2 className="size-4" /> Balanced
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-critical">
                  <XCircle className="size-4" /> Imbalanced
                </span>
              )}
            </Row>
            <Row
              label="Audit chain"
              hint="Every critical financial event is SHA-256 chained to its predecessor and re-verified by re-hashing the chain."
            >
              {data.repayment.audit_chain_intact ? (
                <span className="inline-flex items-center gap-1.5 text-positive">
                  <CheckCircle2 className="size-4" /> Intact
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-critical">
                  <XCircle className="size-4" /> Broken
                </span>
              )}
            </Row>
          </Rows>
        </CardContent>
      </Card>
    </Section>
  );
}

function ServiceHealthSection({ data }: { data: SystemIntelligence }) {
  return (
    <Section
      id="service-health"
      title="Service health"
      description="From the service's own probes — a page rendering does not make a component healthy."
    >
      <Card>
        <CardContent className="pt-5">
          {data.service_health.length === 0 ? (
            <EmptyState
              title="No health probes reporting"
              body="Component status appears only when a real probe has run. Nothing is assumed healthy."
              className="py-6"
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {data.service_health.map((entry) => (
                <div key={entry.component} className="rounded-lg border border-line-soft p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-ink">
                      {COMPONENT_LABEL[entry.component] ?? humanise(entry.component)}
                    </span>
                    <Badge tone={HEALTH_TONE[entry.status]} size="sm">
                      {HEALTH_LABEL[entry.status]}
                    </Badge>
                  </div>
                  {entry.detail !== null && entry.detail !== "" && (
                    <p className="mt-1.5 text-xs leading-relaxed text-muted">{entry.detail}</p>
                  )}
                  <p className="mt-1.5 text-[0.6875rem] text-faint">
                    Checked {relativeTime(entry.checked_at)}
                  </p>
                </div>
              ))}
            </div>
          )}
          <p className="mt-4 border-t border-line-soft pt-3 text-xs leading-relaxed text-muted">
            A component is never shown healthy without a real probe behind it. Each status above
            carries the timestamp of the check that produced it.
          </p>
        </CardContent>
      </Card>
    </Section>
  );
}

function FailClosedSection({ data }: { data: SystemIntelligence }) {
  return (
    <Section
      id="fail-closed"
      title="Fail-closed events"
      description="When a dependency failed, the system refused to proceed rather than guess. Those refusals are recorded here."
    >
      <Card>
        <CardContent className="pt-2">
          {data.fail_closed_events.length === 0 ? (
            <EmptyState
              icon={ZapOff}
              title="No fail-closed events in this window — nothing needed to refuse"
              body="When a dependency fails, the system halts the affected action instead of proceeding on incomplete information. Each such refusal would appear here."
              className="py-8"
            />
          ) : (
            <ol className="divide-y divide-line-soft">
              {data.fail_closed_events.map((event, index) => (
                <li
                  key={`${event.at}-${index}`}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5"
                >
                  <span className="text-xs whitespace-nowrap text-muted">
                    {dateTimeOf(event.at)}
                  </span>
                  <span className="font-mono text-xs text-body">{event.component}</span>
                  <span className="text-sm font-medium text-ink">{humanise(event.action)}</span>
                  <span className="text-xs leading-relaxed text-muted">{event.detail}</span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </Section>
  );
}

function InfrastructureSection({ data }: { data: SystemIntelligence }) {
  return (
    <Section
      id="infrastructure"
      title="Infrastructure"
      description="Cost figures are only ever shown from a real billing export."
    >
      <Card>
        <CardContent className="pt-2">
          {data.infrastructure.billing_connected ? (
            <Rows>
              <Row label="Billing">Connected</Row>
            </Rows>
          ) : (
            <EmptyState
              icon={Banknote}
              title={data.infrastructure.note !== "" ? data.infrastructure.note : "Billing data not connected"}
              body="No billing source is configured in this deployment, so no cost figure exists. This page does not estimate one."
              className="py-8"
            />
          )}
        </CardContent>
      </Card>
    </Section>
  );
}
