/**
 * What the orb is allowed to say about this page.
 *
 * The orb is the only place on the site where prose is generated at request
 * time rather than written and reviewed. Everything else on these pages went
 * through an audit that removed three specific false claims — that OPA
 * authorises spends, that pgvector is deployed, that an undeployed model was
 * available. A 4B model asked "what does CredenceAI do?" with no grounding will
 * reproduce exactly that class of claim, because plausible-sounding fintech
 * infrastructure is what the training data is full of.
 *
 * So the model does not answer from its own knowledge. It answers from the
 * facts below, and it is instructed to say it does not know when they run out.
 * These are the same facts the reviewed page components state, written once
 * here so a change to the site does not leave the orb describing the old one.
 */

/** One-line answers to the questions a visitor actually opens a chat to ask. */
export const FACTS = [
  {
    topic: "what it is",
    text: "CredenceAI gives verified autonomous agents task-specific working capital through restricted credit vaults, with repayment taken automatically from the revenue the task earns.",
  },
  {
    topic: "sandbox",
    text: "This is a hackathon sandbox. Balances and limits are test credits, nothing is redeemable, no payment rail exists behind the vault, and a settled transaction is a ledger entry rather than a transfer. CredenceAI is not a licensed lender and nothing here is an offer of credit or financial advice.",
  },
  {
    topic: "passport",
    text: "An agent passport is the agent's verified identity. It is signed, and a spend is refused if the identity is invalid or its authorisation window has expired.",
  },
  {
    topic: "vault",
    text: "A vault is restricted credit scoped to one task. It carries a total limit, a per-transaction limit, and an allow-list of vendors the agent may pay. A spend outside any of those is denied.",
  },
  {
    topic: "policy",
    text: "Every spend attempt is authorised against a versioned Rego rule set (credence.credit/v1) before it can settle. The evaluator that runs is an in-process mirror of that bundle sharing OPA's input-document shape, and the decision it records reports engine=\"local\". Missing or malformed policy input denies the spend — there is no permissive default.",
  },
  {
    topic: "repayment",
    text: "Revenue from the task is applied in a fixed order: outstanding principal first, then the fee, then replenishing any reserve that was drawn, and whatever survives goes to the owner. The arithmetic is in integer minor units, so nothing is lost to rounding.",
  },
  {
    topic: "ai role",
    text: "The models are advisory only. They read evidence and raise flags; they never decide an amount. Every figure comes from the deterministic engine, and a model failure never produces an automatic approval — it produces a human review.",
  },
  {
    topic: "model",
    text: "The deployed analyst model is mistral-small3.2:24b-instruct-2506-q4_K_M, served on a single NVIDIA L4 that scales to zero when idle. This chat assistant is a separate, much smaller model and has no access to any account, vault, or ledger data.",
  },
  {
    topic: "audit",
    text: "Actions are written to an append-only audit chain, so a decision can be traced back to the rules and evidence that produced it.",
  },
  {
    topic: "limits",
    text: "The system is honest about what it has not shown. Two of its accuracy metrics rest on only three cases each, and it reports a metric as unavailable rather than as zero when it could not be evaluated.",
  },
] as const;

/** Sections a visitor can be pointed at, so the orb can direct rather than recite. */
export const SECTIONS = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Products", href: "#products" },
  { label: "Safety", href: "#safety" },
  { label: "Deployment", href: "#deployment" },
  { label: "Sandbox disclosure", href: "#sandbox" },
  { label: "Console", href: "/console" },
] as const;

/** Things the orb must never do, stated to the model as rules rather than tone. */
const RULES = `You are the assistant orb on the CredenceAI website. You help visitors understand what this page is about.

Answer ONLY from the facts below. If a question is not covered by them, say plainly that you do not know and point the visitor at the relevant section of the page. Never invent a feature, a number, a partner, a customer, a price, or a compliance claim.

Never say CredenceAI is production ready, fully secure, guaranteed, or 100% accurate. Never state that Open Policy Agent authorises spends — the deployed evaluator is an in-process mirror of the Rego bundle. Never offer financial or investment advice. If asked for account, balance, or personal data, explain you have no access to any of it.

Keep replies to two or three sentences. Be warm and direct. Plain text only — no markdown, no bullet points, no headings.`;

/**
 * The prompt for one question.
 *
 * Sending all ten facts every time costs about 440 tokens of prompt evaluation,
 * which on a CPU-only box is over twenty seconds before the model writes a
 * single word. Selecting the relevant ones cuts that to a fraction, and the
 * sandbox disclosure is pinned in regardless of the question — the one fact a
 * visitor is entitled to see whether or not they asked for it.
 */
export function buildPrompt(message: string): string {
  const q = message.toLowerCase();
  const scored = FACTS.map((f) => ({
    fact: f,
    score: f.topic
      .split(" ")
      .concat(f.text.toLowerCase().split(/\W+/))
      .filter((w) => w.length > 4 && q.includes(w)).length,
  }));

  const chosen = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((s) => s.fact);

  // No keyword hit means an open-ended question ("what is this?"), where the
  // overview facts are the right context rather than nothing at all.
  const base = chosen.length > 0 ? chosen : [FACTS[0], FACTS[6]];
  const pinned = FACTS.find((f) => f.topic === "sandbox")!;
  const facts = base.includes(pinned) ? base : [...base, pinned];

  return `${RULES}

FACTS:
${facts.map((f) => `- ${f.topic}: ${f.text}`).join("\n")}

PAGE SECTIONS you may point to: ${SECTIONS.map((s) => `${s.label} (${s.href})`).join(", ")}`;
}

/** The full-grounding form, kept for tests that assert on the rules themselves. */
export const SYSTEM_PROMPT = `${RULES}

FACTS:
${FACTS.map((f) => `- ${f.topic}: ${f.text}`).join("\n")}

PAGE SECTIONS you may point to: ${SECTIONS.map((s) => `${s.label} (${s.href})`).join(", ")}`;

/**
 * Answers served without touching the model at all.
 *
 * A greeting is the single most common thing typed into a chat orb, and routing
 * it through a language model means a cold GPU, a few seconds of latency, and a
 * non-zero chance of an invented sentence — to produce a hello. These are
 * matched first, so the common path is instant and cannot drift.
 */
export const CANNED: { match: RegExp; reply: string }[] = [
  {
    match: /^\s*(hi|hey|hello|yo|hiya|howdy|hi there|hey there|good (morning|afternoon|evening))\b[\s!.,]*$/i,
    reply:
      "Hi! I'm the CredenceAI orb. This page is about task-backed credit for autonomous agents — verified passports, restricted vaults, automatic repayment. Ask me anything about it.",
  },
  {
    match: /^\s*(thanks|thank you|ty|cheers|nice|cool|great|awesome)\b[\s!.,]*$/i,
    reply: "Glad that helped. Anything else you want to know about the page?",
  },
  {
    match: /^\s*(bye|goodbye|see ya|see you|later)\b[\s!.,]*$/i,
    reply: "Take care. The sandbox disclosure section is worth a read before you go.",
  },
  {
    match: /\b(who|what) are you\b|\bwhat can you do\b|\byour name\b/i,
    reply:
      "I'm a small assistant that answers questions about this page. I run on a compact local model, I only speak from what this site actually states, and I have no access to any account or vault data.",
  },
];

/**
 * Keyword routing for when no model is reachable.
 *
 * The site is deployed with the chat model unconfigured (see the orb route),
 * and an orb that returns "service unavailable" to every question is worse than
 * one that answers the common ones from the same facts the model would have
 * been given. This path is clearly labelled in the response so the UI can say
 * which one answered.
 */
export function factFallback(message: string): string | null {
  const q = message.toLowerCase();
  const hit = (...words: string[]) => words.some((w) => q.includes(w));

  if (hit("repay", "waterfall", "revenue", "principal")) return topic("repayment");
  if (hit("vault", "limit", "vendor", "spend")) return topic("vault");
  if (hit("passport", "identity", "verif")) return topic("passport");
  if (hit("policy", "rego", "opa", "authoris", "authoriz")) return topic("policy");
  if (hit("model", "llm", "mistral", "ai ", "hallucinat")) return topic("ai role");
  if (hit("audit", "trace", "ledger", "chain")) return topic("audit");
  if (hit("sandbox", "real money", "licens", "regulat", "legal", "safe", "risk", "lose"))
    return topic("sandbox");
  if (hit("accur", "metric", "how good", "reliab")) return topic("limits");
  if (hit("what", "who", "explain", "about", "credence", "do")) return topic("what it is");
  return null;
}

function topic(name: (typeof FACTS)[number]["topic"]): string {
  return FACTS.find((f) => f.topic === name)!.text;
}
