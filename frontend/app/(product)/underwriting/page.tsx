"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Brain, Calculator, Scale, UserCheck } from "lucide-react";

import { AuthorityNote, PageHeader, Section } from "@/components/data/section";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/data/states";
import { StatusBadge } from "@/components/data/status";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { useUnderwritingQueue } from "@/lib/queries";
import type { CreditApplicationSummary, UnderwritingQueueBucket } from "@/lib/types";

/**
 * Underwriting — the pipeline as a workqueue. Four buckets, in the order the
 * pipeline runs them. The human-review bucket is the one that needs a person;
 * it is placed with the others rather than on its own page so a reviewer sees
 * what is coming toward them, not just what has arrived.
 */

const BUCKETS: {
  key: UnderwritingQueueBucket;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  body: string;
}[] = [
  {
    key: "awaiting_ai_analysis",
    label: "Awaiting AI analysis",
    icon: Brain,
    body: "Evidence is stored; the bounded analyst has not reported yet.",
  },
  {
    key: "awaiting_deterministic_decision",
    label: "Awaiting engine decision",
    icon: Calculator,
    body: "Analysis is in; the deterministic engine has not decided yet.",
  },
  {
    key: "awaiting_human_review",
    label: "Awaiting human review",
    icon: UserCheck,
    body: "Referred to a person. Nothing proceeds until an owner decides.",
  },
  {
    key: "recently_completed",
    label: "Recently completed",
    icon: Scale,
    body: "Decided in the recent past — approved, vaulted or rejected.",
  },
];

export default function UnderwritingPage() {
  const queue = useUnderwritingQueue();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Underwriting"
        description={<AuthorityNote />}
      />

      {queue.isPending ? (
        <LoadingBlock lines={8} />
      ) : queue.isError ? (
        <ErrorState detail={queue.error.message} onRetry={() => void queue.refetch()} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {BUCKETS.map((bucket) => (
              <Card key={bucket.key}>
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="eyebrow">{bucket.label}</span>
                    <bucket.icon className="size-4 shrink-0 text-faint" />
                  </div>
                  <p
                    className={`tnum mt-1.5 text-2xl leading-none font-semibold ${
                      bucket.key === "awaiting_human_review" &&
                      queue.data.counts[bucket.key] > 0
                        ? "text-caution"
                        : "text-ink"
                    }`}
                  >
                    {count(queue.data.counts[bucket.key])}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-muted">{bucket.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {BUCKETS.map((bucket) => (
            <Section
              key={bucket.key}
              title={bucket.label}
              description={
                bucket.key === "awaiting_human_review" &&
                queue.data.counts[bucket.key] > 0 ? (
                  <span className="text-caution">
                    These applications are waiting on a person. Open one to decide.
                  </span>
                ) : undefined
              }
            >
              <BucketTable
                rows={queue.data.buckets[bucket.key]}
                emptyBody={
                  bucket.key === "awaiting_human_review"
                    ? "Nothing needs a human right now."
                    : "Nothing is waiting at this stage."
                }
              />
            </Section>
          ))}
        </>
      )}
    </div>
  );
}

function BucketTable({
  rows,
  emptyBody,
}: {
  rows: CreditApplicationSummary[];
  emptyBody: string;
}) {
  const router = useRouter();

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState title="Empty" body={emptyBody} className="py-8" />
      </Card>
    );
  }

  return (
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
              <TableHead>Reason codes</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((app) => (
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
                  <span className="font-mono text-xs text-body">{shortId(app.application_id)}</span>
                </TableCell>
                <TableCell>
                  <div className="min-w-0 max-w-64">
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
                    <span className="text-faint">—</span>
                  ) : (
                    money(app.approved_limit_minor)
                  )}
                </TableCell>
                <TableCell>
                  <span className="flex max-w-56 flex-wrap gap-1">
                    {app.reason_codes.slice(0, 3).map((code) => (
                      <Badge key={code} tone="outline" size="sm">
                        {code}
                      </Badge>
                    ))}
                    {app.reason_codes.length > 3 && (
                      <span className="text-xs text-faint">+{app.reason_codes.length - 3}</span>
                    )}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted">
                  {relativeTime(app.updated_at ?? app.created_at)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableWrap>
    </Card>
  );
}
