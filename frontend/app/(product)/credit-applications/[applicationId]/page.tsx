"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, FileCheck2, Landmark } from "lucide-react";

import { PageHeader, Section } from "@/components/data/section";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/data/states";
import { StatusBadge, statusLabel } from "@/components/data/status";
import { Mono, MoneyValue, Row, Rows } from "@/components/data/value";
import { UnderwritingSummary } from "@/components/onboarding/underwriting-summary";
import { DecisionPanels } from "@/components/underwriting/decision-panels";
import { ReviewControls } from "@/components/underwriting/review-controls";
import { DecisionNarration } from "@/components/voice/decision-narration";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dateTimeOf, durationHours, money, shortHash, shortId } from "@/lib/format";
import { useUnderwriting } from "@/lib/queries";
import type { UnderwritingView } from "@/lib/types";

/**
 * One credit application, end to end: what was asked for, what evidence exists,
 * what the model thought, what the engine decided, what the verifier found,
 * which policies voted, and — if it reached a person — what they did.
 */

export default function ApplicationDetailPage() {
  const params = useParams<{ applicationId: string }>();
  const applicationId = params.applicationId ?? "";
  const view = useUnderwriting(applicationId);

  return (
    <div className="space-y-6">
      <Link
        href="/credit-applications"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-3.5" /> All applications
      </Link>

      {view.isPending ? (
        <LoadingBlock lines={8} />
      ) : view.isError ? (
        <ErrorState detail={view.error.message} onRetry={() => void view.refetch()} />
      ) : (
        <Loaded view={view.data} onRefetch={() => void view.refetch()} />
      )}
    </div>
  );
}

function Loaded({ view, onRefetch }: { view: UnderwritingView; onRefetch: () => void }) {
  const { application, agent, task } = view;

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {task.title}
            <StatusBadge status={application.status} />
          </span>
        }
        description={
          <span>
            <Mono>{shortId(application.application_id, 14, 6)}</Mono> ·{" "}
            <Link href={`/agents/${agent.agent_id}`} className="text-info hover:underline">
              {agent.name}
            </Link>{" "}
            · {task.category}
          </span>
        }
      />

      {/* ------------------------------------------------------- request -- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>The request</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-x-8 md:grid-cols-2">
            <Rows>
              <Row label="Requested">
                <span className="tnum font-medium">{money(application.requested_minor)}</span>
              </Row>
              <Row label="Duration">{durationHours(application.requested_duration_hours)}</Row>
              <Row label="Expected revenue">{money(application.expected_revenue_minor)}</Row>
              <Row label="Expected cost">{money(application.expected_cost_minor)}</Row>
              <Row label="Expected margin">{money(application.expected_margin_minor)}</Row>
            </Rows>
            <Rows>
              <Row
                label="Owner exposure cap"
                hint="The most this owner allows across all their agents at once."
              >
                {money(application.owner_exposure_cap_minor)}
              </Row>
              <Row label="Proposed vendors">
                <span className="flex flex-wrap justify-end gap-1">
                  {application.proposed_vendor_ids.length === 0 ? (
                    <span className="text-muted">None named</span>
                  ) : (
                    application.proposed_vendor_ids.map((vendor) => (
                      <Badge key={vendor} tone="outline" size="sm" className="font-mono">
                        {shortId(vendor, 10, 4)}
                      </Badge>
                    ))
                  )}
                </span>
              </Row>
              <Row label="Submitted">{dateTimeOf(application.created_at)}</Row>
              <Row label="Task">
                <Mono>{shortId(task.task_id)}</Mono>
              </Row>
            </Rows>
            {task.description !== "" && (
              <p className="mt-2 border-t border-line-soft pt-3 text-sm leading-relaxed text-body md:col-span-2">
                {task.description}
              </p>
            )}
          </CardContent>
        </Card>

        <RevenueMandateCard mandate={view.revenue_mandate} />
      </div>

      <UnderwritingSummary view={view} onRefetch={onRefetch} />

      {/* ------------------------------------------- the three panels -- */}
      <Section
        title="Decision comparison"
        description="Three independent views of the same application. Only the centre panel can move money."
      >
        <DecisionPanels
          ai={view.ai_recommendation}
          engine={view.deterministic_engine}
          verifier={view.verifier}
        />
        {/* Optional: renders nothing unless voice narration is enabled. */}
        <DecisionNarration applicationId={application.application_id} />
      </Section>

      {/* ---------------------------------------------- human review -- */}
      {application.status === "HUMAN_REVIEW_REQUIRED" && (
        <Section
          title="Human review"
          description="The policy engine referred this application to a person. Nothing proceeds until an owner decides."
        >
          <ReviewControls
            applicationId={application.application_id}
            requestedMinor={application.requested_minor}
            engineLimitMinor={view.deterministic_engine?.approved_limit_minor ?? null}
          />
        </Section>
      )}

      {/* -------------------------------------------------- evidence -- */}
      <Section
        title="Evidence"
        description="Everything the model was allowed to see, stored and content-hashed. A claim citing an id not on this list is unsupported by definition."
      >
        {view.evidence.length === 0 ? (
          <EmptyState title="No evidence stored for this application" />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {view.evidence.map((item) => (
              <Card key={item.evidence_id}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <Badge tone="outline" size="sm">
                      {statusLabel(item.evidence_type)}
                    </Badge>
                    <Mono className="text-faint">{shortHash(item.content_hash)}</Mono>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed whitespace-pre-wrap text-body">
                    {item.content_text}
                  </p>
                  <p className="mt-2 border-t border-line-soft pt-2 font-mono text-[0.6875rem] text-faint">
                    {item.evidence_id} · {item.source}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </Section>

      {/* ------------------------------------------------- policies -- */}
      <Section
        title="Policy decisions"
        description="Each engine that voted on this application. A single deny from any of them blocks it — and a missing policy engine blocks it too, because the system fails closed."
      >
        {view.policy_decisions.length === 0 ? (
          <EmptyState title="No policy decisions recorded yet" />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {view.policy_decisions.map((decision, index) => (
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

      {/* -------------------------------------------- past reviews -- */}
      {view.human_reviews.length > 0 && (
        <Section title="Review history">
          <Card>
            <CardContent className="pt-4">
              <ol className="divide-y divide-line-soft">
                {view.human_reviews.map((review, index) => (
                  <li key={index} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2.5">
                    <Badge tone={review.action === "APPROVE" ? "positive" : "critical"}>
                      {statusLabel(review.action)}
                    </Badge>
                    {review.amount_minor !== null && (
                      <span className="tnum text-sm text-ink">
                        <MoneyValue minor={review.amount_minor} />
                      </span>
                    )}
                    {review.notes !== null && review.notes !== "" && (
                      <span className="text-sm text-body">&ldquo;{review.notes}&rdquo;</span>
                    )}
                    <span className="ml-auto text-xs text-muted">
                      {dateTimeOf(review.created_at)}
                    </span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </Section>
      )}
    </div>
  );
}

function RevenueMandateCard({ mandate }: { mandate: UnderwritingView["revenue_mandate"] }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-2.5">
          <Landmark className="mt-0.5 size-4 shrink-0 text-muted" />
          <div>
            <CardTitle>Revenue mandate</CardTitle>
            <p className="mt-0.5 text-xs text-muted">
              Task revenue is contractually routed through the platform before anyone is paid. This
              is what makes the credit self-repaying.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {mandate === null ? (
          <EmptyState
            title="No mandate on file"
            body="Credit cannot be disbursed without a locked revenue mandate."
            className="py-6"
          />
        ) : (
          <Rows>
            <Row label="Mandate">
              <Mono>{shortId(mandate.mandate_id)}</Mono>
            </Row>
            <Row label="Status">
              <StatusBadge status={mandate.status} />
            </Row>
            <Row label="Locked" hint="A locked mandate cannot be redirected while credit is outstanding.">
              {mandate.locked ? (
                <span className="text-positive">Yes</span>
              ) : (
                <span className="text-caution">No</span>
              )}
            </Row>
            <Row label="Reserve cap">{money(mandate.reserve_cap_minor)}</Row>
            <Row label="Destination">
              <Mono>{mandate.destination_account_code}</Mono>
            </Row>
          </Rows>
        )}
      </CardContent>
    </Card>
  );
}
