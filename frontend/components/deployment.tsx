import { Boxes, Cloud, Cpu, Database, Scale } from "lucide-react";
import { Container, Pill, SectionHeading } from "@/components/primitives";

/**
 * Live deployed architecture on GCP. Applied via Terraform in gated stages.
 * Private Cloud Run services, private Cloud SQL PostgreSQL, OPA policy sidecar,
 * and private NVIDIA L4 GPU inference engine.
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
    desc: "System of record running on a private IP. Double-entry journal, pgvector evidence retrieval, hash-chained audit events, and immutable rows.",
    tags: ["Cloud SQL", "PostgreSQL 15", "pgvector"],
  },
  {
    icon: Scale,
    title: "Open Policy Agent",
    desc: "A Rego policy bundle evaluated in an OPA container sidecar for each spend attempt. Enforces fail-closed tenant authorization.",
    tags: ["Rego", "Sidecar", "Fail-closed"],
  },
  {
    icon: Cpu,
    title: "Private GPU Inference Engine",
    desc: "Schema-constrained local inference serving mistral-small3.2:24b-instruct-2506-q4_K_M on a private Cloud Run NVIDIA L4 GPU service.",
    tags: ["NVIDIA L4 GPU", "Mistral 24B", "Schema-constrained"],
  },
];

const GCP = [
  "Google Cloud Run for API (credence-api) & Web Frontend (credence-web)",
  "Cloud SQL PostgreSQL instance (credence-pg) on Private IP with pgvector",
  "Cloud Run NVIDIA L4 GPU Service (credence-inference) with Mistral 24B",
  "Cloud KMS asymmetric key rings for passport signing and evidence encryption",
];

export function Deployment() {
  return (
    <section id="architecture" className="scroll-mt-24 bg-white py-20 sm:py-28">
      <Container>
        <SectionHeading
          align="center"
          eyebrow="Architecture"
          title="Applied Terraform & Live GCP Sandbox Stack"
          description="The entire sandbox architecture is provisioned with Terraform on GCP — Cloud Run services, private Cloud SQL PostgreSQL, OPA policy sidecar, and private NVIDIA L4 GPU inference. Test credits only; no real money moves."
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
