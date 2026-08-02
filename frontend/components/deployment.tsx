import { Boxes, Cloud, Cpu, Database, Scale } from "lucide-react";
import { Container, Pill, SectionHeading } from "@/components/primitives";

/**
 * Live deployed architecture on GCP. Applied via Terraform in gated stages.
 * Private Cloud Run services, private Cloud SQL PostgreSQL, a deterministic
 * Rego-mirror policy engine, and private NVIDIA L4 GPU inference engine.
 */

const COMPONENTS = [
  {
    icon: Boxes,
    title: "FastAPI Service",
    desc: "A Python service running on Google Cloud Run exposing REST /v1 — identity, tasks, credit, vault, repayment, audit and monitoring.",
    tags: ["Cloud Run", "REST /v1", "OpenAPI"],
  },
  {
    icon: Database,
    title: "Private Cloud SQL PostgreSQL",
    desc: "System of record running on a private IP. Double-entry journal, tenant-scoped evidence retrieval, hash-chained audit events, and immutable rows.",
    tags: ["Cloud SQL", "PostgreSQL 15", "Private IP"],
  },
  {
    icon: Scale,
    title: "Deterministic policy engine",
    // Says which evaluator actually runs. An OPA sidecar container is deployed
    // beside the API, but no request path calls it: every spend is authorised
    // in-process by a mirror of the Rego bundle, and the decision it records
    // reports engine="local". Naming OPA as the enforcer would name a control
    // that does not run.
    desc: "Every spend attempt is authorised against a versioned Rego rule set (credence.credit/v1) before it can settle. The deployed evaluator is an in-process mirror of that bundle sharing OPA's input-document shape; missing or malformed input denies.",
    tags: ["Rego rules", "In-process evaluator", "Fail-closed"],
  },
  {
    icon: Cpu,
    title: "Private GPU Inference Engine",
    desc: "A private Cloud Run NVIDIA L4 GPU service (credence-inference) serving Mistral Small 3.2 24B Instruct (Q4_K_M) under schema-constrained decoding at an 8K context, verified loaded on GPU by digest before the service reports ready. Its output is advisory only — it can raise concerns and force human review, but the deterministic engine sets every limit and no model output can approve credit.",
    tags: ["NVIDIA L4 GPU", "Mistral Small 3.2 24B (Q4_K_M)", "Advisory only"],
  },
];

const GCP = [
  "Google Cloud Run for API (credence-api) & Web Frontend (credence-web)",
  "Cloud SQL PostgreSQL instance (credence-pg) on Private IP",
  "Cloud Run NVIDIA L4 GPU Service (credence-inference) — private, scales to zero",
  "Ed25519 passport signing key held in Secret Manager, injected at startup",
];

export function Deployment() {
  return (
    <section id="architecture" className="scroll-mt-24 bg-white py-20 sm:py-28">
      <Container>
        <SectionHeading
          align="center"
          eyebrow="Architecture"
          title="Applied Terraform & Live GCP Sandbox Stack"
          description="The entire sandbox architecture is provisioned with Terraform on GCP — Cloud Run services, private Cloud SQL PostgreSQL, a deterministic Rego-mirror policy engine, and private NVIDIA L4 GPU inference. Test credits only; no real money moves."
        />

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {COMPONENTS.map((c) => {
            const Icon = c.icon;
            return (
              <div
                key={c.title}
                className="group relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-8 transition-all duration-200 hover:border-neutral-300 hover:shadow-lg"
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-accent-soft opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-70"
                />
                <span className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl bg-ink text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="relative mt-5 font-display text-xl font-semibold tracking-tight text-ink">
                  {c.title}
                </h3>
                <p className="relative mt-3 text-[0.95rem] leading-relaxed text-neutral-600">
                  {c.desc}
                </p>
                <div className="relative mt-5 flex flex-wrap gap-1.5">
                  {c.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs font-medium text-neutral-600"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50/60 p-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white text-accent-strong ring-1 ring-neutral-200">
              <Cloud className="h-5 w-5" />
            </span>
            <h3 className="font-display text-xl font-semibold tracking-tight text-ink">
              Deployed GCP Sandbox Infrastructure
            </h3>
            <Pill className="ml-auto">Terraform · Deployed on GCP</Pill>
          </div>
          <p className="mt-4 max-w-3xl text-[0.95rem] leading-relaxed text-neutral-600">
            Infrastructure-as-code describes and manages the deployed GCP sandbox
            environment. Applied via Terraform in gated stages with strict security
            boundaries, private IP networking, and zero external LLM API dependencies.
            Synthetic data and test credits only — no real money moves.
          </p>
          <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
            {GCP.map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <span
                  aria-hidden
                  className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-accent-strong"
                />
                <span className="text-sm text-neutral-700">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}
