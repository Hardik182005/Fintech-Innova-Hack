"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Check,
  FileText,
  PlayCircle,
  ShieldCheck,
  Wallet,
} from "lucide-react";

import { PageHeader } from "@/components/data/section";
import { FirstRunBanner } from "@/components/onboarding/first-run-banner";
import { NewApplicationSheet } from "@/components/onboarding/new-application";
import { RegisterAgentSheet } from "@/components/onboarding/register-agent";
import { Badge } from "@/components/ui/badge";
import { Button, buttonStyle } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { count } from "@/lib/format";
import { useAgents, useApplications, useRepayments, useVaults } from "@/lib/queries";

/**
 * First run.
 *
 * Overview answers "how is the portfolio doing", which is the wrong question
 * for someone who has just arrived and has no portfolio. This page answers
 * "what do I do", in the order the system actually requires: an agent must
 * exist and hold a passport before it can apply; an application must be
 * approved before a vault can hold its credit; a vault must exist before
 * revenue can repay anything.
 *
 * Each step reports from live workspace data rather than from local wizard
 * state, so a step is ticked because the row exists in the database, not
 * because a button was pressed. Reloading the page does not lose progress, and
 * a workspace that already carries seeded demonstration data opens with the
 * early steps already done — nothing here overwrites it.
 */

export default function StartPage() {
  const agents = useAgents();
  const applications = useApplications();
  const vaults = useVaults();
  const repayments = useRepayments();

  const [registering, setRegistering] = React.useState(false);
  const [applying, setApplying] = React.useState(false);
  const [newAgentId, setNewAgentId] = React.useState<string | undefined>(undefined);

  const passportHolders = (agents.data ?? []).filter((a) => a.has_passport);
  const approved = (applications.data ?? []).filter((a) =>
    ["APPROVED", "VAULT_CREATED", "DISBURSEMENT_ENABLED"].includes(a.status),
  );
  const repaid = repayments.data ?? [];

  const loading =
    agents.isPending || applications.isPending || vaults.isPending || repayments.isPending;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Start here"
        description="Put your own agent and your own credit request through the system. Everything below writes to the live backend; the sandbox issues test credits only."
        actions={
          <Link href="/dashboard" className={buttonStyle({ variant: "secondary" })}>
            Skip to Overview <ArrowRight />
          </Link>
        }
      />

      <FirstRunBanner />

      <RegisterAgentSheet
        open={registering}
        onClose={() => setRegistering(false)}
        onRegistered={setNewAgentId}
      />
      <NewApplicationSheet
        open={applying}
        onClose={() => setApplying(false)}
        presetAgentId={newAgentId}
      />

      <ol className="space-y-4">
        <StepCard
          index={1}
          icon={Bot}
          title="Register an AI agent and issue its passport"
          body="The passport is the capability token that says who the agent is, what work it may do, who owns it, how much it may borrow and until when. All six checks — signature and trusted issuer, audience, validity window, revocation, scope, replay nonce — are re-run against the stored passport before it counts as registered."
          done={passportHolders.length > 0}
          loading={loading}
          status={
            passportHolders.length > 0
              ? `${count(passportHolders.length)} agent${passportHolders.length === 1 ? "" : "s"} holding a verified passport`
              : undefined
          }
          action={
            <Button variant="primary" onClick={() => setRegistering(true)}>
              Register agent
            </Button>
          }
          secondary={<Link href="/agents" className={buttonStyle({ variant: "secondary" })}>View agents</Link>}
        />

        <StepCard
          index={2}
          icon={FileText}
          title="Create a credit application against a task"
          body="Describe the task, what it costs, what it earns and when it pays. Attach evidence — the task order, prior outcomes, repayment history, the owner's authorisation. Identifiers are stripped before storage and every entry is content-hashed on arrival."
          done={(applications.data ?? []).length > 0}
          loading={loading}
          status={
            (applications.data ?? []).length > 0
              ? `${count((applications.data ?? []).length)} application${(applications.data ?? []).length === 1 ? "" : "s"} submitted`
              : undefined
          }
          disabled={passportHolders.length === 0}
          disabledReason="Register an agent first — credit is only extended to an agent holding a verified passport."
          action={
            <Button variant="primary" onClick={() => setApplying(true)}>
              New credit application
            </Button>
          }
          secondary={
            <Link href="/credit-applications" className={buttonStyle({ variant: "secondary" })}>
              View applications
            </Link>
          }
        />

        <StepCard
          index={3}
          icon={ShieldCheck}
          title="Run underwriting and read the decision"
          body="Open the application to run it. Evidence is retrieved, the analyst model gives an advisory read, and the deterministic engine sets the amount — the model cannot. You see the retrieved evidence, the advisory result, the engine's cap, the policy decision, the reason codes and the audit receipt."
          done={approved.length > 0 || (applications.data ?? []).some((a) => a.status === "REJECTED")}
          loading={loading}
          status={
            approved.length > 0 ? `${count(approved.length)} approved` : undefined
          }
          disabled={(applications.data ?? []).length === 0}
          disabledReason="Submit an application first."
          secondary={
            <Link href="/underwriting" className={buttonStyle({ variant: "secondary" })}>
              Underwriting queue
            </Link>
          }
        />

        <StepCard
          index={4}
          icon={Wallet}
          title="Create the vault, complete the task and repay"
          body="An approved application becomes a vault holding the granted limit, with the per-payment ceiling and the vendor allowlist enforced on every spend. Record the task completing and the revenue arriving, and the waterfall repays principal, fee and owner in order. The failure control is there too, so you can see what a task that does not deliver costs."
          done={repaid.length > 0}
          loading={loading}
          status={
            (vaults.data ?? []).length > 0
              ? `${count((vaults.data ?? []).length)} vault${(vaults.data ?? []).length === 1 ? "" : "s"}, ${count(repaid.length)} repayment event${repaid.length === 1 ? "" : "s"} recorded`
              : undefined
          }
          disabled={approved.length === 0}
          disabledReason="Get an application approved first."
          secondary={
            <Link href="/vaults" className={buttonStyle({ variant: "secondary" })}>
              View vaults
            </Link>
          }
        />
      </ol>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
          <div className="min-w-0 max-w-xl">
            <p className="text-sm font-medium text-ink">Short on time?</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              The judge demo runs a full scenario end to end against the same endpoints, including
              the ones that fail closed. It creates its own agents and applications and leaves
              anything you have made alone.
            </p>
          </div>
          <Link href="/judge-demo" className={buttonStyle({ variant: "primary" })}>
            <PlayCircle /> Run judge demo
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function StepCard({
  index,
  icon: Icon,
  title,
  body,
  done,
  loading,
  status,
  disabled = false,
  disabledReason,
  action,
  secondary,
}: {
  index: number;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  done: boolean;
  loading: boolean;
  status?: string;
  disabled?: boolean;
  disabledReason?: string;
  action?: React.ReactNode;
  secondary?: React.ReactNode;
}) {
  return (
    <li>
      <Card className={done ? "border-positive/30" : undefined}>
        <CardContent className="flex gap-4 pt-5">
          <div
            className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
              done ? "bg-positive-wash text-positive" : "bg-surface-sunken text-faint"
            }`}
            aria-hidden
          >
            {done ? <Check className="size-4" /> : <Icon className="size-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold tracking-tight text-ink">
                <span className="mr-1.5 text-faint">{index}.</span>
                {title}
              </h2>
              {loading ? null : done ? (
                <Badge tone="positive" size="sm">
                  Done
                </Badge>
              ) : disabled ? (
                <Badge tone="outline" size="sm">
                  Waiting
                </Badge>
              ) : null}
            </div>
            <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted">{body}</p>
            {status !== undefined && (
              <p className="mt-1.5 text-xs text-positive">{status}</p>
            )}
            {disabled && disabledReason !== undefined && (
              <p className="mt-1.5 text-xs text-muted">{disabledReason}</p>
            )}
            {(action !== undefined || secondary !== undefined) && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {!disabled && action}
                {secondary}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </li>
  );
}
