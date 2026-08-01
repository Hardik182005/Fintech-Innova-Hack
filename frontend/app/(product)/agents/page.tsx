"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bot, Search } from "lucide-react";

import { PageHeader } from "@/components/data/section";
import { EmptyState, ErrorState, Unavailable } from "@/components/data/states";
import { RiskTierBadge, StatusBadge } from "@/components/data/status";
import { TrustScore } from "@/components/data/trust";
import { MoneyValue } from "@/components/data/value";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
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
import { count, percent, relativeTime, shortId } from "@/lib/format";
import { useAgents } from "@/lib/queries";

/**
 * AI Agents — every autonomous agent registered in this workspace, with the
 * numbers an underwriter actually ranks them by: trust, exposure, violations.
 */

const FILTERS = ["ALL", "ACTIVE", "FROZEN", "REVOKED"] as const;
type Filter = (typeof FILTERS)[number];

export default function AgentsPage() {
  const router = useRouter();
  const agents = useAgents();
  const [filter, setFilter] = React.useState<Filter>("ALL");
  const [search, setSearch] = React.useState("");

  const rows = React.useMemo(() => {
    if (agents.data === undefined) return [];
    const needle = search.trim().toLowerCase();
    return agents.data.filter((agent) => {
      if (filter !== "ALL" && agent.status !== filter) return false;
      if (needle === "") return true;
      return (
        agent.name.toLowerCase().includes(needle) ||
        agent.agent_id.toLowerCase().includes(needle) ||
        agent.model_name.toLowerCase().includes(needle) ||
        agent.owner_email.toLowerCase().includes(needle)
      );
    });
  }, [agents.data, filter, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Agents"
        description="Autonomous agents registered under this workspace. Credit is only ever extended to an agent holding a verified passport."
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-faint" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, id, model or owner"
            className="w-72 pl-9"
            aria-label="Search agents"
          />
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Filter by status">
          {FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                filter === value
                  ? "bg-ink text-white"
                  : "text-muted hover:bg-surface-sunken hover:text-ink"
              }`}
            >
              {value === "ALL" ? "All" : value.charAt(0) + value.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        {agents.data !== undefined && (
          <span className="ml-auto text-xs text-muted">
            {count(rows.length)} of {count(agents.data.length)} agents
          </span>
        )}
      </div>

      <Card>
        <TableWrap>
          <Table>
            <TableHeader>
              <TableRow className="border-t-0">
                <TableHead>Agent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Trust</TableHead>
                <TableHead>Risk tier</TableHead>
                <TableHead numeric>Task success</TableHead>
                <TableHead numeric>Repayment</TableHead>
                <TableHead numeric>Exposure</TableHead>
                <TableHead numeric>Violations</TableHead>
                <TableHead>Passport</TableHead>
                <TableHead>Last activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.isPending ? (
                <SkeletonRows rows={5} cols={10} />
              ) : agents.isError ? (
                <TableRow>
                  <TableCell colSpan={10}>
                    <ErrorState
                      detail={agents.error.message}
                      onRetry={() => void agents.refetch()}
                    />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10}>
                    <EmptyState
                      icon={Bot}
                      title={
                        agents.data.length === 0
                          ? "No agents registered yet"
                          : "No agents match this filter"
                      }
                      body={
                        agents.data.length === 0
                          ? "Run a demonstration scenario to register an agent with a signed passport, or register one through the API."
                          : "Try a different status filter or search term."
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((agent) => (
                  <TableRow
                    key={agent.agent_id}
                    data-interactive="true"
                    tabIndex={0}
                    onClick={() => router.push(`/agents/${agent.agent_id}`)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") router.push(`/agents/${agent.agent_id}`);
                    }}
                  >
                    <TableCell>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{agent.name}</p>
                        <p className="truncate font-mono text-xs text-faint">
                          {shortId(agent.agent_id)} · {agent.model_name}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={agent.status} />
                    </TableCell>
                    <TableCell>
                      <TrustScore score={agent.trust_score} size="sm" />
                    </TableCell>
                    <TableCell>
                      <RiskTierBadge tier={agent.risk_tier} />
                    </TableCell>
                    <TableCell numeric>
                      {agent.tasks_total === 0 ? (
                        <Unavailable
                          reason="insufficient"
                          detail="This agent has not completed any tasks yet, so there is no success rate to report."
                        />
                      ) : (
                        percent(agent.task_success_rate_ppm)
                      )}
                    </TableCell>
                    <TableCell numeric>
                      {agent.vault_count === 0 ? (
                        <Unavailable
                          reason="insufficient"
                          detail="This agent has no concluded credit facilities, so there is no repayment rate to report."
                        />
                      ) : (
                        percent(agent.repayment_rate_ppm)
                      )}
                    </TableCell>
                    <TableCell numeric>
                      <MoneyValue minor={agent.active_exposure_minor} compact />
                    </TableCell>
                    <TableCell numeric>
                      <span className={agent.policy_violation_count > 0 ? "text-caution" : undefined}>
                        {count(agent.policy_violation_count)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {agent.has_passport ? (
                        <Badge tone="positive" size="sm">
                          Verified
                        </Badge>
                      ) : (
                        <Badge tone="outline" size="sm">
                          None
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted">
                      {relativeTime(agent.last_activity_at)}
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
