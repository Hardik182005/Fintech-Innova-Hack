/**
 * The vocabulary the onboarding forms offer, and the order their writes run in.
 *
 * Two things live here rather than inside the components. The first is the
 * closed lists — evidence types, task categories, agent kinds. Each of them is
 * a value the backend keys behaviour off, so a free-text box would let someone
 * type a category no policy rule knows about and get a decision that quietly
 * skipped a check. The evidence list in particular mirrors `EVIDENCE_TYPES` in
 * `credence/api/routes.py`; the server refuses anything else with a 422, and
 * this is the copy the browser offers so the two cannot drift silently.
 *
 * The second is `runSteps`. Registering an agent is four writes and submitting
 * an application is five, each depending on the id the last one returned. A
 * failure at step three has already created two real rows, and the caller has
 * to be able to say which ones, so the runner reports progress as it goes
 * rather than resolving once at the end.
 */

/** One selectable option, with the sentence that explains when to pick it. */
export interface Choice {
  value: string;
  label: string;
  hint?: string;
}

/**
 * Evidence kinds. The seven the product asks for, plus the two the demo
 * scenarios already write, so a hand-built application looks like a seeded one.
 */
export const EVIDENCE_TYPES: Choice[] = [
  { value: "TASK_ORDER", label: "Task order", hint: "The order or brief the work is being done against." },
  { value: "TASK_CONTRACT", label: "Task contract", hint: "Signed terms covering the engagement." },
  { value: "INVOICE", label: "Invoice", hint: "A bill raised or received for this task." },
  { value: "COST_QUOTE", label: "Cost quote", hint: "What the inputs are expected to cost, per vendor." },
  { value: "PRIOR_TASK_OUTCOME", label: "Prior task outcome", hint: "How comparable work by this agent ended." },
  { value: "REPAYMENT_HISTORY", label: "Repayment history", hint: "Whether earlier facilities were repaid." },
  { value: "AUTHORIZATION", label: "Authorization", hint: "The owner's written permission to borrow." },
  { value: "VENDOR_INFO", label: "Vendor information", hint: "Who is being paid, and on what terms." },
  { value: "SPENDING_HISTORY", label: "Spending history", hint: "Where this agent's money has gone before." },
  { value: "RISK_EVENT", label: "Risk event", hint: "A breach, dispute or failure worth disclosing." },
];

/** Task categories. Also the scope a passport grants — the two must match, or
 *  the passport check fails with SCOPE_MISSING at evaluation. */
export const TASK_CATEGORIES: Choice[] = [
  { value: "COMPUTE", label: "Compute" },
  { value: "IMAGE", label: "Image generation" },
  { value: "DATA", label: "Data and enrichment" },
  { value: "LOGISTICS", label: "Logistics" },
  { value: "MARKETING", label: "Marketing" },
];

/**
 * What kind of agent this is. This is recorded as the agent's model provider,
 * which is the field the system actually stores and shows on the agent's
 * profile — there is no separate "agent type" column, and inventing a dropdown
 * that wrote nowhere would be a control that does not exist.
 */
export const MODEL_PROVIDERS: Choice[] = [
  { value: "ollama", label: "Self-hosted (Ollama)" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "google", label: "Google" },
  { value: "other", label: "Other" },
];

/** Sensible synthetic evidence, offered as a starting point. Safe by
 *  construction: no real counterparties and no identifiers. */
export const EVIDENCE_TEMPLATES: Record<string, string> = {
  TASK_ORDER:
    "Purchase order SYN-2044 from sandbox customer NorthWind Retail: payment of ₹4,000.00 due on delivery of 800 enriched product listings.",
  TASK_CONTRACT:
    "Engagement terms SYN-2044: fixed fee ₹4,000.00, delivery within 48 hours, payment routed to the platform revenue account on acceptance.",
  INVOICE: "Invoice SYN-INV-118 raised against order SYN-2044 for ₹4,000.00, net 0 days on delivery.",
  COST_QUOTE:
    "Cost estimate: compute ₹1,500.00 (vendor_gcp_compute), image generation ₹900.00 (vendor_image_api). Total ₹2,400.00.",
  PRIOR_TASK_OUTCOME:
    "Prior task SYN-1987: 600 listings enriched, delivered 6 hours early, accepted without revision. Revenue ₹3,000.00 received in full.",
  REPAYMENT_HISTORY:
    "Two prior facilities on this agent, ₹1,000.00 and ₹2,500.00, both repaid in full from task revenue with no reserve draw.",
  AUTHORIZATION:
    "Owner authorisation: this agent may borrow up to ₹5,000.00 against catalogue enrichment work, expiring with the current passport.",
  VENDOR_INFO:
    "vendor_gcp_compute — compute, settled per usage, active on the platform allowlist. vendor_image_api — image generation, prepaid per call.",
  SPENDING_HISTORY:
    "Last 30 days: ₹2,400.00 across two vendors, both on the allowlist. No blocked proposals, no split-payment flags.",
  RISK_EVENT:
    "One delivery slipped 4 hours in the prior quarter after an upstream API outage. No financial loss, no reserve draw, no dispute raised.",
};

// ---------------------------------------------------------------- sequencing --

export interface Step<T = unknown> {
  /** Shown while it runs and after it finishes. */
  label: string;
  run: () => Promise<T>;
}

export interface StepState {
  label: string;
  status: "pending" | "running" | "done" | "failed";
  /** A short line naming what the step created, once it has. */
  detail?: string;
  error?: string;
}

/**
 * Run steps in order, reporting after each.
 *
 * Stops at the first failure and leaves every earlier step marked done, because
 * those rows exist. The caller shows that list rather than a single "submission
 * failed", so a person can see that their agent was created and only the
 * passport was not, and go back to the one thing that needs redoing.
 */
export async function runSteps(
  steps: readonly Step[],
  onProgress: (states: StepState[]) => void,
): Promise<{ ok: boolean; results: unknown[] }> {
  const states: StepState[] = steps.map((s) => ({ label: s.label, status: "pending" }));
  const results: unknown[] = [];

  for (let i = 0; i < steps.length; i += 1) {
    states[i] = { ...states[i], status: "running" };
    onProgress([...states]);
    try {
      const result = await steps[i].run();
      results.push(result);
      states[i] = { ...states[i], status: "done", detail: describe(result) };
      onProgress([...states]);
    } catch (error) {
      states[i] = {
        ...states[i],
        status: "failed",
        error: error instanceof Error ? error.message : "That step did not complete.",
      };
      onProgress([...states]);
      return { ok: false, results };
    }
  }

  return { ok: true, results };
}

/** The id a write returned, if it returned one worth showing. */
function describe(result: unknown): string | undefined {
  if (result === null || typeof result !== "object") return undefined;
  const record = result as Record<string, unknown>;
  for (const key of ["agent_id", "passport_id", "task_id", "evidence_id", "mandate_id", "application_id", "vault_id", "repayment_id"]) {
    const value = record[key];
    if (typeof value === "string") return value;
  }
  return undefined;
}
