"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Vault } from "lucide-react";

import { PageHeader } from "@/components/data/section";
import { EmptyState, ErrorState } from "@/components/data/states";
import { StatusBadge } from "@/components/data/status";
import { MoneyValue } from "@/components/data/value";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { Meter } from "@/components/ui/meter";
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
import { useVaults } from "@/lib/queries";

/**
 * Credit Vaults — the restricted facilities themselves. Utilisation is the
 * column that matters day to day; the deep controls live on the detail page.
 */

const STATUS_OPTIONS = [
  "",
  "CREATED",
  "ACTIVE",
  "SPENDING",
  "FROZEN",
  "EXPIRED",
  "TASK_COMPLETED",
  "TASK_FAILED",
  "REVENUE_RECEIVED",
  "REPAID",
  "PARTIALLY_REPAID",
  "DEFAULTED",
  "CLOSED",
] as const;

export default function VaultsPage() {
  // useSearchParams needs a Suspense boundary above it to prerender.
  return (
    <React.Suspense>
      <VaultsInner />
    </React.Suspense>
  );
}

function VaultsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const vaults = useVaults();
  const [status, setStatus] = React.useState(() => params.get("status") ?? "");
  const [search, setSearch] = React.useState("");

  const rows = React.useMemo(() => {
    if (vaults.data === undefined) return [];
    const needle = search.trim().toLowerCase();
    return vaults.data.filter((vault) => {
      if (status !== "" && vault.status !== status) return false;
      if (needle === "") return true;
      return (
        vault.vault_id.toLowerCase().includes(needle) ||
        vault.agent_name.toLowerCase().includes(needle) ||
        vault.task_title.toLowerCase().includes(needle)
      );
    });
  }, [vaults.data, status, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Credit Vaults"
        description="Restricted spending facilities. Every rupee leaving a vault passes thirteen deterministic controls first."
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-faint" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by id, agent or task"
            className="w-72 pl-9"
            aria-label="Search vaults"
          />
        </div>
        <Select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="w-48"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.filter((option) => option !== "").map((option) => (
            <option key={option} value={option}>
              {option.charAt(0) + option.slice(1).toLowerCase().replace(/_/g, " ")}
            </option>
          ))}
        </Select>
        {vaults.data !== undefined && (
          <span className="ml-auto text-xs text-muted">
            {count(rows.length)} of {count(vaults.data.length)} vaults
          </span>
        )}
      </div>

      <Card>
        <TableWrap>
          <Table>
            <TableHeader>
              <TableRow className="border-t-0">
                <TableHead>Vault</TableHead>
                <TableHead>Agent · Task</TableHead>
                <TableHead>Status</TableHead>
                <TableHead numeric>Limit</TableHead>
                <TableHead>Utilisation</TableHead>
                <TableHead numeric>Outstanding</TableHead>
                <TableHead numeric>Txns</TableHead>
                <TableHead>Expires</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vaults.isPending ? (
                <SkeletonRows rows={6} cols={8} />
              ) : vaults.isError ? (
                <TableRow>
                  <TableCell colSpan={8}>
                    <ErrorState
                      detail={vaults.error.message}
                      onRetry={() => void vaults.refetch()}
                    />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8}>
                    <EmptyState
                      icon={Vault}
                      title={
                        vaults.data.length === 0 ? "No vaults yet" : "No vaults match this filter"
                      }
                      body={
                        vaults.data.length === 0
                          ? "A vault is created automatically when a credit application is approved."
                          : "Try a different status or search term."
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((vault) => (
                  <TableRow
                    key={vault.vault_id}
                    data-interactive="true"
                    tabIndex={0}
                    onClick={() => router.push(`/vaults/${vault.vault_id}`)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") router.push(`/vaults/${vault.vault_id}`);
                    }}
                  >
                    <TableCell>
                      <span className="font-mono text-xs text-body">{shortId(vault.vault_id)}</span>
                    </TableCell>
                    <TableCell>
                      <div className="min-w-0 max-w-56">
                        <p className="truncate text-sm font-medium text-ink">{vault.agent_name}</p>
                        <p className="truncate text-xs text-muted">{vault.task_title}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={vault.status} />
                    </TableCell>
                    <TableCell numeric>{money(vault.total_limit_minor)}</TableCell>
                    <TableCell className="w-40">
                      <div className="flex items-center gap-2">
                        <Meter
                          value={vault.spent_minor}
                          max={vault.total_limit_minor}
                          tone={vault.status === "FROZEN" ? "caution" : "info"}
                          label="Utilisation"
                          className="flex-1"
                        />
                        <span className="tnum shrink-0 text-xs text-muted">
                          {money(vault.spent_minor)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell numeric>
                      <MoneyValue minor={vault.principal_outstanding_minor} />
                    </TableCell>
                    <TableCell numeric>
                      <span className="text-muted">
                        {count(vault.transaction_count)}/{count(vault.max_transactions)}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted">
                      {relativeTime(vault.expires_at)}
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
