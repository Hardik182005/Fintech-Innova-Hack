import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NO_VALUE } from "@/lib/format";
import type { MetricEnvelope, MetricStatus } from "@/lib/types";

import { absenceReasonOf, EnvelopeValue, envelopeOk, formatMs, sampleNote } from "./envelope";

/**
 * The rule these pin, from the telemetry contract's §23: a metric envelope
 * whose status is not "ok" renders as its truthful absence reason and never,
 * in any form, as the digit 0. Zero is a claim about the business; a non-ok
 * envelope is the backend saying it has no claim to make.
 */

const envelope = (overrides: Partial<MetricEnvelope> = {}): MetricEnvelope => ({
  value: 42,
  unit: "count",
  sample_size: 10,
  status: "ok",
  ...overrides,
});

describe("EnvelopeValue with status ok", () => {
  it("renders a count value", () => {
    render(<EnvelopeValue envelope={envelope()} />);
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders a real zero as zero — a genuine figure is never hidden", () => {
    render(<EnvelopeValue envelope={envelope({ value: 0 })} />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("renders a ppm envelope as a percentage", () => {
    render(<EnvelopeValue envelope={envelope({ value: 875_000, unit: "ppm" })} />);
    expect(screen.getByText("87.5%")).toBeInTheDocument();
  });

  it("renders a minor-unit envelope as money", () => {
    render(<EnvelopeValue envelope={envelope({ value: 12_345_678, unit: "minor" })} />);
    expect(screen.getByText("₹1,23,456.78")).toBeInTheDocument();
  });

  it("renders an ms envelope as a duration", () => {
    render(<EnvelopeValue envelope={envelope({ value: 250, unit: "ms" })} />);
    expect(screen.getByText("250 ms")).toBeInTheDocument();
  });
});

describe("EnvelopeValue with a non-ok status", () => {
  const cases: { status: MetricStatus; reason: string; words: string }[] = [
    { status: "not_evaluated", reason: "not-evaluated", words: "Not evaluated" },
    { status: "not_connected", reason: "not-connected", words: "Not connected" },
    { status: "insufficient_sample", reason: "insufficient", words: "Insufficient sample" },
    { status: "unavailable", reason: "unavailable", words: "Not available" },
  ];

  for (const { status, reason, words } of cases) {
    it(`renders ${status} as "${words}" (${reason}) and never the text "0"`, () => {
      const { container } = render(
        <EnvelopeValue envelope={envelope({ value: null, status })} label />,
      );
      expect(screen.getByText(words)).toBeInTheDocument();
      const marker = container.querySelector('[data-slot="unavailable"]');
      expect(marker).not.toBeNull();
      expect(marker!.getAttribute("data-reason")).toBe(reason);
      expect(screen.queryByText("0")).toBeNull();
      expect(container.textContent).not.toMatch(/\b0\b/);
    });
  }

  it("renders a dash, not zero, when not asked for words", () => {
    const { container } = render(
      <EnvelopeValue envelope={envelope({ value: null, status: "not_evaluated" })} />,
    );
    expect(screen.getByText(NO_VALUE)).toBeInTheDocument();
    expect(screen.queryByText("0")).toBeNull();
    expect(container.textContent).not.toMatch(/\b0\b/);
  });

  it("supports custom absence words for headline positions", () => {
    render(
      <EnvelopeValue
        envelope={envelope({ value: null, status: "not_evaluated" })}
        absentText="Not enough evaluated cases"
      />,
    );
    expect(screen.getByText("Not enough evaluated cases")).toBeInTheDocument();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("treats a malformed ok envelope with a null value as unavailable, never 0", () => {
    const { container } = render(
      <EnvelopeValue envelope={envelope({ value: null, status: "ok" })} label />,
    );
    const marker = container.querySelector('[data-slot="unavailable"]');
    expect(marker).not.toBeNull();
    expect(marker!.getAttribute("data-reason")).toBe("unavailable");
    expect(screen.queryByText("0")).toBeNull();
  });

  it("treats a missing envelope as unavailable", () => {
    const { container } = render(<EnvelopeValue envelope={null} />);
    expect(screen.getByText(NO_VALUE)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\b0\b/);
  });
});

describe("helpers", () => {
  it("maps contract statuses onto the product's absence vocabulary", () => {
    expect(absenceReasonOf("not_evaluated")).toBe("not-evaluated");
    expect(absenceReasonOf("not_connected")).toBe("not-connected");
    expect(absenceReasonOf("insufficient_sample")).toBe("insufficient");
    expect(absenceReasonOf("unavailable")).toBe("unavailable");
  });

  it("accepts only a genuine ok envelope as renderable", () => {
    expect(envelopeOk(envelope())).toBe(true);
    expect(envelopeOk(envelope({ value: 0 }))).toBe(true);
    expect(envelopeOk(envelope({ value: null, status: "not_evaluated" }))).toBe(false);
    expect(envelopeOk(envelope({ value: null, status: "ok" }))).toBe(false);
    expect(envelopeOk(null)).toBe(false);
    expect(envelopeOk(undefined)).toBe(false);
  });

  it("formats durations by magnitude", () => {
    expect(formatMs(84)).toBe("84 ms");
    expect(formatMs(2_400)).toBe("2.4s");
    expect(formatMs(45_000)).toBe("45s");
    expect(formatMs(120_000)).toBe("2.0 min");
  });

  it("reports the honest denominator, or nothing", () => {
    expect(sampleNote(envelope({ sample_size: 42 }))).toBe("n = 42");
    expect(sampleNote(envelope({ sample_size: null }))).toBeNull();
    expect(sampleNote(null)).toBeNull();
  });
});
