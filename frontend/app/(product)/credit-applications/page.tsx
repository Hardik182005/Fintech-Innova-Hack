"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Plus, Search } from "lucide-react";

import { NewApplicationSheet } from "@/components/onboarding/new-application";
import { PageHeader } from "@/components/data/section";
import { EmptyState, ErrorState, Unavailable } from "@/components/data/states";
import { StatusBadge } from "@/components/data/status";
import { MoneyValue } from "@/components/data/value";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { count, money, percent, relativeTime, shortId } from "@/lib/format";
import { useApplications } from "@/lib/queries";

/**
 * Credit applications — every request for task-backed working capital, at any
 * stage of the pipeline. Each row links into the full three-panel underwriting
 * view where the AI recommendation, the deterministic decision and the
 * independent verifier sit side by side.
 */

const STAGE_FILTERS = [
  { value: "", label: "All stages" },
  { value: "IN_FLIGHT", label: "In flight" },
  { value: "HUMAN_REVIEW_REQUIRED", label: "Human review" },
  { value: "APPROVED", label: "Approved (incl. vaulted)" },
  { value: "REJECTED", label: "Rejected" },
] as const;

/** Approved covers the post-approval states too — an application that became a
 *  vault did not stop being approved. */
const APPROVED_FAMILY = new Set(["APPROVED", "VAULT_CREATED", "DISBURSEMENT_ENABLED"]);
const TERMINALISH = new Set([...APPROVED_FAMILY, "REJECTED", "HUMAN_REVIEW_REQUIRED"]);

export default function CreditApplicationsPage() {
  const router = useRouter();
  const applications = useApplications();
  const [stage, setStage] = React.useState<string>("");
  const [search, setSearch] = React.useState("");
  const [applying, setApplying] = React.useState(false);

  const rows = React.useMemo(() => {
    if (applications.data === undefined) return [];
    const needle = search.trim().toLowerCase();
    return applications.data.filter((app) => {
      if (stage === "HUMAN_REVIEW_REQUIRED" && app.status !== "HUMAN_REVIEW_REQUIRED") return false;
      if (stage === "APPROVED" && !APPROVED_FAMILY.has(app.status)) return false;
      if (stage === "REJECTED" && app.status !== "REJECTED") return false;
      if (stage === "IN_FLIGHT" && TERMINALISH.has(app.status)) return false;
      if (needle === "") return true;
      return (
        app.application_id.toLowerCase().includes(needle) ||
        app.agent_name.toLowerCase().includes(needle) ||
        app.task_title.toLowerCase().includes(needle)
      );
    });
  }, [applications.data, stage, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Credit Applications"
        description="Requests for task-backed working capital. The AI recommends; the deterministic credit engine decides; anything marginal goes to a human."
        actions={
          <Button variant="primary" onClick={() => setApplying(true)}>
            <Plus /> New credit application
          </Button>
        }
      />

      <NewApplicationSheet open={applying} onClose={() => setApplying(false)} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-faint" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by id, agent or task"
            className="w-72 pl-9"
            aria-label="Search applications"
          />
        </div>
        <Select
          value={stage}
          onChange={(event) => setStage(event.target.value)}
          className="w-56"
          aria-label="Filter by stage"
        >
          {STAGE_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        {applications.data !== undefined && (
          <span className="ml-auto text-xs text-muted">
            {count(rows.length)} of {count(applications.data.length)} applications
          </span>
        )}
      </div>

      <Card>
        <TableWrap>
          <Table>
            <TableHeader>
              <TableRow className="border-t-0">
                <TableHead>Application</TableHead>
                <TableHead>Agent · Task</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead numeric>Requested</TableHead>
                <TableHead numeric>Approved limit</TableHead>
                <TableHead numeric>PD</TableHead>
                <TableHead numeric>Expected loss</TableHead>
                <TableHead>Vault</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.isPending ? (
                <SkeletonRows rows={6} cols={9} />
              ) : applications.isError ? (
                <TableRow>
                  <TableCell colSpan={9}>
                    <ErrorState
                      detail={applications.error.message}
                      onRetry={() => void applications.refetch()}
                    />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9}>
                    <EmptyState
                      icon={FileText}
                      title={
                        applications.data.length === 0
                          ? "No credit applications yet"
                          : "No applications match this filter"
                      }
                      body={
                        applications.data.length === 0
                          ? "Submit one against a task, or run a demonstration scenario to put a full application through the pipeline."
                          : "Try a different stage or search term."
                      }
                      action={
                        applications.data.length === 0 ? (
                          <Button variant="primary" onClick={() => setApplying(true)}>
                            <Plus /> New credit application
                          </Button>
                        ) : undefined
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((app) => (
                  <TableRow
                    key={app.application_id}
                    data-interactive="true"
                    tabIndex={0}
                    onClick={() => router.push(`/credit-applications/${app.application_id}`)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter")
                        router.push(`/credit-applications/${app.application_id}`);
                    }}
                  >
                    <TableCell>
                      <span className="font-mono text-xs text-body">
                        {shortId(app.application_id)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="min-w-0 max-w-56">
                        <p className="truncate text-sm font-medium text-ink">{app.agent_name}</p>
                        <p className="truncate text-xs text-muted">{app.task_title}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={app.status} />
                    </TableCell>
                    <TableCell numeric>{money(app.requested_minor)}</TableCell>
                    <TableCell numeric>
                      {app.approved_limit_minor === null ? (
                        <Unavailable
                          reason="not-applicable"
                          detail="No limit has been granted. Either the application is still in flight or it was rejected."
                        />
                      ) : (
                        money(app.approved_limit_minor)
                      )}
                    </TableCell>
                    <TableCell numeric>
                      {app.pd_ppm === null ? (
                        <Unavailable detail="The risk model has not scored this application yet." />
                      ) : (
                        percent(app.pd_ppm, 2)
                      )}
                    </TableCell>
                    <TableCell numeric>
                      <MoneyValue minor={app.expected_loss_minor} />
                    </TableCell>
                    <TableCell>
                      {app.vault_id === null ? (
                        <span className="text-xs text-faint">—</span>
                      ) : (
                        <Link
                          href={`/vaults/${app.vault_id}`}
                          onClick={(event) => event.stopPropagation()}
                          className="font-mono text-xs text-info hover:underline"
                        >
                          {shortId(app.vault_id, 8, 4)}
                        </Link>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted">
                      {relativeTime(app.updated_at ?? app.created_at)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableWrap>
      </Card>

      {applications.data !== undefined &&
        applications.data.some((app) => app.reason_codes.length > 0) && (
          <p className="text-xs text-muted">
            <Badge tone="outline" size="sm" className="mr-1.5 align-middle">
              Note
            </Badge>
            Reason codes on each decision are shown in the application&apos;s underwriting view,
            alongside the evidence they trace to.
          </p>
        )}
    </div>
  );
}
