"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  ShieldAlert,
  Snowflake,
  XCircle,
} from "lucide-react";

import { ExposureChart } from "@/components/charts/exposure-chart";
import { PageHeader, Section } from "@/components/data/section";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/data/states";
import { Metric, MoneyValue, Row, Rows } from "@/components/data/value";
import { Badge } from "@/components/ui/badge";
import { Button, buttonStyle } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Meter } from "@/components/ui/meter";
import { Skeleton } from "@/components/ui/skeleton";
import { count, money, moneyCompact, percent, relativeTime, shortId } from "@/lib/format";
import { useActivity, useDashboard, useExposureSeries } from "@/lib/queries";
import type { DashboardSummary } from "@/lib/types";

/**
 * Overview — the portfolio at a glance.
 *
 * The ordering is deliberate: money first, then whether the controls held, then
 * what needs a human. Integrity sits high on the page rather than buried in a
 * settings screen, because if the ledger or the audit chain has broken, nothing
 * else on this page can be trusted and the reader needs to know that before
 * they read the numbers.
 */

function KpiSkeleton() {
  return (
    <Card>
      <CardContent className="pt-5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2.5 h-7 w-32" />
        <Skeleton className="mt-2.5 h-3 w-20" />
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const summary = useDashboard();
  const exposure = useExposureSeries(14);
  const activity = useActivity(12);

  const refreshAll = React.useCallback(() => {
    void summary.refetch();
    void exposure.refetch();
    void activity.refetch();
  }, [summary, exposure, activity]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Overview"
        description="Task-backed credit issued to autonomous agents, and the controls holding it in place."
        actions={
          <>
            {summary.data !== undefined && (
              <span className="hidden text-xs text-muted sm:inline">
                Updated {relativeTime(summary.data.generated_at)}
              </span>
            )}
            <Button variant="secondary" onClick={refreshAll} disabled={summary.isFetching}>
              <RefreshCw className={summary.isFetching ? "animate-spin" : undefined} />
              Refresh
            </Button>
          </>
        }
      />

      {summary.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <KpiSkeleton key={i} />
          ))}
        </div>
      ) : summary.isError ? (
        <Card>
          <CardContent className="pt-5">
            <ErrorState detail={summary.error.message} onRetry={() => void summary.refetch()} />
          </CardContent>
        </Card>
      ) : (
        <Portfolio data={summary.data} />
      )}

      <Section
        title="Recent activity"
        description="Drawn from the tamper-evident audit chain, newest first."
        actions={
          <Link
            href="/audit"
            className="flex items-center gap-1 text-xs font-medium text-info hover:underline"
          >
            Full audit trail <ArrowRight className="size-3.5" />
          </Link>
        }
      >
        <Card>
          <CardContent className="pt-4">
            {activity.isPending ? (
              <LoadingBlock lines={6} />
            ) : activity.isError ? (
              <ErrorState detail={activity.error.message} onRetry={() => void activity.refetch()} />
            ) : activity.data.length === 0 ? (
              <EmptyState
                title="Nothing has happened yet"
                body="Register an agent or run a demonstration scenario, and every financial event will be chained here."
                action={
                  <Link href="/judge-demo" className={buttonStyle({ variant: "primary" })}>
                    Run a scenario
                  </Link>
                }
              />
            ) : (
              <ol className="divide-y divide-line-soft">
                {activity.data.map((event) => (
                  <li key={event.seq} className="flex items-baseline gap-3 py-2.5">
                    <span className="tnum w-10 shrink-0 text-xs text-faint">#{event.seq}</span>
                    <span className="min-w-0 flex-1 text-sm text-ink">{event.label}</span>
                    {event.resource_id !== null && (
                      <span className="hidden shrink-0 font-mono text-xs text-faint sm:inline">
                        {shortId(event.resource_id, 8, 4)}
                      </span>
                    )}
                    <span className="shrink-0 text-xs text-muted">
                      {relativeTime(event.created_at)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </Section>
    </div>
  );
}

/** Everything below the header once the summary has actually arrived. */
function Portfolio({ data }: { data: DashboardSummary }) {
  const exposure = useExposureSeries(14);

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <Metric
              label="Credit approved"
              hint="Total limit granted across all approved applications in this workspace."
              value={<MoneyValue minor={data.credit.approved_minor} compact />}
              sub={`${count(data.applications.approved)} of ${count(data.applications.total)} applications approved`}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <Metric
              label="Outstanding"
              hint="Principal drawn from vaults and not yet repaid. This is the money genuinely at stake right now."
              value={<MoneyValue minor={data.credit.outstanding_minor} compact />}
              sub={
                <span className="flex items-center gap-2">
                  <Meter
                    value={data.credit.outstanding_minor}
                    max={data.credit.approved_minor}
                    tone="caution"
                    label="Outstanding against approved"
                    className="w-20"
                  />
                  <span>of {moneyCompact(data.credit.approved_minor)} approved</span>
                </span>
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <Metric
              label="Repayment rate"
              hint="Vaults that settled in full, over vaults that reached a terminal state. Vaults still running are not counted — they have not had the chance to repay yet."
              value={<span className="tnum">{percent(data.repayments.repayment_rate_ppm)}</span>}
              absent={
                data.repayments.repayment_rate_ppm === null
                  ? {
                      reason: "insufficient",
                      detail:
                        "No vault has reached a terminal state yet, so there is no denominator. This is not a 0% repayment rate.",
                    }
                  : undefined
              }
              sub={`${count(data.repayments.settled_vaults)} settled of ${count(data.repayments.terminal_vaults)} concluded`}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <Metric
              label="Blocked exposure"
              hint="Value of spend attempts the vault controls refused. This money was never allowed to leave."
              value={<MoneyValue minor={data.transactions.blocked_value_minor} compact />}
              sub={`${count(data.transactions.blocked)} of ${count(data.transactions.proposed)} attempts blocked`}
            />
          </CardContent>
        </Card>
      </div>

      <IntegrityStrip integrity={data.integrity} />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Exposure over the last 14 days</CardTitle>
              <p className="mt-0.5 text-xs text-muted">
                Approved limits, principal actually drawn, and principal repaid.
              </p>
            </div>
          </CardHeader>
          <CardContent>
            {exposure.isPending ? (
              <Skeleton className="h-64 w-full" />
            ) : exposure.isError ? (
              <ErrorState detail={exposure.error.message} onRetry={() => void exposure.refetch()} />
            ) : (
              <ExposureChart data={exposure.data} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Where the money went</CardTitle>
          </CardHeader>
          <CardContent>
            <Rows>
              <Row label="Repaid principal" hint="Returned to the credit pool from task revenue.">
                <MoneyValue minor={data.credit.repaid_minor} />
              </Row>
              <Row label="Credit fees earned">
                <MoneyValue minor={data.credit.fees_minor} />
              </Row>
              <Row label="Released to owners" hint="Task proceeds paid out after the waterfall.">
                <MoneyValue minor={data.credit.released_to_owner_minor} />
              </Row>
              <Row
                label="Recovered"
                hint="Reclaimed from failed tasks by sweeping unspent funds and drawing on the reserve."
              >
                <MoneyValue minor={data.credit.recovered_minor} />
              </Row>
              <Row
                label="At risk"
                hint="Outstanding principal on vaults that are frozen, expired or whose task failed."
              >
                <span className={data.credit.at_risk_minor > 0 ? "text-caution" : undefined}>
                  <MoneyValue minor={data.credit.at_risk_minor} />
                </span>
              </Row>
              <Row
                label="Recognised loss"
                hint="Written off explicitly after recovery was exhausted. Never inferred — a loss is booked, not assumed."
              >
                <span className={data.credit.loss_minor > 0 ? "text-critical" : undefined}>
                  <MoneyValue minor={data.credit.loss_minor} />
                </span>
              </Row>
            </Rows>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <AttentionCard
          title="Awaiting human review"
          value={data.applications.human_review}
          href="/underwriting"
          cta="Open the review queue"
          tone={data.applications.human_review > 0 ? "caution" : "neutral"}
          body="Applications the policy engine referred to a person rather than deciding automatically."
        />
        <AttentionCard
          title="Frozen vaults"
          value={data.vaults.frozen}
          href="/vaults?status=FROZEN"
          cta="Review frozen vaults"
          tone={data.vaults.frozen > 0 ? "caution" : "neutral"}
          icon={Snowflake}
          body="Spending is suspended on these facilities until an owner or policy releases them."
        />
        <AttentionCard
          title="Critical risk events"
          value={data.risk.critical}
          href="/risk"
          cta="Investigate risk"
          tone={data.risk.critical > 0 ? "critical" : "neutral"}
          icon={ShieldAlert}
          body={`${count(data.risk.total_events)} risk ${data.risk.total_events === 1 ? "event" : "events"} recorded in total.`}
        />
      </div>
    </div>
  );
}

/**
 * The two invariants that make everything else on this page meaningful. Shown
 * as a strip rather than a card so it reads as a property of the whole page.
 */
function IntegrityStrip({ integrity }: { integrity: DashboardSummary["integrity"] }) {
  const healthy = integrity.ledger_balanced && integrity.audit_chain_intact;

  return (
    <div
      className={`flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border px-4 py-3 ${
        healthy ? "border-line bg-surface" : "border-critical/30 bg-critical-wash"
      }`}
    >
      <span className="flex items-center gap-2 text-sm">
        {integrity.ledger_balanced ? (
          <CheckCircle2 className="size-4 shrink-0 text-positive" />
        ) : (
          <XCircle className="size-4 shrink-0 text-critical" />
        )}
        <span className="text-ink">
          Double-entry ledger {integrity.ledger_balanced ? "balanced" : "imbalanced"}
        </span>
        {!integrity.ledger_balanced && (
          <Badge tone="critical">
            {Object.entries(integrity.ledger_imbalance)
              .map(([currency, amount]) => `${currency} ${money(amount)}`)
              .join(", ")}
          </Badge>
        )}
      </span>

      <span className="flex items-center gap-2 text-sm">
        {integrity.audit_chain_intact ? (
          <CheckCircle2 className="size-4 shrink-0 text-positive" />
        ) : (
          <XCircle className="size-4 shrink-0 text-critical" />
        )}
        <span className="text-ink">
          Audit hash chain {integrity.audit_chain_intact ? "intact" : "broken"}
        </span>
        {integrity.first_broken_seq !== null && (
          <Badge tone="critical">first break at #{integrity.first_broken_seq}</Badge>
        )}
      </span>

      <p className="ml-auto hidden max-w-md text-xs text-muted lg:block">
        Each critical financial event is chained to the previous event so tampering can be detected.
      </p>
    </div>
  );
}

function AttentionCard({
  title,
  value,
  href,
  cta,
  body,
  tone,
  icon: Icon,
}: {
  title: string;
  value: number;
  href: string;
  cta: string;
  body: string;
  tone: "neutral" | "caution" | "critical";
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const accent =
    tone === "critical" ? "text-critical" : tone === "caution" ? "text-caution" : "text-ink";

  return (
    <Card>
      <CardContent className="flex h-full flex-col pt-5">
        <div className="flex items-start justify-between gap-3">
          <span className="eyebrow">{title}</span>
          {Icon !== undefined && <Icon className={`size-4 shrink-0 ${accent}`} />}
        </div>
        <p className={`tnum mt-1.5 text-2xl leading-none font-semibold ${accent}`}>{count(value)}</p>
        <p className="mt-2 flex-1 text-xs leading-relaxed text-muted">{body}</p>
        <Link
          href={href}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-info hover:underline"
        >
          {cta} <ArrowRight className="size-3.5" />
        </Link>
      </CardContent>
    </Card>
  );
}
