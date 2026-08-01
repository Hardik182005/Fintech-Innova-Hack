"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";

import { Row, Rows } from "@/components/data/value";
import { EnvelopeValue, sampleNote } from "@/components/system-intelligence/envelope";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { dateTimeOf, humanise, relativeTime } from "@/lib/format";
import {
  PIPELINE_STAGE_ORDER,
  type MetricEnvelope,
  type PipelineStage,
  type PipelineStageStatus,
} from "@/lib/types";

/**
 * The Live Credit Decision Pipeline: sixteen stages in the contract's fixed
 * order, as a horizontally scrollable rail. The scroll lives on this container,
 * never on the page. A stage the backend has no telemetry for still appears —
 * with "No telemetry", not with zeros — because a missing stage would read as a
 * pipeline with fewer steps, which is a different (and false) claim.
 */

const STATUS_TONE: Record<PipelineStageStatus, BadgeTone> = {
  healthy: "positive",
  degraded: "caution",
  waiting: "info",
  reviewing: "info",
  failed: "critical",
  unavailable: "outline",
};

const STATUS_LABEL: Record<PipelineStageStatus, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  waiting: "Waiting",
  reviewing: "Reviewing",
  failed: "Failed",
  unavailable: "No telemetry",
};

/** What a stage the response omitted must claim: nothing. */
const NO_TELEMETRY: MetricEnvelope = {
  value: null,
  unit: "count",
  sample_size: null,
  status: "not_connected",
};

const NO_TELEMETRY_MS: MetricEnvelope = { ...NO_TELEMETRY, unit: "ms" };

/**
 * Order the response stages by the contract's fixed order. The contract says a
 * stage never disappears; if one is missing anyway, it is rendered as
 * unavailable rather than silently dropped — the pipeline has sixteen stages
 * whether or not the backend reported on all of them.
 */
function orderStages(pipeline: PipelineStage[]): PipelineStage[] {
  const byName = new Map(pipeline.map((stage) => [stage.stage, stage]));
  return PIPELINE_STAGE_ORDER.map(
    (name) =>
      byName.get(name) ?? {
        stage: name,
        label: humanise(name),
        status: "unavailable" as const,
        processed: NO_TELEMETRY,
        succeeded: NO_TELEMETRY,
        controlled_rejections: NO_TELEMETRY,
        true_errors: NO_TELEMETRY,
        p50_ms: NO_TELEMETRY_MS,
        p95_ms: NO_TELEMETRY_MS,
        last_completed_at: null,
      },
  );
}

function StageCard({
  stage,
  index,
  onOpen,
}: {
  stage: PipelineStage;
  index: number;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "w-56 shrink-0 rounded-xl border border-line bg-surface p-3 text-left",
        "transition-colors hover:border-faint hover:bg-surface-muted",
      )}
      aria-label={`${stage.label} — ${STATUS_LABEL[stage.status]}. Open stage detail.`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow">{String(index + 1).padStart(2, "0")}</span>
        <Badge tone={STATUS_TONE[stage.status]} size="sm">
          {STATUS_LABEL[stage.status]}
        </Badge>
      </div>
      <p className="mt-1.5 truncate text-sm font-medium text-ink">{stage.label}</p>
      <dl className="mt-2 space-y-1 text-xs">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">Processed</dt>
          <dd className="text-ink">
            <EnvelopeValue envelope={stage.processed} />
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">Succeeded</dt>
          <dd className="text-ink">
            <EnvelopeValue envelope={stage.succeeded} />
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">Controlled rejections</dt>
          <dd className="text-ink">
            <EnvelopeValue envelope={stage.controlled_rejections} />
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">p50 / p95</dt>
          <dd className="text-ink">
            <EnvelopeValue envelope={stage.p50_ms} />
            <span className="text-faint"> / </span>
            <EnvelopeValue envelope={stage.p95_ms} />
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-[0.6875rem] text-faint">
        Last completed {relativeTime(stage.last_completed_at)}
      </p>
    </button>
  );
}

function StageSheet({ stage, onClose }: { stage: PipelineStage | null; onClose: () => void }) {
  return (
    <Sheet
      open={stage !== null}
      onClose={onClose}
      title={stage?.label ?? ""}
      subtitle={
        stage !== null && (
          <span className="flex items-center gap-2">
            <span className="font-mono text-xs">{stage.stage}</span>
            <Badge tone={STATUS_TONE[stage.status]} size="sm">
              {STATUS_LABEL[stage.status]}
            </Badge>
          </span>
        )
      }
    >
      {stage !== null && (
        <>
          <Rows>
            <EnvelopeRow label="Processed" envelope={stage.processed} />
            <EnvelopeRow label="Succeeded" envelope={stage.succeeded} />
            <EnvelopeRow
              label="Controlled rejections"
              hint="Requests refused by policy or deterministic controls. Each one is the pipeline doing its job."
              envelope={stage.controlled_rejections}
            />
            <EnvelopeRow
              label="True errors"
              hint="Genuine technical failures — timeouts, crashes, malformed internal state. Policy rejections are never counted here."
              envelope={stage.true_errors}
            />
            <EnvelopeRow
              label="Latency p50"
              hint="Median duration for this stage over the selected window, from recorded telemetry."
              envelope={stage.p50_ms}
            />
            <EnvelopeRow
              label="Latency p95"
              hint="95th-percentile duration for this stage over the selected window, from recorded telemetry."
              envelope={stage.p95_ms}
            />
            <Row label="Last completed">
              {stage.last_completed_at === null ? (
                <span className="text-faint">—</span>
              ) : (
                <span>
                  {relativeTime(stage.last_completed_at)}
                  <span className="ml-1.5 text-xs text-muted">
                    ({dateTimeOf(stage.last_completed_at)})
                  </span>
                </span>
              )}
            </Row>
          </Rows>
          <p className="mt-4 rounded-lg border border-line-soft bg-surface-muted px-3 py-2.5 text-xs leading-relaxed text-muted">
            A policy rejection is a controlled outcome, not a technical failure. Only true errors
            count against this stage&apos;s health.
          </p>
        </>
      )}
    </Sheet>
  );
}

/** Envelope + its honest denominator, as one drawer row. */
function EnvelopeRow({
  label,
  envelope,
  hint,
}: {
  label: string;
  envelope: MetricEnvelope;
  hint?: string;
}) {
  const sample = sampleNote(envelope);
  return (
    <Row label={label} hint={hint}>
      <span>
        <EnvelopeValue envelope={envelope} />
        {sample !== null && <span className="ml-1.5 text-xs text-faint">{sample}</span>}
      </span>
    </Row>
  );
}

export function PipelineRail({ pipeline }: { pipeline: PipelineStage[] }) {
  const [selected, setSelected] = React.useState<PipelineStage | null>(null);
  const ordered = React.useMemo(() => orderStages(pipeline), [pipeline]);

  return (
    <>
      {/* The horizontal scroll belongs to this container, never the page. */}
      <div className="overflow-x-auto pb-1.5">
        <ol className="flex min-w-max items-stretch gap-1.5">
          {ordered.map((stage, index) => (
            <li key={stage.stage} className="flex items-center gap-1.5">
              <StageCard stage={stage} index={index} onOpen={() => setSelected(stage)} />
              {index < ordered.length - 1 && (
                <ChevronRight aria-hidden className="size-3.5 shrink-0 text-faint" />
              )}
            </li>
          ))}
        </ol>
      </div>
      <StageSheet stage={selected} onClose={() => setSelected(null)} />
    </>
  );
}
