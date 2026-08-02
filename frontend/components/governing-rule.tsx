import { Cpu, Landmark, Lock, ShieldOff, type LucideIcon } from "lucide-react";
import { Container, SectionHeading } from "@/components/primitives";

/**
 * The governing rule of the system, stated on the page rather than buried in a
 * design document — because it is the whole argument. A language model is
 * useful here and is also the least trustworthy component in the stack, so it
 * is given a job that cannot move money: read the evidence and form an opinion.
 * Everything with a financial consequence is computed, authorised or enforced
 * by something deterministic.
 */

type Column = {
  icon: LucideIcon;
  kicker: string;
  title: string;
  does: string[];
  neverTitle: string;
  never: string[];
  dark?: boolean;
};

const COLUMNS: Column[] = [
  {
    icon: Cpu,
    kicker: "Advisory",
    title: "What the model may do",
    does: [
      "Read the evidence attached to a task",
      "Extract claims, each with a citation back to its source",
      "Return a stance and a written rationale",
      "Flag a suspected prompt injection in the evidence",
    ],
    neverTitle: "Never",
    never: [
      "Name an amount, a limit, a rate or a term",
      "Approve, refuse, or release a payment",
    ],
  },
  {
    icon: Landmark,
    kicker: "Authoritative",
    title: "What deterministic code decides",
    does: [
      "The approved limit, computed by a scorecard from verified inputs",
      "The rate and the term",
      "Approve, refuse, or send to a human",
      "Whether a degraded input forces review",
    ],
    neverTitle: "Never",
    never: [
      "Ask a model to arbitrate the outcome",
      "Round or hold money in binary floating point",
    ],
    dark: true,
  },
  {
    icon: Lock,
    kicker: "Enforcing",
    title: "What the controls enforce",
    does: [
      "A versioned Rego rule set authorises each individual spend",
      "The vault restricts the counterparty, the cap and the window",
      "The waterfall sequences repayment before the owner is paid",
      "The hash chain records the decision and every movement of money",
    ],
    neverTitle: "Never",
    never: [
      "Trust the agent to respect a limit voluntarily",
      // Was "Fall back to a local guess when the policy engine is unreachable",
      // which describes the failure handling of a remote call the deployed
      // system does not make. What is true, and testable, is the deny-by-
      // default rule the evaluator actually implements.
      "Treat missing or malformed policy input as permission",
    ],
  },
];

export function GoverningRule() {
  return (
    <section
      id="governing-rule"
      className="scroll-mt-24 bg-neutral-50 py-20 sm:py-28"
    >
      <Container>
        <SectionHeading
          align="center"
          eyebrow="The governing rule"
          title={
            <>
              LLMs advise; deterministic code decides; policy authorizes; the
              vault enforces; humans approve exceptions.
            </>
          }
          description="An LLM is never permitted to move money or set a limit. It produces an opinion — a stance and a rationale, with no amounts in it at all. Everything downstream of that opinion is ordinary, testable code."
        />

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {COLUMNS.map((col) => {
            const Icon = col.icon;
            return (
              <div
                key={col.title}
                className={`flex flex-col rounded-2xl border p-7 ${
                  col.dark
                    ? "border-white/10 bg-ink text-white"
                    : "border-neutral-200 bg-white"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${
                      col.dark
                        ? "bg-white/10 text-white"
                        : "bg-accent-soft text-accent-strong"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span
                    className={`text-xs font-semibold uppercase tracking-[0.16em] ${
                      col.dark ? "text-white/50" : "text-neutral-400"
                    }`}
                  >
                    {col.kicker}
                  </span>
                </div>

                <h3
                  className={`mt-5 font-display text-xl font-semibold tracking-tight ${
                    col.dark ? "text-white" : "text-ink"
                  }`}
                >
                  {col.title}
                </h3>

                <ul className="mt-5 flex-1 space-y-3">
                  {col.does.map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <span
                        aria-hidden
                        className={`mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full ${
                          col.dark ? "bg-accent" : "bg-accent-strong"
                        }`}
                      />
                      <span
                        className={`text-[0.95rem] leading-relaxed ${
                          col.dark ? "text-white/75" : "text-neutral-700"
                        }`}
                      >
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>

                <div
                  className={`mt-6 rounded-xl border p-4 ${
                    col.dark
                      ? "border-white/10 bg-white/5"
                      : "border-neutral-200 bg-neutral-50"
                  }`}
                >
                  <div
                    className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] ${
                      col.dark ? "text-white/50" : "text-neutral-400"
                    }`}
                  >
                    <ShieldOff className="h-3.5 w-3.5" />
                    {col.neverTitle}
                  </div>
                  <ul className="mt-2.5 space-y-1.5">
                    {col.never.map((item) => (
                      <li
                        key={item}
                        className={`text-sm leading-relaxed ${
                          col.dark ? "text-white/60" : "text-neutral-600"
                        }`}
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mx-auto mt-10 max-w-3xl text-center text-[0.95rem] leading-relaxed text-neutral-600">
          The reasoning models run locally through Ollama. No external LLM API is
          called at runtime, and no data leaves the deployment to be scored.
          Where the model is unavailable or its output fails schema validation,
          the application degrades to human review — never to approval.
        </p>
      </Container>
    </section>
  );
}
