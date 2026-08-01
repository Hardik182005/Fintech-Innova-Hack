"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Lock,
  Play,
  RefreshCw,
  ShieldCheck,
  Snowflake,
  XCircle,
} from "lucide-react";

import { PageHeader, Section } from "@/components/data/section";
import { Mono } from "@/components/data/value";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { shortId } from "@/lib/format";
import { useRunScenario } from "@/lib/queries";
import type { ScenarioName, ScenarioResult } from "@/lib/types";

/**
 * Judge Demo — the six evaluation scenarios, run for real against the live
 * backend into this visitor's own workspace. Nothing on this page is staged:
 * each run registers an agent, moves test credits through the pipeline, and
 * everything it creates is then visible on the ordinary product pages.
 */

const SCENARIO_CARDS: {
  name: ScenarioName;
  code: string;
  title: string;
  body: string;
  proves: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    name: "happy-path",
    code: "A",
    title: "Happy path",
    body: "An agent with a verified passport applies, is underwritten, spends within its vault, earns revenue, and the waterfall repays everyone.",
    proves: "The whole pipeline works end to end.",
    icon: Play,
  },
  {
    name: "overspend",
    code: "B",
    title: "Overspend",
    body: "A ₹2,000 spend is attempted against a ₹1,000 limit.",
    proves: "The per-transaction cap refuses it before any money moves.",
    icon: XCircle,
  },
  {
    name: "unapproved-vendor",
    code: "C",
    title: "Unknown vendor",
    body: "The agent tries to pay a wallet that is on no allowlist.",
    proves: "Vendor allowlisting blocks payment to anywhere unvetted.",
    icon: Lock,
  },
  {
    name: "split-payment",
    code: "D",
    title: "Split payments",
    body: "Many rapid small payments try to slip under the per-transaction cap.",
    proves: "Velocity and anti-splitting aggregation freeze the vault.",
    icon: Snowflake,
  },
  {
    name: "revoke-mid-task",
    code: "E",
    title: "Kill switch",
    body: "The owner revokes the agent while a spend is pending.",
    proves: "Revocation takes effect immediately; the pending spend dies.",
    icon: ShieldCheck,
  },
  {
    name: "task-failure",
    code: "F",
    title: "Task failure",
    body: "The task fails with credit outstanding.",
    proves: "Recovery is bounded: sweep unspent funds, draw the reserve, book the loss explicitly.",
    icon: AlertTriangle,
  },
];

const FOLLOW_UPS: { label: string; href: string }[] = [
  { label: "the agent it registered", href: "/agents" },
  { label: "the application it filed", href: "/credit-applications" },
  { label: "the vault it opened", href: "/vaults" },
  { label: "every spend attempt", href: "/transactions" },
  { label: "the audit chain it extended", href: "/audit" },
];

export default function JudgeDemoPage() {
  const run = useRunScenario();
  const [running, setRunning] = React.useState<ScenarioName | null>(null);
  const [lastResult, setLastResult] = React.useState<ScenarioResult | null>(null);

  function launch(name: ScenarioName) {
    setRunning(name);
    run.mutate(name, {
      onSuccess: (result) => setLastResult(result),
      onSettled: () => setRunning(null),
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Judge Demo"
        description="Six adversarial scenarios, run live against the real backend. Each seeds into this workspace — afterwards, walk the ordinary product pages and inspect what it did."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {SCENARIO_CARDS.map((scenario) => (
          <Card key={scenario.name}>
            <CardContent className="flex h-full flex-col pt-5">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-sunken">
                  <scenario.icon className="size-4 text-body" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">
                    <span className="mr-1.5 text-faint">{scenario.code} ·</span>
                    {scenario.title}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{scenario.body}</p>
                </div>
              </div>
              <p className="mt-3 flex-1 rounded-lg bg-surface-muted px-3 py-2 text-xs leading-relaxed text-body">
                <span className="font-medium">Proves:</span> {scenario.proves}
              </p>
              <Button
                variant="primary"
                className="mt-3 w-full"
                disabled={running !== null}
                onClick={() => launch(scenario.name)}
              >
                {running === scenario.name ? (
                  <RefreshCw className="animate-spin" />
                ) : (
                  <Play />
                )}
                {running === scenario.name ? "Running against the live backend…" : "Run scenario"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {run.isError && (
        <p className="rounded-lg bg-critical-wash px-4 py-3 text-sm text-critical">
          {run.error instanceof ApiError
            ? run.error.detail
            : "The scenario could not be run. Nothing was changed."}
        </p>
      )}

      {lastResult !== null && (
        <Section
          title="Last run"
          description="What the scenario seeded, and where to see the consequences."
        >
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap items-center gap-3">
                <Badge tone="positive">Completed</Badge>
                <span className="text-sm font-medium text-ink">{lastResult.scenario}</span>
                <span className="text-sm text-muted">
                  registered <span className="text-ink">{lastResult.seed.agent_name}</span>
                </span>
                <Mono className="text-faint">{shortId(lastResult.seed.agent_id, 10, 4)}</Mono>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/agents/${lastResult.seed.agent_id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-surface-muted"
                >
                  Open this agent <ArrowRight className="size-3.5" />
                </Link>
                {FOLLOW_UPS.map((followUp) => (
                  <Link
                    key={followUp.href}
                    href={followUp.href}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-muted hover:text-ink"
                  >
                    {followUp.label} <ArrowRight className="size-3.5" />
                  </Link>
                ))}
              </div>

              <details className="mt-4">
                <summary className="cursor-pointer text-xs text-muted hover:text-body">
                  Technical details — full scenario response
                </summary>
                <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-ink p-4 font-mono text-[0.7rem] leading-relaxed text-white/85">
                  {JSON.stringify(lastResult, null, 2)}
                </pre>
              </details>
            </CardContent>
          </Card>
        </Section>
      )}

      <p className="text-xs leading-relaxed text-muted">
        Sandbox — test credits only. Scenario runs create real records in this workspace&apos;s
        database and extend its audit chain; they move no real money. Bearer tokens minted during a
        run are redacted server-side and never reach this page.
      </p>
    </div>
  );
}
