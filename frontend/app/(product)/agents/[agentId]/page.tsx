"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, KeyRound, ShieldCheck, ShieldX } from "lucide-react";

import { PageHeader, Section } from "@/components/data/section";
import { EmptyState, ErrorState, LoadingBlock, Unavailable } from "@/components/data/states";
import { RiskTierBadge, StatusBadge, statusLabel } from "@/components/data/status";
import { TrustScore, TrustScoreLabel } from "@/components/data/trust";
import { Metric, Mono, MoneyValue, Row, Rows } from "@/components/data/value";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Meter } from "@/components/ui/meter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrap,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  count,
  dateTimeOf,
  money,
  percent,
  relativeTime,
  shortHash,
  shortId,
} from "@/lib/format";
import { useAgent } from "@/lib/queries";
import type { AgentProfile } from "@/lib/types";

/**
 * One agent, in full: identity, passport claims, credit history, spending
 * behaviour and every risk event it triggered. This is the page an underwriter
 * reads before trusting the trust score.
 */

export default function AgentDetailPage() {
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId ?? "";
  const profile = useAgent(agentId);

  return (
    <div className="space-y-6">
      <Link
        href="/agents"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-3.5" /> All agents
      </Link>

      {profile.isPending ? (
        <LoadingBlock lines={8} />
      ) : profile.isError ? (
        <ErrorState detail={profile.error.message} onRetry={() => void profile.refetch()} />
      ) : (
        <Loaded profile={profile.data} />
      )}
    </div>
  );
}

function Loaded({ profile }: { profile: AgentProfile }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {profile.name}
            <StatusBadge status={profile.status} />
            <RiskTierBadge tier={profile.risk_tier} />
          </span>
        }
        description={
          <span>
            <Mono>{profile.agent_id}</Mono> · {profile.model_provider}/{profile.model_name} · owned
            by {profile.owner_email}
          </span>
        }
      />

      {/* ------------------------------------------------------ headline -- */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardContent className="flex items-center gap-4 pt-5">
            <TrustScore score={profile.trust_score} size="lg" />
            <div>
              <div className="eyebrow">
                <TrustScoreLabel />
              </div>
              <p className="mt-1 text-xs text-muted">
                {profile.features.is_first_credit
                  ? "First credit — neutral baseline"
                  : `${count(profile.features.tasks_total)} tasks on record`}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <Metric
              label="Task success"
              value={<span className="tnum">{percent(profile.task_success_rate_ppm)}</span>}
              absent={
                profile.features.tasks_total === 0
                  ? { reason: "insufficient", detail: "No tasks completed yet." }
                  : undefined
              }
              sub={`${count(profile.features.tasks_succeeded)} of ${count(profile.features.tasks_total)} tasks`}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <Metric
              label="Repayment record"
              value={<span className="tnum">{percent(profile.repayment_rate_ppm)}</span>}
              absent={
                profile.features.repayments_total === 0
                  ? { reason: "insufficient", detail: "No concluded credit facilities yet." }
                  : undefined
              }
              sub={`${count(profile.features.repaid_in_full)} of ${count(profile.features.repayments_total)} repaid in full`}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <Metric
              label="Outstanding"
              value={<MoneyValue minor={profile.features.current_outstanding_minor} compact />}
              sub={
                profile.features.total_defaulted_minor > 0 ? (
                  <span className="text-critical">
                    {money(profile.features.total_defaulted_minor)} defaulted historically
                  </span>
                ) : (
                  "No historic defaults"
                )
              }
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <Metric
              label="Control frictions"
              hint="Policy violations recorded against this agent, and spend attempts its vault controls refused."
              value={
                <span className={`tnum ${profile.policy_violation_count > 0 ? "text-caution" : ""}`}>
                  {count(profile.policy_violation_count)}
                </span>
              }
              sub={`${count(profile.blocked_spend_attempts)} blocked spend attempts`}
            />
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------ passport -- */}
      <Passport passport={profile.passport} expiresAt={profile.passport_expires_at} />

      {/* -------------------------------------------------------- detail -- */}
      <Tabs defaultValue="credit">
        <TabsList>
          <TabsTrigger value="credit">Credit history</TabsTrigger>
          <TabsTrigger value="vaults">Vaults</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="spending">Spending behaviour</TabsTrigger>
          <TabsTrigger value="risk">Risk events</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="credit">
          {profile.credit_history.length === 0 ? (
            <EmptyState title="No credit applications yet" />
          ) : (
            <Card>
              <TableWrap>
                <Table>
                  <TableHeader>
                    <TableRow className="border-t-0">
                      <TableHead>Application</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Decision</TableHead>
                      <TableHead numeric>Requested</TableHead>
                      <TableHead numeric>Approved limit</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profile.credit_history.map((entry) => (
                      <TableRow key={entry.application_id}>
                        <TableCell>
                          <Link
                            href={`/credit-applications/${entry.application_id}`}
                            className="font-mono text-xs text-info hover:underline"
                          >
                            {shortId(entry.application_id)}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={entry.status} />
                        </TableCell>
                        <TableCell>
                          {entry.decision === null ? (
                            <Unavailable detail="No deterministic decision has been recorded yet." />
                          ) : (
                            statusLabel(entry.decision)
                          )}
                        </TableCell>
                        <TableCell numeric>{money(entry.requested_minor)}</TableCell>
                        <TableCell numeric>
                          <MoneyValue
                            minor={entry.approved_limit_minor}
                            reason="not-applicable"
                          />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted">
                          {relativeTime(entry.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableWrap>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="vaults">
          {profile.vaults.length === 0 ? (
            <EmptyState title="No vaults for this agent" />
          ) : (
            <Card>
              <TableWrap>
                <Table>
                  <TableHeader>
                    <TableRow className="border-t-0">
                      <TableHead>Vault</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead numeric>Limit</TableHead>
                      <TableHead numeric>Spent</TableHead>
                      <TableHead>Utilisation</TableHead>
                      <TableHead numeric>Outstanding</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profile.vaults.map((vault) => (
                      <TableRow key={vault.vault_id}>
                        <TableCell>
                          <Link
                            href={`/vaults/${vault.vault_id}`}
                            className="font-mono text-xs text-info hover:underline"
                          >
                            {shortId(vault.vault_id)}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={vault.status} />
                        </TableCell>
                        <TableCell numeric>{money(vault.total_limit_minor)}</TableCell>
                        <TableCell numeric>{money(vault.spent_minor)}</TableCell>
                        <TableCell className="w-32">
                          <Meter
                            value={vault.spent_minor}
                            max={vault.total_limit_minor}
                            tone="info"
                            label="Vault utilisation"
                          />
                        </TableCell>
                        <TableCell numeric>{money(vault.principal_outstanding_minor)}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted">
                          {relativeTime(vault.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableWrap>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="tasks">
          {profile.tasks.length === 0 ? (
            <EmptyState title="No tasks recorded" />
          ) : (
            <Card>
              <TableWrap>
                <Table>
                  <TableHeader>
                    <TableRow className="border-t-0">
                      <TableHead>Task</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead numeric>Expected revenue</TableHead>
                      <TableHead numeric>Expected cost</TableHead>
                      <TableHead numeric>Margin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profile.tasks.map((task) => (
                      <TableRow key={task.task_id}>
                        <TableCell>
                          <p className="text-sm font-medium text-ink">{task.title}</p>
                          <p className="font-mono text-xs text-faint">{shortId(task.task_id)}</p>
                        </TableCell>
                        <TableCell>
                          <Badge tone="outline" size="sm">
                            {task.category}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={task.status} />
                        </TableCell>
                        <TableCell numeric>{money(task.expected_revenue_minor)}</TableCell>
                        <TableCell numeric>{money(task.expected_cost_minor)}</TableCell>
                        <TableCell numeric>{money(task.expected_margin_minor)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableWrap>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="spending">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Vendor distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {profile.spending_behaviour.vendor_distribution.length === 0 ? (
                  <EmptyState title="No executed spending yet" className="py-6" />
                ) : (
                  <Rows>
                    {profile.spending_behaviour.vendor_distribution.map((vendor) => (
                      <Row key={vendor.vendor_id} label={shortId(vendor.vendor_id, 14, 4)}>
                        <span className="tnum">
                          {count(vendor.count)} × · {money(vendor.amount_minor)}
                        </span>
                      </Row>
                    ))}
                  </Rows>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Policy violations</CardTitle>
                  <p className="mt-0.5 text-xs text-muted">
                    {count(profile.spending_behaviour.executed_count)} executed ·{" "}
                    {count(profile.spending_behaviour.blocked_count)} blocked
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                {profile.spending_behaviour.policy_violations.length === 0 ? (
                  <EmptyState title="No policy violations" className="py-6" />
                ) : (
                  <ul className="divide-y divide-line-soft">
                    {profile.spending_behaviour.policy_violations.map((violation) => (
                      <li key={violation.proposal_id} className="py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <Link
                            href={`/transactions/${violation.proposal_id}`}
                            className="font-mono text-xs text-info hover:underline"
                          >
                            {shortId(violation.proposal_id)}
                          </Link>
                          <span className="text-xs text-muted">
                            {relativeTime(violation.created_at)}
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {violation.reason_codes.map((code) => (
                            <Badge key={code} tone="critical" size="sm">
                              {code}
                            </Badge>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="risk">
          {profile.risk_events.length === 0 ? (
            <EmptyState title="No risk events for this agent" />
          ) : (
            <Card>
              <TableWrap>
                <Table>
                  <TableHeader>
                    <TableRow className="border-t-0">
                      <TableHead>Event</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profile.risk_events.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell className="font-medium text-ink">
                          {statusLabel(event.event_type)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            tone={
                              event.severity === "CRITICAL" || event.severity === "HIGH"
                                ? "critical"
                                : "caution"
                            }
                            size="sm"
                          >
                            {event.severity}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted">
                          {dateTimeOf(event.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableWrap>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="audit">
          {profile.audit_events.length === 0 ? (
            <EmptyState title="No audit events reference this agent" />
          ) : (
            <Card>
              <TableWrap>
                <Table>
                  <TableHeader>
                    <TableRow className="border-t-0">
                      <TableHead>Seq</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Hash</TableHead>
                      <TableHead>When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profile.audit_events.map((event) => (
                      <TableRow key={event.seq}>
                        <TableCell className="tnum text-muted">#{event.seq}</TableCell>
                        <TableCell className="font-medium text-ink">
                          {statusLabel(event.event_type)}
                        </TableCell>
                        <TableCell>
                          <Mono>{shortHash(event.event_hash ?? null)}</Mono>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted">
                          {dateTimeOf(event.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableWrap>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * The passport panel. What is shown are the token's claims — its authority
 * limits, categories, validity window. The signature bytes and every key stay
 * on the server; the only cryptographic fact the page states is whether
 * verification passed.
 */
function Passport({
  passport,
  expiresAt,
}: {
  passport: AgentProfile["passport"];
  expiresAt: AgentProfile["passport_expires_at"];
}) {
  if (passport === null) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-4">
          <ShieldX className="size-4 shrink-0 text-caution" />
          <p className="text-sm text-body">
            No passport on record. This agent cannot be granted credit until it presents a signed
            capability token.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Section
      title={
        <span className="flex items-center gap-2">
          <KeyRound className="size-4 text-muted" /> Agent Passport
        </span>
      }
      description="The signed capability token binding this agent to its organisation and owner. Every credit decision starts by verifying it."
    >
      <Card>
        <CardContent className="grid gap-x-8 gap-y-1 pt-4 md:grid-cols-2">
          <Rows>
            <Row label="Verification">
              {passport.signature_verified ? (
                <span className="inline-flex items-center gap-1.5 text-positive">
                  <ShieldCheck className="size-4" /> Signature verified
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-critical">
                  <ShieldX className="size-4" /> Verification failed
                </span>
              )}
            </Row>
            <Row label="Passport id">
              <Mono>{shortId(passport.passport_id, 14, 6)}</Mono>
            </Row>
            <Row label="Issuer">
              <Mono>{passport.issuer}</Mono>
            </Row>
            <Row label="Key version">
              <Mono>{passport.key_version}</Mono>
            </Row>
            <Row label="Audience">
              <Mono>{passport.audience}</Mono>
            </Row>
            <Row label="Purpose">{passport.purpose}</Row>
          </Rows>
          <Rows>
            <Row label="Borrowing authority" hint="The most this token permits the agent to borrow, regardless of what underwriting would allow.">
              {money(passport.max_borrowing_authority_minor)}
            </Row>
            <Row label="Per-transaction cap">{money(passport.max_transaction_value_minor)}</Row>
            <Row label="Permitted categories">
              <span className="flex flex-wrap justify-end gap-1">
                {passport.permitted_task_categories.map((category) => (
                  <Badge key={category} tone="outline" size="sm">
                    {category}
                  </Badge>
                ))}
              </span>
            </Row>
            <Row label="Approved vendors">
              <span className="tnum">{count(passport.approved_vendor_ids.length)}</span>
            </Row>
            <Row label="Valid from">{dateTimeOf(passport.valid_from)}</Row>
            <Row label="Expires">
              <span className="flex items-center justify-end gap-2">
                {dateTimeOf(passport.expires_at ?? expiresAt)}
                {passport.reason_codes.length > 0 &&
                  passport.reason_codes.map((code) => (
                    <Badge key={code} tone="caution" size="sm">
                      {code}
                    </Badge>
                  ))}
              </span>
            </Row>
          </Rows>
        </CardContent>
      </Card>
    </Section>
  );
}
