"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, FileCheck2 } from "lucide-react";

import { PageHeader, Section } from "@/components/data/section";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/data/states";
import { StatusBadge, statusLabel } from "@/components/data/status";
import { Mono, Row, Rows } from "@/components/data/value";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dateTimeOf, money, shortHash, shortId } from "@/lib/format";
import { useTransaction } from "@/lib/queries";
import type { TransactionDetail } from "@/lib/types";

/**
 * One spend attempt, forensically: who proposed it, which controls voted, what
 * each said, and — if it executed — the ledger entry it became. For a blocked
 * attempt this page is the explanation the agent's owner is owed.
 */

export default function TransactionDetailPage() {
  const params = useParams<{ proposalId: string }>();
  const proposalId = params.proposalId ?? "";
  const txn = useTransaction(proposalId);

  return (
    <div className="space-y-6">
      <Link
        href="/transactions"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-3.5" /> All transactions
      </Link>

      {txn.isPending ? (
        <LoadingBlock lines={8} />
      ) : txn.isError ? (
        <ErrorState detail={txn.error.message} onRetry={() => void txn.refetch()} />
      ) : (
        <Loaded txn={txn.data} />
      )}
    </div>
  );
}

function Loaded({ txn }: { txn: TransactionDetail }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="tnum">{money(txn.amount_minor)}</span> to {txn.vendor_name}
            <StatusBadge status={txn.status} />
          </span>
        }
        description={
          <span>
            <Mono>{shortId(txn.proposal_id, 14, 6)}</Mono> · proposed by{" "}
            <Link href={`/agents/${txn.agent_id}`} className="text-info hover:underline">
              {txn.agent_name}
            </Link>{" "}
            from vault{" "}
            <Link href={`/vaults/${txn.vault_id}`} className="text-info hover:underline">
              {shortId(txn.vault_id, 8, 4)}
            </Link>
          </span>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>The attempt</CardTitle>
          </CardHeader>
          <CardContent>
            <Rows>
              <Row label="Amount">
                <span className="tnum font-medium">{money(txn.amount_minor)}</span>
              </Row>
              <Row label="Vendor">
                <span className="flex items-center justify-end gap-2">
                  {txn.vendor_name}
                  {!txn.vendor_known && (
                    <Badge tone="critical" size="sm">
                      Not on any allowlist
                    </Badge>
                  )}
                </span>
              </Row>
              <Row label="Purpose">
                <Badge tone="outline" size="sm">
                  {txn.purpose_code}
                </Badge>
              </Row>
              <Row label="Type">{statusLabel(txn.type)}</Row>
              <Row
                label="Idempotency key"
                hint="Replaying the same proposal cannot spend twice; the key makes the second attempt a no-op."
              >
                {txn.idempotency_key_present ? (
                  <span className="text-positive">Present</span>
                ) : (
                  <span className="text-caution">Absent</span>
                )}
              </Row>
              <Row label="Proposed">{dateTimeOf(txn.created_at)}</Row>
              <Row label="Decided">{dateTimeOf(txn.decided_at)}</Row>
              {txn.executed_at !== null && <Row label="Executed">{dateTimeOf(txn.executed_at)}</Row>}
            </Rows>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Outcome</CardTitle>
              <p className="mt-0.5 text-xs text-muted">
                {txn.status === "DENIED"
                  ? "The controls refused this attempt before any money moved."
                  : txn.status === "EXECUTED"
                    ? "All controls passed and the ledger recorded the movement."
                    : "This attempt has not been decided yet."}
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <Rows>
              <Row label="Policy result">
                <StatusBadge status={txn.policy_result} />
              </Row>
              <Row label="Reason codes">
                <span className="flex max-w-64 flex-wrap justify-end gap-1">
                  {txn.reason_codes.length === 0 ? (
                    <span className="text-muted">None recorded</span>
                  ) : (
                    txn.reason_codes.map((code) => (
                      <Badge
                        key={code}
                        tone={txn.status === "DENIED" ? "critical" : "outline"}
                        size="sm"
                      >
                        {code}
                      </Badge>
                    ))
                  )}
                </span>
              </Row>
              {txn.transaction_id !== null && (
                <Row label="Transaction id">
                  <Mono>{shortId(txn.transaction_id)}</Mono>
                </Row>
              )}
              {txn.journal_transaction_id !== null && (
                <Row label="Journal entry" hint="The double-entry record in the ledger.">
                  <Mono>{shortId(txn.journal_transaction_id)}</Mono>
                </Row>
              )}
            </Rows>
          </CardContent>
        </Card>
      </div>

      <Section
        title="Policy decisions"
        description="Each engine that voted on this attempt. Any single deny blocks it."
      >
        {txn.policy_decisions.length === 0 ? (
          <EmptyState title="No policy decisions recorded" />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {txn.policy_decisions.map((decision, index) => (
              <Card key={`${decision.engine}-${index}`}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-sm font-medium text-ink">
                      <FileCheck2 className="size-4 text-muted" />
                      {decision.engine}
                    </span>
                    <Badge tone={decision.allow ? "positive" : "critical"}>
                      {decision.allow ? "Allowed" : "Denied"}
                    </Badge>
                  </div>
                  {decision.deny.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {decision.deny.map((code) => (
                        <Badge key={code} tone="critical" size="sm">
                          {code}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <p className="mt-2 text-xs text-muted">
                    {decision.policy_version ?? "unversioned"} · {dateTimeOf(decision.created_at)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Audit trail"
        description="The chained events this attempt produced."
      >
        {txn.audit_events.length === 0 ? (
          <EmptyState title="No audit events reference this attempt" />
        ) : (
          <Card>
            <CardContent className="pt-4">
              <ol className="divide-y divide-line-soft">
                {txn.audit_events.map((event) => (
                  <li key={event.seq} className="flex items-baseline gap-3 py-2.5">
                    <span className="tnum w-12 shrink-0 text-xs text-faint">#{event.seq}</span>
                    <span className="min-w-0 flex-1 text-sm text-ink">
                      {statusLabel(event.event_type)}
                    </span>
                    <Mono className="hidden shrink-0 text-faint sm:inline">
                      {shortHash(event.event_hash ?? null)}
                    </Mono>
                    <span className="shrink-0 text-xs text-muted">
                      {dateTimeOf(event.created_at)}
                    </span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )}
      </Section>
    </div>
  );
}
