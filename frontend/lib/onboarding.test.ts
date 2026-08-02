import { describe, expect, it, vi } from "vitest";

import { EVIDENCE_TEMPLATES, EVIDENCE_TYPES, runSteps, type StepState } from "./onboarding";

/**
 * The onboarding forms post four or five times per submission, and the whole
 * point of `runSteps` is that a failure halfway leaves a truthful account of
 * which rows exist. These tests are about that account, not about the happy
 * path.
 */

const collect = () => {
  const frames: StepState[][] = [];
  return { frames, onProgress: (states: StepState[]) => void frames.push(states) };
};

describe("runSteps", () => {
  it("runs in order and reports every step done", async () => {
    const order: string[] = [];
    const { frames, onProgress } = collect();

    const outcome = await runSteps(
      [
        {
          label: "one",
          run: async () => {
            order.push("one");
            return { task_id: "tsk_1" };
          },
        },
        {
          label: "two",
          run: async () => {
            order.push("two");
            return { vault_id: "vlt_2" };
          },
        },
      ],
      onProgress,
    );

    expect(outcome.ok).toBe(true);
    expect(order).toEqual(["one", "two"]);
    expect(frames.at(-1)?.map((s) => s.status)).toEqual(["done", "done"]);
  });

  it("shows the id each step returned, so a person can find the row", async () => {
    const { frames, onProgress } = collect();

    await runSteps(
      [{ label: "create", run: async () => ({ agent_id: "agt_42", status: "ACTIVE" }) }],
      onProgress,
    );

    expect(frames.at(-1)?.[0].detail).toBe("agt_42");
  });

  it("stops at the first failure and leaves earlier steps marked done", async () => {
    const third = vi.fn(async () => ({}));
    const { frames, onProgress } = collect();

    const outcome = await runSteps(
      [
        { label: "created the agent", run: async () => ({ agent_id: "agt_1" }) },
        {
          label: "issued the passport",
          run: async () => {
            throw new Error("Signing key unavailable");
          },
        },
        { label: "verified the passport", run: third },
      ],
      onProgress,
    );

    expect(outcome.ok).toBe(false);
    // The agent exists. Reporting the whole submission as failed would send
    // someone off to create a second one.
    expect(outcome.results).toEqual([{ agent_id: "agt_1" }]);
    expect(third).not.toHaveBeenCalled();

    const final = frames.at(-1);
    expect(final?.map((s) => s.status)).toEqual(["done", "failed", "pending"]);
    expect(final?.[1].error).toBe("Signing key unavailable");
  });

  it("carries a non-Error rejection through as a readable sentence", async () => {
    const { frames, onProgress } = collect();

    await runSteps([{ label: "post", run: async () => Promise.reject("boom") }], onProgress);

    expect(frames.at(-1)?.[0].error).toBe("That step did not complete.");
  });

  it("emits a frame before each step runs, so the running one is visible", async () => {
    const { frames, onProgress } = collect();

    await runSteps([{ label: "only", run: async () => ({}) }], onProgress);

    expect(frames[0][0].status).toBe("running");
    expect(frames.at(-1)?.[0].status).toBe("done");
  });
});

describe("evidence vocabulary", () => {
  it("offers a template for every type it lists", () => {
    for (const type of EVIDENCE_TYPES) {
      expect(EVIDENCE_TEMPLATES[type.value], type.value).toBeTypeOf("string");
      expect(EVIDENCE_TEMPLATES[type.value].length).toBeGreaterThan(0);
    }
  });

  it("ships no template carrying a real-looking identifier", () => {
    // The forms redact on the server, but a template that seeded a PAN or a
    // phone number would be teaching the wrong habit before redaction ever
    // ran. These are the same shapes `credence/services/redaction.py` strips.
    const identifier =
      /\b[A-Z]{5}\d{4}[A-Z]\b|\b\d{4}\s?\d{4}\s?\d{4}\b|\b[A-Z]{4}0[A-Z0-9]{6}\b|@|\b[6-9]\d{9}\b/;
    for (const [type, text] of Object.entries(EVIDENCE_TEMPLATES)) {
      expect(text, type).not.toMatch(identifier);
    }
  });
});
