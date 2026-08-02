"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Bot, FileText, Sparkles } from "lucide-react";

import { buttonStyle } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAgents, useApplications } from "@/lib/queries";

/**
 * The first thing someone sees on an untouched workspace.
 *
 * Overview opens on figures, and figures about nothing are not a way in. This
 * says what to do instead, and disappears once there is anything to look at.
 *
 * "Anything" deliberately includes the seeded demonstration data: a workspace
 * that already carries a demo agent is not a first run, and the banner does not
 * push a visitor to overwrite what is there. It reappears only if the workspace
 * is genuinely empty.
 */
export function FirstRunBanner() {
  const agents = useAgents();
  const applications = useApplications();

  // Only when both answered, and both are empty. While either is loading, or if
  // either failed, showing a "you have nothing" banner would be a claim the
  // client cannot make.
  const empty =
    agents.data !== undefined &&
    applications.data !== undefined &&
    agents.data.length === 0 &&
    applications.data.length === 0;

  if (!empty) return null;

  return (
    <Card className="border-info/30 bg-info-wash p-5">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0 max-w-2xl">
          <h2 className="text-base font-semibold tracking-tight text-ink">
            Start your first task-backed credit request
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-body">
            This workspace has no agents and no applications yet. Register an agent, give it a
            signed passport, then borrow against a task it has been contracted to do. Everything
            you enter is written to the live backend — this is a sandbox with test credits, not a
            mock.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link href="/start" className={buttonStyle({ variant: "primary" })}>
              <Sparkles /> Start guided setup <ArrowRight />
            </Link>
            <Link href="/agents" className={buttonStyle({ variant: "secondary" })}>
              <Bot /> Register AI agent
            </Link>
            <Link
              href="/credit-applications"
              className={buttonStyle({ variant: "secondary" })}
            >
              <FileText /> Create credit application
            </Link>
            <Link href="/judge-demo" className={buttonStyle({ variant: "subtle" })}>
              Run judge demo
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}
