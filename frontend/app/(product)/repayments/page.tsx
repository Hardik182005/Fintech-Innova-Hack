"use client";

import * as React from "react";
import Link from "next/link";
import { ScrollText } from "lucide-react";

import { PageHeader, Section } from "@/components/data/section";
import { EmptyState, ErrorState } from "@/components/data/states";
import { StatusBadge, statusLabel } from "@/components/data/status";
import { Metric, MoneyValue } from "@/components/data/value";
import { Waterfall } from "@/components/vaults/waterfall";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { SkeletonRows } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrap,
} from "@/components/ui/table";
import { count, dateTimeOf, money, relativeTime, shortId } from "@/lib/format";
import { useRepayments } from "@/lib/queries";
import type { RepaymentRow } from "@/lib/types";

/**
 * Repayments — every waterfall run, across all vaults. The headline row proves
 * the invariant the whole product rests on: revenue in equals principal + fee +
 * reserve + owner, to the paisa, from the ledger's own allocations.
 */

export default function RepaymentsPage() {
  const repayments = useRepayments();
  const [selected, setSelected] = React.useState<RepaymentRow | null>(null);

  const totals = React.useMemo(() => {
    if (repayments.data === undefined || repayments.data.length === 0) return null;
    return repayments.data.reduce(
      (acc, row) => ({
        revenue: acc.revenue + row.revenue_minor,
        principal: acc.principal + row.principal_minor,
        fee: acc.fee + row.fee_minor,
        reserve: acc.reserve + row.reserve_minor,
        owner: acc.owner + row.owner_minor,
        loss: acc.loss + row.loss_minor,
      }),
      { revenue: 0, principal: 0, fee: 0, reserve: 0, owner: 0, loss: 0 },
    );
  }, [repayments.data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Repayments"
        description="Task revenue flowing back through the waterfall: principal first, then the credit fee, then the reserve — the owner is paid only from what remains."
      />

      {totals !== null && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Card>
            <CardContent className="pt-5">
              <Metric
                label="Revenue collected"
                value={<MoneyValue minor={totals.revenue} compact />}
                sub={`across ${count(repayments.data?.length ?? 0)} waterfall runs`}
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <Metric label="Principal returned" value={<MoneyValue minor={totals.principal} compact />} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <Metric label="Fees earned" value={<MoneyValue minor={totals.fee} compact />} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <Metric label="Paid to owners" value={<MoneyValue minor={totals.owner} compact />} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <Metric
                label="Recognised losses"
                value={
                  <span className={totals.loss > 0 ? "text-critical" : undefined}>
                    <MoneyValue minor={totals.loss} compact />
                  </span>
                }
                hint="Booked explicitly after sweeping unspent funds and drawing the reserve. Never inferred."
              />
            </CardContent>
          </Card>
        </div>
      )}

      <Section title="Waterfall runs" description="Click a row to see the full allocation.">
        <Card>
          <TableWrap>
            <Table>
              <TableHeader>
                <TableRow className="border-t-0">
                  <TableHead>Repayment</TableHead>
                  <TableHead>Agent · Task</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead numeric>Revenue in</TableHead>
                  <TableHead numeric>Principal</TableHead>
                  <TableHead numeric>Fee</TableHead>
                  <TableHead numeric>Owner</TableHead>
                  <TableHead>Vault after</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {repayments.isPending ? (
                  <SkeletonRows rows={6} cols={9} />
                ) : repayments.isError ? (
                  <TableRow>
                    <TableCell colSpan={9}>
                      <ErrorState
                        detail={repayments.error.message}
                        onRetry={() => void repayments.refetch()}
                      />
                    </TableCell>
                  </TableRow>
                ) : repayments.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9}>
                      <EmptyState
                        icon={ScrollText}
                        title="No repayments yet"
                        body="The first waterfall runs the moment task revenue reaches a vault."
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  repayments.data.map((row) => (
                    <TableRow
                      key={row.repayment_id}
                      data-interactive="true"
                      tabIndex={0}
                      onClick={() => setSelected(row)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") setSelected(row);
                      }}
                    >
                      <TableCell>
                        <span className="font-mono text-xs text-body">
                          {shortId(row.repayment_id)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="min-w-0 max-w-52">
                          <p className="truncate text-sm font-medium text-ink">{row.agent_name}</p>
                          <p className="truncate text-xs text-muted">{row.task_title}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge tone={row.kind === "RECOVERY" ? "caution" : "info"} size="sm">
                          {statusLabel(row.kind)}
                        </Badge>
                      </TableCell>
                      <TableCell numeric>{money(row.revenue_minor)}</TableCell>
                      <TableCell numeric>{money(row.principal_minor)}</TableCell>
                      <TableCell numeric>{money(row.fee_minor)}</TableCell>
                      <TableCell numeric>{money(row.owner_minor)}</TableCell>
                      <TableCell>
                        <StatusBadge status={row.vault_status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted">
                        {relativeTime(row.created_at)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableWrap>
        </Card>
      </Section>

      <Sheet
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected === null ? "" : `Waterfall · ${shortId(selected.repayment_id, 10, 4)}`}
        subtitle={
          selected === null
            ? undefined
            : `${selected.agent_name} · ${dateTimeOf(selected.created_at)}`
        }
        width="lg"
      >
        {selected !== null && (
          <div className="space-y-5">
            <div className="rounded-xl bg-surface-muted px-4 py-3">
              <p className="eyebrow">Balance check</p>
              <p className="tnum mt-1 text-sm leading-relaxed text-ink">
                {money(selected.revenue_minor)} in = {money(selected.principal_minor)} principal +{" "}
                {money(selected.fee_minor)} fee + {money(selected.reserve_minor)} reserve +{" "}
                {money(selected.owner_minor)} owner
                {selected.loss_minor > 0 && (
                  <span className="text-critical"> ({money(selected.loss_minor)} booked as loss)</span>
                )}
              </p>
              <p className="mt-1 text-xs text-muted">
                Amounts come from the ledger&apos;s allocations — the page adds nothing of its own.
              </p>
            </div>

            <Waterfall repayment={selected} />

            <div className="border-t border-line-soft pt-4 text-sm">
              <p className="flex items-center justify-between py-1">
                <span className="text-muted">Vault</span>
                <Link
                  href={`/vaults/${selected.vault_id}`}
                  className="font-mono text-xs text-info hover:underline"
                >
                  {shortId(selected.vault_id)}
                </Link>
              </p>
              <p className="flex items-center justify-between py-1">
                <span className="text-muted">Outstanding after this run</span>
                <span className="tnum text-ink">{money(selected.outstanding_minor)}</span>
              </p>
              {selected.journal_transaction_id !== null && (
                <p className="flex items-center justify-between py-1">
                  <span className="text-muted">Journal entry</span>
                  <span className="font-mono text-xs text-body">
                    {shortId(selected.journal_transaction_id)}
                  </span>
                </p>
              )}
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
