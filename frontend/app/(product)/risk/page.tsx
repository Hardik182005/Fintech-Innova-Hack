"use client";

import * as React from "react";
import Link from "next/link";
import { ShieldAlert, Snowflake } from "lucide-react";

import { PageHeader, Section } from "@/components/data/section";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/data/states";
import { statusLabel } from "@/components/data/status";
import { CountValue, Metric, MoneyValue, Row, Rows } from "@/components/data/value";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrap,
} from "@/components/ui/table";
import { count, dateTimeOf, shortId } from "@/lib/format";
import { useLabels, useRiskEvents, useRiskSummary } from "@/lib/queries";

/**
 * Risk Monitoring — what the controls caught. The framing is deliberate: a
 * large number here is not the system failing, it is the system refusing.
 * Blocked value is money that never left.
 */

const SEVERITY_TONE: Record<string, "critical" | "caution" | "neutral"> = {
  CRITICAL: "critical",
  HIGH: "critical",
  WARN: "caution",
  MEDIUM: "caution",
  LOW: "neutral",
  INFO: "neutral",
};

export default function RiskPage() {
  const summary = useRiskSummary();
  const events = useRiskEvents();
  const labels = useLabels();

  const labelOf = React.useCallback(
    (eventType: string) => labels.data?.risk[eventType] ?? statusLabel(eventType),
    [labels.data],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Risk Monitoring"
        description="Control breaches, automatic freezes and blocked spending across the workspace. Every event here was also chained into the audit trail."
      />

      {summary.isPending ? (
        <LoadingBlock lines={4} />
      ) : summary.isError ? (
        <ErrorState detail={summary.error.message} onRetry={() => void summary.refetch()} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardContent className="pt-5">
                <Metric
                  label="Critical events"
                  value={
                    <span className={summary.data.critical_events > 0 ? "text-critical" : undefined}>
                      <CountValue value={summary.data.critical_events} />
                    </span>
                  }
                  sub={`${count(summary.data.high_events)} high · ${count(summary.data.total_events)} total`}
                />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <Metric
                  label="Blocked spending"
                  hint="Money the vault controls refused to release. It never left the platform."
                  value={<MoneyValue minor={summary.data.blocked_value_minor} compact />}
                  sub={`${count(summary.data.blocked_transactions)} attempts refused`}
                />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <Metric
                  label="Frozen"
                  value={
                    <span className="flex items-baseline gap-2">
                      <CountValue value={summary.data.frozen_vaults} />
                      <span className="text-sm font-normal text-muted">vaults</span>
                    </span>
                  }
                  sub={
                    <span className="flex items-center gap-1.5">
                      <Snowflake className="size-3" />
                      {count(summary.data.frozen_agents)} agents frozen
                    </span>
                  }
                />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <Metric
                  label="Active controls"
                  hint="Deterministic checks that run on every spend attempt: caps, allowlist, purpose binding, velocity, anti-splitting and more."
                  value={<CountValue value={summary.data.active_monitoring_rules} />}
                  sub="run on every spend attempt"
                />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Events by type</CardTitle>
              </CardHeader>
              <CardContent>
                {summary.data.events_by_type.length === 0 ? (
                  <EmptyState title="No risk events recorded" className="py-6" />
                ) : (
                  <Rows>
                    {summary.data.events_by_type.map((entry) => (
                      <Row key={entry.event_type} label={labelOf(entry.event_type)}>
                        <span className="tnum">{count(entry.count)}</span>
                      </Row>
                    ))}
                  </Rows>
                )}
              </CardContent>
            </Card>

            <div className="xl:col-span-2">
              <Section title="Event log" description="Newest first.">
                <Card>
                  <TableWrap>
                    <Table>
                      <TableHeader>
                        <TableRow className="border-t-0">
                          <TableHead>Event</TableHead>
                          <TableHead>Severity</TableHead>
                          <TableHead>Subject</TableHead>
                          <TableHead>When</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {events.isPending ? (
                          <TableRow>
                            <TableCell colSpan={4}>
                              <LoadingBlock lines={4} />
                            </TableCell>
                          </TableRow>
                        ) : events.isError ? (
                          <TableRow>
                            <TableCell colSpan={4}>
                              <ErrorState
                                detail={events.error.message}
                                onRetry={() => void events.refetch()}
                              />
                            </TableCell>
                          </TableRow>
                        ) : events.data.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4}>
                              <EmptyState
                                icon={ShieldAlert}
                                title="No risk events"
                                body="When a control refuses something, the refusal is recorded here."
                              />
                            </TableCell>
                          </TableRow>
                        ) : (
                          events.data.map((event) => (
                            <TableRow key={event.id}>
                              <TableCell className="font-medium text-ink">
                                {labelOf(event.event_type)}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  tone={SEVERITY_TONE[event.severity] ?? "neutral"}
                                  size="sm"
                                >
                                  {event.severity}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <SubjectLink
                                  subjectType={event.subject_type}
                                  subjectId={event.subject_id}
                                />
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-muted">
                                {dateTimeOf(event.created_at)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </TableWrap>
                </Card>
              </Section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SubjectLink({
  subjectType,
  subjectId,
}: {
  subjectType?: string;
  subjectId?: string;
}) {
  if (subjectId === undefined || subjectId === "") {
    return <span className="text-xs text-faint">—</span>;
  }
  const href =
    subjectType === "AGENT"
      ? `/agents/${subjectId}`
      : subjectType === "VAULT"
        ? `/vaults/${subjectId}`
        : subjectType === "TRANSACTION" || subjectType === "PROPOSAL"
          ? `/transactions/${subjectId}`
          : null;

  const label = (
    <span className="font-mono text-xs">
      {subjectType !== undefined && (
        <span className="mr-1.5 text-faint">{subjectType.toLowerCase()}</span>
      )}
      {shortId(subjectId, 10, 4)}
    </span>
  );

  if (href === null) return <span className="text-body">{label}</span>;
  return (
    <Link href={href} className="text-info hover:underline">
      {label}
    </Link>
  );
}
