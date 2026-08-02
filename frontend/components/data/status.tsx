import * as React from "react";

import { Badge, type BadgeTone, Dot } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { humanise } from "@/lib/format";
import type { RiskTier } from "@/lib/types";

/**
 * Status vocabulary, mapped from the backend's own state machines
 * (`credence/state.py`) rather than invented here. Anything not in the map
 * falls through to neutral and a humanised label — a new backend state should
 * appear as a readable word, never as a colour that guesses at its meaning.
 */

const TONES: Record<string, BadgeTone> = {
  // Agents
  ACTIVE: "positive",
  FROZEN: "caution",
  REVOKED: "critical",

  // Credit applications
  DRAFT: "neutral",
  IDENTITY_VERIFIED: "info",
  EVIDENCE_READY: "info",
  UNDERWRITING: "info",
  POLICY_EVALUATED: "info",
  HUMAN_REVIEW_REQUIRED: "caution",
  APPROVED: "positive",
  REJECTED: "critical",
  VAULT_CREATED: "positive",
  DISBURSEMENT_ENABLED: "positive",

  // Credit vaults
  CREATED: "info",
  SPENDING: "info",
  EXPIRED: "caution",
  TASK_COMPLETED: "positive",
  TASK_FAILED: "critical",
  REVENUE_RECEIVED: "info",
  REPAID: "positive",
  PARTIALLY_REPAID: "caution",
  DEFAULTED: "critical",
  CLOSED: "neutral",

  // Transactions and policy
  PROPOSED: "neutral",
  EXECUTED: "positive",
  DENIED: "critical",
  ALLOW: "positive",
  DENY: "critical",
  SETTLED: "positive",
  PENDING: "neutral",
  OPEN: "info",
};

/**
 * Labels the backend does not supply and that would read badly if derived
 * mechanically. Everything else is humanised from the code itself.
 */
const LABELS: Record<string, string> = {
  HUMAN_REVIEW_REQUIRED: "Human review",
  DISBURSEMENT_ENABLED: "Disbursement enabled",
  IDENTITY_VERIFIED: "Identity verified",
  EVIDENCE_READY: "Evidence ready",
  POLICY_EVALUATED: "Policy evaluated",
  VAULT_CREATED: "Vault created",
  REVENUE_RECEIVED: "Revenue received",
  PARTIALLY_REPAID: "Partly repaid",
  TASK_COMPLETED: "Task completed",
  TASK_FAILED: "Task failed",
  ALLOW: "Allowed",
  DENY: "Denied",
  // The two injection codes must not read alike. Only the first means a
  // deterministic check agreed with the model; the second is the model's
  // concern alone, which is still enough to force review.
  PROMPT_INJECTION_SUSPECTED: "Prompt injection suspected",
  PROMPT_INJECTION_SUSPECTED_UNCORROBORATED: "Prompt injection — model only, unconfirmed",
  INSTRUCTION_IN_EVIDENCE: "Instruction in evidence",
  INSTRUCTION_IN_EVIDENCE_UNCORROBORATED: "Instruction in evidence — unconfirmed",
};

export function statusTone(status: string | null | undefined): BadgeTone {
  if (!status) return "neutral";
  return TONES[status.toUpperCase()] ?? "neutral";
}

export function statusLabel(status: string | null | undefined): string {
  if (!status) return "Unknown";
  const key = status.toUpperCase();
  return LABELS[key] ?? humanise(key);
}

function StatusBadge({
  status,
  className,
  showDot = true,
}: {
  status: string | null | undefined;
  className?: string;
  showDot?: boolean;
}) {
  const tone = statusTone(status);
  return (
    <Badge tone={tone} className={className}>
      {showDot && <Dot tone={tone} />}
      {statusLabel(status)}
    </Badge>
  );
}

const TIER_TONE: Record<RiskTier, BadgeTone> = {
  LOW: "positive",
  MEDIUM: "caution",
  HIGH: "critical",
};

function RiskTierBadge({ tier, className }: { tier: RiskTier | null | undefined; className?: string }) {
  if (!tier) return <Badge tone="outline" className={className}>Not scored</Badge>;
  return (
    <Badge tone={TIER_TONE[tier]} className={cn("uppercase", className)}>
      {tier} risk
    </Badge>
  );
}

export { RiskTierBadge, StatusBadge };
