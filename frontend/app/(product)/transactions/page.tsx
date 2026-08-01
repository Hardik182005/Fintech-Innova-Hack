"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftRight, Search } from "lucide-react";

import { PageHeader } from "@/components/data/section";
import { EmptyState, ErrorState } from "@/components/data/states";
import { StatusBadge } from "@/components/data/status";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
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
import { count, money, relativeTime, shortId } from "@/lib/format";
import { useTransactions } from "@/lib/queries";

/**
 * Transactions — every spend attempt, allowed or blocked, on equal footing.
 * A blocked attempt is not a failure of the system; it is the system working,
 * and it gets a row with the exact reason codes that stopped it.
 */

const OUTCOMES = [
  { value: "", label: "All outcomes" },
  { value: "EXECUTED", label: "Executed" },
  { value: "DENIED", label: "Blocked" },
  { value: "PROPOSED", label: "Proposed" },
] as const;

export default function TransactionsPage() {
  return (
    <React.Suspense>
      <TransactionsInner />
    </React.Suspense>
  );
}

function TransactionsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = React.useState(() => params.get("status") ?? "");
  const [search, setSearch] = React.useState("");
  // Server-side filter by status; free-text refinement stays local.
  const transactions = useTransactions(status === "" ? {} : { status });

  const rows = React.useMemo(() => {
    if (transactions.data === undefined) return [];
    const needle = search.trim().toLowerCase();
    if (needle === "") return transactions.data;
    return transactions.data.filter(
      (txn) =>
        txn.proposal_id.toLowerCase().includes(needle) ||
        txn.agent_name.toLowerCase().includes(needle) ||
        txn.vendor_name.toLowerCase().includes(needle) ||
        txn.purpose_code.toLowerCase().includes(needle),
    );
  }, [transactions.data, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        description="Every attempt to move money out of a vault. Blocked rows are the controls doing their job — each shows exactly which rule refused it."
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-faint" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by id, agent, vendor or purpose"
            className="w-72 pl-9"
            aria-label="Search transactions"
          />
        </div>
        <Select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="w-44"
          aria-label="Filter by outcome"
        >
          {OUTCOMES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        {transactions.data !== undefined && (
          <span className="ml-auto text-xs text-muted">{count(rows.length)} attempts</span>
        )}
      </div>

      <Card>
        <TableWrap>
          <Table>
            <TableHeader>
              <TableRow className="border-t-0">
                <TableHead>Proposal</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead numeric>Amount</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Reason codes</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.isPending ? (
                <SkeletonRows rows={8} cols={8} />
              ) : transactions.isError ? (
                <TableRow>
                  <TableCell colSpan={8}>
                    <ErrorState
                      detail={transactions.error.message}
                      onRetry={() => void transactions.refetch()}
                    />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8}>
                    <EmptyState
                      icon={ArrowLeftRight}
                      title="No transactions match"
                      body="Spend attempts appear here the moment an agent proposes one."
                    />
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((txn) => (
                  <TableRow
                    key={txn.proposal_id}
                    data-interactive="true"
                    tabIndex={0}
                    onClick={() => router.push(`/transactions/${txn.proposal_id}`)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") router.push(`/transactions/${txn.proposal_id}`);
                    }}
                  >
                    <TableCell>
                      <span className="font-mono text-xs text-body">{shortId(txn.proposal_id)}</span>
                    </TableCell>
                    <TableCell className="max-w-40 truncate text-sm text-ink">
                      {txn.agent_name}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5 text-sm text-ink">
                        {txn.vendor_name}
                        {!txn.vendor_known && (
                          <Badge tone="critical" size="sm">
                            Unknown
                          </Badge>
                        )}
                      </span>
                    </TableCell>
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
                      <span className="flex max-w-56 flex-wrap gap-1">
                        {txn.reason_codes.slice(0, 3).map((code) => (
                          <Badge
                            key={code}
                            tone={txn.status === "DENIED" ? "critical" : "outline"}
                            size="sm"
                          >
                            {code}
                          </Badge>
                        ))}
                        {txn.reason_codes.length > 3 && (
                          <span className="text-xs text-faint">
                            +{txn.reason_codes.length - 3}
                          </span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted">
                      {relativeTime(txn.executed_at ?? txn.decided_at ?? txn.created_at)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableWrap>
      </Card>
    </div>
  );
}
