"use client";

import * as React from "react";
import { CheckCircle2, Link2, RefreshCw, XCircle } from "lucide-react";

import { PageHeader, Section } from "@/components/data/section";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/data/states";
import { statusLabel } from "@/components/data/status";
import { Mono } from "@/components/data/value";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import { count, dateTimeOf, shortHash, shortId } from "@/lib/format";
import { useAuditChain, useAuditEvents, useLabels } from "@/lib/queries";

/**
 * Audit Trail — the hash chain itself, made legible. Each event shows its own
 * hash and the previous hash it commits to, and the page runs a live
 * verification so "tamper-evident" is a demonstrated property, not a slogan.
 */

export default function AuditPage() {
  const events = useAuditEvents();
  const chain = useAuditChain();
  const labels = useLabels();

  const labelOf = React.useCallback(
    (eventType: string) => labels.data?.audit[eventType] ?? statusLabel(eventType),
    [labels.data],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Trail"
        description="Each critical financial event is chained to the previous event so tampering can be detected."
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              void chain.refetch();
              void events.refetch();
            }}
            disabled={chain.isFetching}
          >
            <RefreshCw className={chain.isFetching ? "animate-spin" : undefined} />
            Re-verify chain
          </Button>
        }
      />

      {/* ------------------------------------------------- verification -- */}
      {chain.isPending ? (
        <LoadingBlock lines={2} />
      ) : chain.isError ? (
        <ErrorState
          title="The chain could not be verified"
          detail={chain.error.message}
          onRetry={() => void chain.refetch()}
        />
      ) : (
        <div
          className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${
            chain.data.intact
              ? "border-positive/30 bg-positive-wash"
              : "border-critical/30 bg-critical-wash"
          }`}
        >
          {chain.data.intact ? (
            <>
              <CheckCircle2 className="size-5 shrink-0 text-positive" />
              <div>
                <p className="text-sm font-medium text-positive">
                  Chain verified — every hash checks out
                </p>
                <p className="text-xs text-muted">
                  {events.data !== undefined &&
                    `${count(events.data.length)} events re-hashed just now, newest to genesis. `}
                  Altering any historical event would break every hash after it.
                </p>
              </div>
            </>
          ) : (
            <>
              <XCircle className="size-5 shrink-0 text-critical" />
              <div>
                <p className="text-sm font-medium text-critical">
                  Chain broken at sequence #{chain.data.first_broken_seq}
                </p>
                <p className="text-xs text-muted">
                  An event no longer matches the hash committed by its successor. Treat every
                  record from that point on as suspect.
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* --------------------------------------------------------- chain -- */}
      <Section title="Event chain" description="Newest first. Hover a link icon to see the hash each event commits to.">
        {events.isPending ? (
          <LoadingBlock lines={8} />
        ) : events.isError ? (
          <ErrorState detail={events.error.message} onRetry={() => void events.refetch()} />
        ) : events.data.length === 0 ? (
          <Card>
            <EmptyState
              title="The chain is empty"
              body="The first financial event will become the genesis of this workspace's chain."
              className="py-10"
            />
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-2">
              <ol>
                {events.data.map((event, index) => {
                  const next = events.data[index + 1];
                  const linksToPrevious =
                    next !== undefined && event.prev_hash === next.event_hash;

                  return (
                    <li
                      key={event.id}
                      className="relative flex gap-4 border-b border-line-soft py-3 last:border-b-0"
                    >
                      <div className="flex w-12 shrink-0 flex-col items-center">
                        <span className="tnum text-xs text-faint">#{event.seq}</span>
                        {next !== undefined && (
                          <Tooltip
                            side="right"
                            content={
                              linksToPrevious ? (
                                <span>
                                  Commits to #{next.seq}: <Mono className="text-white">{shortHash(event.prev_hash)}</Mono>
                                </span>
                              ) : (
                                <span className="text-white">
                                  Link mismatch — this event&apos;s prev_hash does not equal the
                                  hash of #{next.seq}
                                </span>
                              )
                            }
                          >
                            <Link2
                              className={`mt-1.5 size-3.5 ${
                                linksToPrevious ? "text-faint" : "text-critical"
                              }`}
                            />
                          </Tooltip>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="text-sm font-medium text-ink">
                            {labelOf(event.event_type)}
                          </span>
                          <Badge tone="outline" size="sm">
                            {statusLabel(event.actor_type)}
                          </Badge>
                          {event.resource_id !== null && (
                            <Mono className="text-faint">{shortId(event.resource_id, 10, 4)}</Mono>
                          )}
                          <span className="ml-auto text-xs text-muted">
                            {dateTimeOf(event.created_at)}
                          </span>
                        </div>
                        <p className="tnum mt-1 font-mono text-[0.6875rem] text-faint">
                          hash {shortHash(event.event_hash)} · prev {shortHash(event.prev_hash)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        )}
      </Section>
    </div>
  );
}
