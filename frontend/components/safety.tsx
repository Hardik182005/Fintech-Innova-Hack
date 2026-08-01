import {
  AlertTriangle,
  Check,
  FileLock2,
  Info,
  Lock,
  ServerCog,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { Container, SectionHeading } from "@/components/primitives";

/**
 * The safety section carries no certification claim of any kind, because we
 * hold none. Everything below is a design property of the running system that
 * can be read out of the source tree. "Built to be auditable" is an intent we
 * can honestly state; "audited" is not, and does not appear.
 */

type Pillar = {
  icon: LucideIcon;
  title: string;
  desc: string;
  points: string[];
};

const PILLARS: Pillar[] = [
  {
    icon: Lock,
    title: "Refusing is the default",
    desc: "Every gate in the system is written so that the failure path denies. There is no state in which uncertainty produces money.",
    points: [
      "Passport verification denies on any failed check",
      "An unreachable policy engine refuses rather than guessing",
      "A model that is unavailable or returns invalid output sends the case to a human",
    ],
  },
  {
    icon: ServerCog,
    title: "Decisions you can re-derive",
    desc: "The financial outcome is produced by deterministic code from recorded inputs, so the same inputs give the same answer every time.",
    points: [
      "A scorecard computes the limit; no model output enters the arithmetic",
      "Open Policy Agent evaluates a versioned Rego bundle per spend",
      "Every decision keeps its reason codes and a receipt hash",
    ],
  },
  {
    icon: FileLock2,
    title: "Built to be auditable",
    desc: "The record is append-only by construction rather than by policy, so an edit after the fact is a detectable event and not a matter of trust.",
    points: [
      "SHA-256 hash chain over an immutable double-entry journal",
      "Corrections post as explicit reversals, never as edits",
      "Reconciliation surfaces any imbalance so vaults can be frozen",
    ],
  },
];

const POSTURE = [
  {
    icon: UserCheck,
    label: "Humans hold the exceptions",
    detail:
      "Marginal, degraded and flagged cases go to a review queue with the reason attached. Nothing auto-approves its way past a human.",
  },
  {
    icon: ServerCog,
    label: "Inference stays local",
    detail:
      "Reasoning models run through Ollama inside the deployment. No external LLM API is called at runtime and no data is sent out to be scored.",
  },
  {
    icon: AlertTriangle,
    label: "Injection is treated as hostile",
    detail:
      "Evidence is scanned for prompt-injection patterns. A hit is recorded as a reason code and blocks automatic approval.",
  },
];

export function Safety() {
  return (
    <section id="safety" className="scroll-mt-24 bg-neutral-50 py-20 sm:py-28">
      <Container>
        <SectionHeading
          align="center"
          eyebrow="Safety posture"
          title="What actually holds the money in place"
          description="A credit system for software agents is only as good as its worst failure mode. These are the properties we designed for, described as they are implemented."
        />

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {PILLARS.map((p) => {
            const Icon = p.icon;
            return (
              <div
                key={p.title}
                className="rounded-2xl border border-neutral-200 bg-white p-8"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent-strong">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-5 font-display text-xl font-semibold tracking-tight text-ink">
                  {p.title}
                </h3>
                <p className="mt-3 text-[0.95rem] leading-relaxed text-neutral-600">
                  {p.desc}
                </p>
                <ul className="mt-5 space-y-2.5">
                  {p.points.map((pt) => (
                    <li key={pt} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" />
                      <span className="text-sm text-neutral-700">{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {POSTURE.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="rounded-2xl border border-neutral-200 bg-white p-6"
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 shrink-0 text-accent-strong" />
                  <h4 className="text-sm font-semibold text-ink">
                    {item.label}
                  </h4>
                </div>
                <p className="mt-2.5 text-sm leading-relaxed text-neutral-600">
                  {item.detail}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-8 flex items-start gap-3 rounded-2xl border border-neutral-200 bg-white p-6">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
          <p className="text-sm leading-relaxed text-neutral-600">
            <span className="font-medium text-ink">
              We hold no security or compliance certification, and claim none.
            </span>{" "}
            This is a hackathon build. What is described above is how the code
            behaves, not the outcome of any external audit or attestation.
          </p>
        </div>
      </Container>
    </section>
  );
}
