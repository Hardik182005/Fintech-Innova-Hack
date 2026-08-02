import { describe, expect, it } from "vitest";

import { CANNED, FACTS, SYSTEM_PROMPT, buildPrompt, factFallback } from "./orb-knowledge";

/**
 * The orb is the one surface on this site that emits prose nobody reviewed
 * before it shipped. The audit that preceded it removed three specific false
 * claims from reviewed copy — that OPA authorises spends, that pgvector is
 * deployed, that an undeployed model was available. These tests pin the
 * grounding so the orb cannot reintroduce that class of claim through the back
 * door, and so a greeting keeps working without a model behind it.
 */

const reply = (text: string) => CANNED.find((c) => c.match.test(text))?.reply;

describe("canned replies", () => {
  it("greets, which is the whole point of the orb", () => {
    for (const greeting of ["hi", "Hi", "hey", "hello!", "Hey there", "good morning"]) {
      expect(reply(greeting), greeting).toContain("CredenceAI orb");
    }
  });

  it("does not treat a real question as a greeting", () => {
    // "hi" inside "which" must not fire the greeting pattern.
    expect(reply("which vault limits apply?")).toBeUndefined();
    expect(reply("hello, can I borrow money for my business?")).toBeUndefined();
  });

  it("answers what it is without reaching for a model", () => {
    expect(reply("who are you")).toContain("no access");
  });
});

describe("grounding", () => {
  it("forbids the claims the audit removed", () => {
    expect(SYSTEM_PROMPT).toMatch(/Never state that Open Policy Agent authorises spends/);
    expect(SYSTEM_PROMPT).toMatch(/production ready/);
    expect(SYSTEM_PROMPT).toMatch(/Never offer financial or investment advice/);
  });

  it("never names a control or component that is not deployed", () => {
    // Only the facts — the system prompt says these words in order to ban them,
    // so scanning it here would fail on its own safety rules.
    const corpus = FACTS.map((f) => f.text).join(" ").toLowerCase();
    expect(corpus).not.toContain("pgvector");
    expect(corpus).not.toContain("qwen3:8b");
    expect(corpus).not.toContain("production-ready");
    expect(corpus).not.toContain("production ready");
    expect(corpus).not.toContain("guaranteed");
    expect(corpus).not.toContain("100% accurate");
  });

  it("states the policy engine as the one that actually runs", () => {
    const policy = FACTS.find((f) => f.topic === "policy")!.text;
    expect(policy).toContain('engine="local"');
    expect(policy).toContain("credence.credit/v1");
    // If a future edit says OPA enforces, it changes this line first.
    expect(policy).not.toMatch(/Open Policy Agent (authorises|enforces|evaluates)/);
  });

  it("discloses the sandbox in the facts, not only in the page footer", () => {
    const sandbox = FACTS.find((f) => f.topic === "sandbox")!.text;
    expect(sandbox).toContain("not a licensed lender");
    expect(sandbox).toContain("test credits");
  });

  it("keeps the model advisory", () => {
    expect(FACTS.find((f) => f.topic === "ai role")!.text).toContain("never decide an amount");
  });
});

describe("prompt selection", () => {
  it("always carries the rules, whatever facts it selects", () => {
    for (const q of ["what is a vault?", "hello", "qwertyuiop"]) {
      const p = buildPrompt(q);
      expect(p, q).toMatch(/Never state that Open Policy Agent authorises spends/);
      expect(p, q).toMatch(/Answer ONLY from the facts below/);
    }
  });

  it("pins the sandbox disclosure into every prompt, asked for or not", () => {
    // A visitor asking about repayment is still entitled to know none of it is
    // real money, so this fact is not allowed to be selected away.
    for (const q of ["how does repayment work?", "tell me about the passport", "xyzzy"]) {
      expect(buildPrompt(q), q).toContain("not a licensed lender");
    }
  });

  it("sends the relevant facts rather than all of them", () => {
    const p = buildPrompt("how does repayment work?");
    expect(p).toContain("outstanding principal first");
    // Latency is the reason this function exists: the full set costs ~440
    // prompt tokens, which is over 20s on a CPU box before a word is written.
    expect(p.length).toBeLessThan(SYSTEM_PROMPT.length);
  });

  it("still grounds an open-ended question", () => {
    expect(buildPrompt("what is this?")).toContain("autonomous agents");
  });
});

describe("fact fallback", () => {
  it("answers the common questions with no model reachable", () => {
    expect(factFallback("how does repayment work?")).toContain("principal");
    expect(factFallback("what are the vault limits")).toContain("per-transaction");
    expect(factFallback("is this real money?")).toContain("test credits");
    expect(factFallback("what is credence")).toContain("autonomous agents");
  });

  it("returns null rather than guessing at something off-page", () => {
    expect(factFallback("qwertyuiop")).toBeNull();
    expect(factFallback("recommend a stock")).toBeNull();
  });
});
