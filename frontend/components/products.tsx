"use client";

import { useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  Link2,
  Scale,
  Vault,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { Container, SectionHeading } from "@/components/primitives";

/**
 * The five primitives, in the order an agent meets them: it proves who it is,
 * it is underwritten, it receives a restricted vault, the task's revenue repays
 * the vault, and every step of that is written to a chain that cannot be edited
 * afterwards.
 *
 * Every bullet here is a statement about code that exists. Nothing on this page
 * describes a customer, a measurement, or a capability we have not built.
 */

type Tab = {
  id: string;
  label: string;
  icon: LucideIcon;
  title: string;
  description: string;
  bullets: string[];
};

const TABS: Tab[] = [
  {
    id: "passport",
    label: "Agent Passport",
    icon: BadgeCheck,
    title: "Prove the agent before anything else can happen",
    description:
      "An Ed25519-signed capability token the agent presents on every privileged call. It states who the agent is, who owns it, which task categories it may act in, and the ceiling it may borrow under.",
    bullets: [
      "Six checks, all fail-closed: issuer and signature, audience, validity window, revocation, scope, single-use request nonce",
      "Any failure denies with a canonical reason code — there is no cached “trusted” shortcut",
      "An owner can revoke a single passport or an agent entirely as a kill switch",
    ],
  },
  {
    id: "underwriting",
    label: "Task-Backed Underwriting",
    icon: Scale,
    title: "A deterministic scorecard decides — never a model",
    description:
      "Credit is underwritten against one specific task's verified economics. The reasoning models read evidence and return a stance; the amount, the rate and the term are computed by ordinary code from verified inputs.",
    bullets: [
      "Inputs: verified expected revenue, eligible cost, the owner's exposure cap, credit already outstanding, the passport ceiling, and repayment history",
      "No revenue mandate, the advisory model unavailable, or an injection suspected in evidence each route to human review",
      "Every degraded path leads to review. None of them leads to approval",
    ],
  },
  {
    id: "vault",
    label: "Restricted Vault",
    icon: Vault,
    title: "Money that can only go where it was approved to go",
    description:
      "Approved credit lands in a vault that can pay allow-listed counterparties only, under a cap, inside a time window. Every spend attempt is authorised by Open Policy Agent before it can settle.",
    bullets: [
      "Vendor allow-list, purpose code, per-transaction and per-task caps, velocity and split-pattern checks",
      "If the policy engine is unreachable the call refuses — it does not fall through to a local guess",
      "The restriction is enforced at the point of payment, not requested of the agent",
    ],
  },
  {
    id: "repayment",
    label: "Repayment Waterfall",
    icon: Waves,
    title: "The task's revenue repays before its owner is paid",
    description:
      "Revenue captured under the mandate is allocated in a fixed order, in integer minor units, by pure deterministic arithmetic. The owner receives only what remains after the facility is made whole.",
    bullets: [
      "Order is fixed in code: outstanding principal, then fee, then replenish any reserve drawn, then release the remainder",
      "If the task fails, the recovery waterfall sweeps the unspent vault balance first",
      "Any residual shortfall is recorded as a bounded, visible simulated loss — never hidden",
    ],
  },
  {
    id: "audit",
    label: "Tamper-Evident Audit",
    icon: Link2,
    title: "Every decision and every movement of money, hash-chained",
    description:
      "Financial events are appended to a SHA-256 hash chain over an immutable double-entry journal. A retro-active edit breaks the chain, and the break is detectable.",
    bullets: [
      "A journal transaction that does not balance is rejected outright; corrections post as explicit reversals",
      "Reconciliation detects any global imbalance, so affected vaults can be frozen",
      "Chain integrity is verifiable on demand from the Audit Trail page",
    ],
  },
];

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-neutral-200 bg-white px-2 py-1 font-mono text-[11px] font-medium text-neutral-700">
      {children}
    </span>
  );
}

function Verdict({
  tone,
  label,
  detail,
}: {
  tone: "allow" | "deny" | "review";
  label: string;
  detail: string;
}) {
  const styles = {
    allow: "border-emerald-100 bg-emerald-50 text-emerald-800",
    deny: "border-rose-100 bg-rose-50 text-rose-800",
    review: "border-amber-100 bg-amber-50 text-amber-800",
  } as const;
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${styles[tone]}`}
    >
      <span className="text-sm font-medium">{label}</span>
      <span className="font-mono text-[11px]">{detail}</span>
    </div>
  );
}

function Field({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2">
      <span className="text-sm text-neutral-700">{name}</span>
      <span className="font-mono text-[11px] text-neutral-500">{value}</span>
    </div>
  );
}

/**
 * Illustrative panels. They show the shape of a decision — the fields checked
 * and the outcomes possible — deliberately without figures, because a made-up
 * figure on a landing page is a made-up claim.
 */
function Visual({ id }: { id: string }) {
  if (id === "passport") {
    return (
      <div className="space-y-2.5">
        <div className="text-xs font-medium text-neutral-400">
          Verification, in order
        </div>
        {[
          "Trusted issuer & signature",
          "Audience",
          "Validity window",
          "Revocation",
          "Scope",
          "Request nonce",
        ].map((check) => (
          <div
            key={check}
            className="flex items-center gap-2.5 rounded-lg border border-neutral-200 bg-white px-3 py-2"
          >
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft">
              <Check className="h-3 w-3 text-accent-strong" />
            </span>
            <span className="text-sm text-neutral-700">{check}</span>
          </div>
        ))}
        <div className="pt-1 text-xs text-neutral-500">
          Any one of them failing denies the request.
        </div>
      </div>
    );
  }

  if (id === "underwriting") {
    return (
      <div className="space-y-4">
        <div>
          <div className="text-xs font-medium text-neutral-400">
            Scorecard inputs
          </div>
          <div className="mt-2 space-y-2">
            <Field name="Expected revenue" value="verified" />
            <Field name="Eligible cost" value="verified" />
            <Field name="Owner exposure cap" value="on file" />
            <Field name="Passport ceiling" value="signed" />
            <Field name="Repayment history" value="on file" />
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-neutral-400">
            Possible outcomes
          </div>
          <div className="mt-2 space-y-2">
            <Verdict tone="allow" label="Approve" detail="limit computed" />
            <Verdict
              tone="review"
              label="Human review"
              detail="HUMAN_REVIEW_REQUIRED"
            />
            <Verdict tone="deny" label="Refuse" detail="POLICY_DENIED" />
          </div>
        </div>
      </div>
    );
  }

  if (id === "vault") {
    return (
      <div className="space-y-4">
        <div>
          <div className="text-xs font-medium text-neutral-400">
            Vault restrictions
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Tag>vendor_allow_list</Tag>
            <Tag>purpose_code</Tag>
            <Tag>amount_cap</Tag>
            <Tag>expires_at</Tag>
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-neutral-400">
            Each spend attempt
          </div>
          <div className="mt-2 space-y-2">
            <Verdict tone="allow" label="Vendor on the list" detail="settles" />
            <Verdict
              tone="deny"
              label="Vendor not on the list"
              detail="VENDOR_NOT_ALLOWED"
            />
            <Verdict
              tone="deny"
              label="Policy engine unreachable"
              detail="POLICY_ENGINE_UNAVAILABLE"
            />
          </div>
        </div>
      </div>
    );
  }

  if (id === "repayment") {
    const steps = [
      "Repay outstanding principal",
      "Pay the facility fee",
      "Replenish any reserve drawn",
      "Release the remainder to the owner",
    ];
    return (
      <div className="space-y-2.5">
        <div className="text-xs font-medium text-neutral-400">
          Revenue received — allocation order
        </div>
        {steps.map((step, i) => (
          <div
            key={step}
            className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2.5"
          >
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-[11px] font-semibold text-white">
              {i + 1}
            </span>
            <span className="text-sm text-neutral-700">{step}</span>
          </div>
        ))}
        <div className="pt-1 text-xs text-neutral-500">
          The order is fixed in code and computed in integer minor units.
        </div>
      </div>
    );
  }

  // audit
  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-neutral-400">
        Append-only hash chain
      </div>
      {[
        "DECISION_RECORDED",
        "VAULT_CREATED",
        "TRANSACTION_BLOCKED",
        "REVENUE_APPLIED",
      ].map((event, i) => (
        <div key={event} className="relative">
          {i > 0 ? (
            <span
              aria-hidden
              className="absolute -top-3 left-[1.15rem] h-3 w-px bg-neutral-200"
            />
          ) : null}
          <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2.5">
            <Link2 className="h-4 w-4 shrink-0 text-accent-strong" />
            <span className="truncate font-mono text-[11px] text-neutral-700">
              {event}
            </span>
            <span className="ml-auto font-mono text-[11px] text-neutral-400">
              prev_hash
            </span>
          </div>
        </div>
      ))}
      <div className="pt-1 text-xs text-neutral-500">
        Change any earlier row and every hash after it stops matching.
      </div>
    </div>
  );
}

export function Products() {
  const [active, setActive] = useState(TABS[0].id);
  const current = TABS.find((t) => t.id === active) ?? TABS[0];

  return (
    <section id="primitives" className="scroll-mt-24 bg-white py-20 sm:py-28">
      <Container>
        <SectionHeading
          align="center"
          eyebrow="How it works"
          title="Five primitives, and an agent meets them in this order"
          description="An autonomous agent has no legal personhood and no credit file. So the credit is not extended to the agent — it is extended to one task with verified economics, and the controls hold for the life of that task."
        />

        {/* Tabs */}
        <div className="mt-12 flex flex-wrap justify-center gap-2">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.id === active;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActive(tab.id)}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-ink text-white"
                    : "border border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:text-ink"
                }`}
                aria-pressed={isActive}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Panel */}
        <div className="mt-10 grid items-center gap-8 rounded-3xl border border-neutral-200 bg-neutral-50/60 p-6 sm:p-10 lg:grid-cols-2 lg:gap-14">
          <div>
            <h3 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              {current.title}
            </h3>
            <p className="mt-4 text-lg leading-relaxed text-neutral-600">
              {current.description}
            </p>
            <ul className="mt-6 space-y-3">
              {current.bullets.map((b) => (
                <li key={b} className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft">
                    <Check className="h-3 w-3 text-accent-strong" />
                  </span>
                  <span className="text-[0.95rem] text-neutral-700">{b}</span>
                </li>
              ))}
            </ul>
            <a
              href="#governing-rule"
              className="group mt-7 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-strong hover:text-accent"
            >
              What the model is and isn&rsquo;t allowed to do
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </a>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
            <Visual id={current.id} />
          </div>
        </div>
      </Container>
    </section>
  );
}
