"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Lock, Snowflake, XCircle } from "lucide-react";

import { PageHeader } from "@/components/data/section";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/data/states";
import { StatusBadge, statusLabel } from "@/components/data/status";
import { Mono, MoneyValue, Row, Rows } from "@/components/data/value";
import { Waterfall } from "@/components/vaults/waterfall";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Meter } from "@/components/ui/meter";
import { Sheet } from "@/components/ui/sheet";
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
import { ApiError } from "@/lib/api";
import { count, dateTimeOf, money, relativeTime, shortId } from "@/lib/format";
import { useCloseVault, useFreezeVault, useVault } from "@/lib/queries";
import type { VaultDetail } from "@/lib/types";

/**
 * One vault: its limits, its allowlist, every spend attempt with the exact
 * reason codes that allowed or blocked it, its revenue, and the waterfall that
 * repaid it. The freeze control is here — the kill switch an owner reaches for.
 */

export default function VaultDetailPage() {
  const params = useParams<{ vaultId: string }>();
  const vaultId = params.vaultId ?? "";
  const vault = useVault(vaultId);

  return (
    <div className="space-y-6">
      <Link
        href="/vaults"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-3.5" /> All vaults
      </Link>

      {vault.isPending ? (
        <LoadingBlock lines={8} />
      ) : vault.isError ? (
        <ErrorState detail={vault.error.message} onRetry={() => void vault.refetch()} />
      ) : (
        <Loaded vault={vault.data} />
      )}
    </div>
  );
}

const FREEZABLE = new Set(["CREATED", "ACTIVE", "SPENDING"]);
const CLOSABLE = new Set(["REPAID", "PARTIALLY_REPAID", "DEFAULTED"]);

function Loaded({ vault }: { vault: VaultDetail }) {
  const [freezeOpen, setFreezeOpen] = React.useState(false);
  const closeVault = useCloseVault(vault.vault_id);

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            Vault {shortId(vault.vault_id, 10, 4)}
            <StatusBadge status={vault.status} />
            {vault.frozen_reason !== null && (
              <Badge tone="caution">
                <Snowflake /> {statusLabel(vault.frozen_reason)}
              </Badge>
            )}
          </span>
        }
        description={
          <span>
            <Link href={`/agents/${vault.agent_id}`} className="text-info hover:underline">
              {vault.agent_name}
            </Link>{" "}
            · {vault.task_title} ·{" "}
            <Link
              href={`/credit-applications/${vault.application_id}`}
              className="text-info hover:underline"
            >
              application {shortId(vault.application_id, 8, 4)}
            </Link>
          </span>
        }
        actions={
          <>
            {FREEZABLE.has(vault.status) && (
              <Button variant="secondary" onClick={() => setFreezeOpen(true)}>
                <Snowflake />
                Freeze vault
              </Button>
            )}
            {CLOSABLE.has(vault.status) && (
              <Button
                variant="secondary"
                onClick={() => closeVault.mutate()}
                disabled={closeVault.isPending}
              >
                <XCircle />
                Close vault
              </Button>
            )}
          </>
        }
      />

      {closeVault.isError && (
        <p className="rounded-lg bg-critical-wash px-3 py-2 text-sm text-critical">
          {closeVault.error instanceof ApiError
            ? closeVault.error.detail
            : "The vault could not be closed."}
        </p>
      )}

      {/* ------------------------------------------------------- balances -- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Facility</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <div className="mb-1.5 flex items-baseline justify-between text-sm">
                <span className="text-muted">Utilisation</span>
                <span className="tnum text-ink">
                  {money(vault.spent_minor)} of {money(vault.total_limit_minor)}
                </span>
              </div>
              <Meter
                value={vault.spent_minor}
                max={vault.total_limit_minor}
                tone={vault.status === "FROZEN" ? "caution" : "info"}
                label="Vault utilisation"
              />
            </div>
            <div className="grid gap-x-8 md:grid-cols-2">
              <Rows>
                <Row label="Remaining headroom">
                  <MoneyValue minor={vault.remaining_minor} />
                </Row>
                <Row label="Per-transaction cap">
                  {money(vault.per_transaction_limit_minor)}
                </Row>
                <Row label="Daily cap">{money(vault.daily_limit_minor)}</Row>
                <Row label="Transactions used">
                  <span className="tnum">
                    {count(vault.transaction_count)} of {count(vault.max_transactions)}
                  </span>
                </Row>
              </Rows>
              <Rows>
                <Row label="Principal outstanding">
                  <MoneyValue minor={vault.principal_outstanding_minor} />
                </Row>
                <Row label="Fee due">
                  <MoneyValue minor={vault.fee_due_minor} />
                </Row>
                <Row label="Reserve drawn">
                  <MoneyValue minor={vault.reserve_drawn_minor} />
                </Row>
                <Row label="Expires">{dateTimeOf(vault.expires_at)}</Row>
              </Rows>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-2.5">
              <Lock className="mt-0.5 size-4 shrink-0 text-muted" />
              <div>
                <CardTitle>Vendor allowlist</CardTitle>
                <p className="mt-0.5 text-xs text-muted">
                  A vault can only pay vendors on this list, and only for the purposes bound to
                  them. Everything else is refused before any money moves.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {vault.allowlist.length === 0 ? (
              <EmptyState title="No vendors allowlisted" className="py-6" />
            ) : (
              <ul className="divide-y divide-line-soft">
                {vault.allowlist.map((vendor) => (
                  <li key={vendor.vendor_id} className="py-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium text-ink">{vendor.vendor_name}</span>
                      <span className="tnum text-xs text-muted">
                        {vendor.per_vendor_cap_minor === null
                          ? "no vendor cap"
                          : money(vendor.per_vendor_cap_minor)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge tone="outline" size="sm">
                        {vendor.category}
                      </Badge>
                      {vendor.purpose_codes.map((code) => (
                        <Badge key={code} tone="neutral" size="sm">
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

      {/* --------------------------------------------------------- detail -- */}
      <Tabs defaultValue="transactions">
        <TabsList>
          <TabsTrigger value="transactions">Spend attempts</TabsTrigger>
          <TabsTrigger value="repayment">Revenue &amp; repayment</TabsTrigger>
          <TabsTrigger value="risk">Risk events</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions">
          {vault.transactions.length === 0 ? (
            <EmptyState title="No spend attempts yet" />
          ) : (
            <Card>
              <TableWrap>
                <Table>
                  <TableHeader>
                    <TableRow className="border-t-0">
                      <TableHead>Proposal</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Purpose</TableHead>
                      <TableHead numeric>Amount</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead>Reason codes</TableHead>
                      <TableHead>When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vault.transactions.map((txn) => (
                      <TableRow key={txn.proposal_id}>
                        <TableCell>
                          <Link
                            href={`/transactions/${txn.proposal_id}`}
                            className="font-mono text-xs text-info hover:underline"
                          >
                            {shortId(txn.proposal_id)}
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm text-ink">{txn.vendor_name}</TableCell>
                        <TableCell>
                          <Badge tone="outline" size="sm">
                            {txn.purpose_code}
                          </Badge>
                        </TableCell>
                        <TableCell numeric>{money(txn.amount_minor)}</TableCell>
                        <TableCell>
                          <StatusBadge status={txn.status} />
                        </TableCell>
                        <TableCell>
                          <span className="flex max-w-52 flex-wrap gap-1">
                            {txn.reason_codes.map((code) => (
                              <Badge
                                key={code}
                                tone={txn.status === "DENIED" ? "critical" : "outline"}
                                size="sm"
                              >
                                {code}
                              </Badge>
                            ))}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted">
                          {relativeTime(txn.executed_at ?? txn.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableWrap>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="repayment">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Revenue received</CardTitle>
              </CardHeader>
              <CardContent>
                {vault.revenue_events.length === 0 ? (
                  <EmptyState
                    title="No revenue yet"
                    body="Task revenue lands here first, then flows down the waterfall."
                    className="py-6"
                  />
                ) : (
                  <Rows>
                    {vault.revenue_events.map((event, index) => (
                      <Row key={index} label={dateTimeOf(event.created_at)}>
                        <span className="tnum">{money(event.amount_minor)}</span>
                      </Row>
                    ))}
                  </Rows>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <div>
                  <CardTitle>Repayment waterfall</CardTitle>
                  <p className="mt-0.5 text-xs text-muted">
                    Drawn from the ledger&apos;s actual allocations, not recalculated for display.
                  </p>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {vault.repayments.length === 0 ? (
                  <EmptyState title="No repayments yet" className="py-6" />
                ) : (
                  vault.repayments.map((repayment) => (
                    <div key={repayment.repayment_id}>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge tone={repayment.kind === "RECOVERY" ? "caution" : "info"} size="sm">
                          {statusLabel(repayment.kind)}
                        </Badge>
                        <Mono className="text-faint">{shortId(repayment.repayment_id)}</Mono>
                        <span className="ml-auto text-xs text-muted">
                          {dateTimeOf(repayment.created_at)}
                        </span>
                      </div>
                      <Waterfall repayment={repayment} />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="risk">
          {vault.risk_events.length === 0 ? (
            <EmptyState title="No risk events on this vault" />
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
                    {vault.risk_events.map((event) => (
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
      </Tabs>

      <FreezeSheet
        vaultId={vault.vault_id}
        open={freezeOpen}
        onClose={() => setFreezeOpen(false)}
      />
    </div>
  );
}

/** Freezing needs a reason — it lands in the audit chain with the event. */
function FreezeSheet({
  vaultId,
  open,
  onClose,
}: {
  vaultId: string;
  open: boolean;
  onClose: () => void;
}) {
  const freeze = useFreezeVault(vaultId);
  const [reason, setReason] = React.useState("");
  const valid = reason.trim().length >= 3;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Freeze this vault"
      subtitle="Suspends all spending immediately. Reversible by an owner."
      width="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={!valid || freeze.isPending}
            onClick={() =>
              freeze.mutate(reason.trim(), {
                onSuccess: () => {
                  setReason("");
                  onClose();
                },
              })
            }
          >
            <Snowflake />
            Freeze vault
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-body">
          Freezing stops every pending and future spend attempt on this vault. Revenue can still
          arrive and repayment still runs. The freeze, and your reason, are recorded in the audit
          chain.
        </p>
        <Field
          label="Reason"
          htmlFor="freeze-reason"
          hint="Required. Written to the audit chain verbatim."
        >
          <Input
            id="freeze-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Owner requested pause pending task review"
          />
        </Field>
        {freeze.isError && (
          <p className="rounded-lg bg-critical-wash px-3 py-2 text-sm text-critical">
            {freeze.error instanceof ApiError
              ? freeze.error.detail
              : "The vault could not be frozen."}
          </p>
        )}
      </div>
    </Sheet>
  );
}
