"use client";

import { useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  Hash,
  ListTree,
  ShieldX,
  Sigma,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import { Button, Container, SectionHeading } from "@/components/primitives";

/**
 * Real endpoints, real field names, real reason codes. The bearer token is an
 * environment variable in every snippet and is never printed: the browser is
 * not a place a credential belongs, and a landing page is not a place to teach
 * anyone otherwise.
 */

const SNIPPETS: { id: string; label: string; code: string }[] = [
  {
    id: "apply",
    label: "Apply",
    code: `# Amounts are integer minor units (paise). Sandbox: test credits only.
curl -X POST "$CREDENCE_API/v1/credit-applications" \\
  -H "Authorization: Bearer $CREDENCE_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "agent_id": "agt_...",
    "task_id": "tsk_...",
    "requested_minor": 250000,
    "requested_duration_hours": 48,
    "expected_revenue_minor": 640000,
    "expected_cost_minor": 230000,
    "owner_exposure_cap_minor": 1000000,
    "proposed_vendor_ids": ["ven_..."]
  }'

# Then run the deterministic decision pipeline over it.
curl -X POST \\
  "$CREDENCE_API/v1/credit-applications/$APP_ID/evaluate" \\
  -H "Authorization: Bearer $CREDENCE_API_TOKEN"`,
  },
  {
    id: "spend",
    label: "Spend",
    code: `# Every spend is proposed first and authorized before it can settle.
curl -X POST \\
  "$CREDENCE_API/v1/vaults/$VAULT_ID/transactions/propose" \\
  -H "Authorization: Bearer $CREDENCE_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "vendor_id": "ven_not_on_the_allow_list",
    "amount_minor": 40000,
    "purpose_code": "COMPUTE",
    "idempotency_key": "spend-0001-abcd"
  }'

# => 201 { "status": "BLOCKED",
#          "reason_codes": ["VENDOR_NOT_ALLOWED"] }
# The vault refuses at the point of payment, not by asking the agent.`,
  },
  {
    id: "inspect",
    label: "Inspect",
    code: `import os, httpx

api = httpx.Client(
    base_url=os.environ["CREDENCE_API"],
    headers={"Authorization": f"Bearer {os.environ['CREDENCE_API_TOKEN']}"},
)

# Every stage this one request passed through, in order, with timings.
request_id = "req_..."
trace = api.get(f"/v1/requests/{request_id}/trace").json()

# Aggregate pipeline health, model assurance and policy enforcement.
health = api.get("/v1/system-intelligence").json()

# Recompute the audit chain and report the first break, if any.
chain = api.get("/v1/audit/chain/verify").json()`,
  },
];

const FEATURES: { icon: LucideIcon; title: string; desc: string }[] = [
  {
    icon: Sigma,
    title: "Integer minor units",
    desc: "Every amount field ends in _minor and carries paise. No decimal ever crosses the wire.",
  },
  {
    icon: ShieldX,
    title: "Canonical reason codes",
    desc: "A refusal returns codes like VENDOR_NOT_ALLOWED or POLICY_ENGINE_UNAVAILABLE — never an opaque failure.",
  },
  {
    icon: ListTree,
    title: "Per-request traces",
    desc: "Ask any request for its own trace and get the pipeline stages it passed, in order.",
  },
  {
    icon: Hash,
    title: "Verifiable receipts",
    desc: "Decisions carry a receipt hash, and the audit chain can be recomputed on demand.",
  },
];

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="overflow-x-auto px-5 py-5 font-mono text-[13px] leading-relaxed text-neutral-300">
      <code>
        {code.split("\n").map((line, i) => {
          const trimmed = line.trimStart();
          const isComment =
            trimmed.startsWith("#") || trimmed.startsWith("//");
          return (
            <span
              key={i}
              className={isComment ? "text-neutral-500" : undefined}
            >
              {line}
              {"\n"}
            </span>
          );
        })}
      </code>
    </pre>
  );
}

export function Developers() {
  const [tab, setTab] = useState(SNIPPETS[0].id);
  const [copied, setCopied] = useState(false);
  const current = SNIPPETS.find((s) => s.id === tab) ?? SNIPPETS[0];

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(current.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <section id="api" className="scroll-mt-24 bg-white py-20 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow="The API"
          title="Plain REST, and it tells you why it said no"
          description="A FastAPI service under /v1. There is no SDK to install and nothing clever to learn — the interesting part is that every refusal comes back with the reason attached."
        />

        <div className="mt-12 grid gap-8 lg:grid-cols-5 lg:gap-10">
          {/* Code */}
          <div className="lg:col-span-3">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-ink shadow-[0_24px_60px_-24px_rgba(10,10,11,0.45)]">
              <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5">
                <div className="flex items-center gap-1">
                  <Terminal className="ml-1 mr-2 h-4 w-4 text-neutral-500" />
                  {SNIPPETS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setTab(s.id)}
                      className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        s.id === tab
                          ? "bg-white/10 text-white"
                          : "text-neutral-400 hover:text-white"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={onCopy}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label="Copy code"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <CodeBlock code={current.code} />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-neutral-500">
              The bearer token is read from the environment in every example.
              The web app never holds one: it is attached server-side by the
              proxy, so no credential reaches the browser.
            </p>
          </div>

          {/* Feature list */}
          <div className="lg:col-span-2">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {FEATURES.map((f) => {
                const Icon = f.icon;
                return (
                  <div
                    key={f.title}
                    className="rounded-xl border border-neutral-200 bg-white p-4 transition-colors hover:border-neutral-300"
                  >
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent-strong">
                        <Icon className="h-4.5 w-4.5" />
                      </span>
                      <h3 className="font-medium text-ink">{f.title}</h3>
                    </div>
                    <p className="mt-2.5 text-sm leading-relaxed text-neutral-600">
                      {f.desc}
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button href="/developer/console">
                Open the developer console
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Button>
              <Button href="/judge-demo" variant="secondary">
                Run the demo scenarios
              </Button>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
