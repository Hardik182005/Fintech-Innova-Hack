import { describe, expect, it } from "vitest";

import {
  NO_VALUE,
  money,
  moneyCompact,
  percent,
  percentOf,
  relativeTime,
  shortId,
} from "./format";

/**
 * The rule these pin: an absent value is never rendered as zero. Zero is a
 * financial statement — "nothing was repaid" — and displaying it where the
 * backend said "no data" would put a false claim on a credit dashboard.
 */

describe("absent is not zero", () => {
  it("renders a missing amount as a dash, not ₹0.00", () => {
    expect(money(null)).toBe(NO_VALUE);
    expect(money(undefined)).toBe(NO_VALUE);
    expect(money(0)).toBe("₹0.00"); // a real zero still reads as zero
  });

  it("renders a missing rate as a dash, not 0.0%", () => {
    expect(percent(null)).toBe(NO_VALUE);
    expect(percent(0)).toBe("0.0%");
  });

  it("treats a rate with no denominator as unavailable", () => {
    // No vault has reached a terminal state yet, so there is no repayment rate
    // to report — not a 0% one.
    expect(percentOf(0, 0)).toBe(NO_VALUE);
    expect(percentOf(3, 4)).toBe("75.0%");
  });

  it("renders a missing timestamp as a dash", () => {
    expect(relativeTime(null)).toBe(NO_VALUE);
    expect(relativeTime("not-a-date")).toBe(NO_VALUE);
  });
});

describe("money", () => {
  it("divides minor units exactly once, at the edge", () => {
    expect(money(1)).toBe("₹0.01");
    expect(money(12_345_678)).toBe("₹1,23,456.78");
  });

  it("groups in the Indian system, because the currency is rupees", () => {
    expect(money(1_00_00_000_00)).toBe("₹1,00,00,000.00");
  });

  it("compacts headline figures into lakhs and crores", () => {
    expect(moneyCompact(50_00_000)).toBe("₹50.0K"); // ₹50,000
    expect(moneyCompact(1_50_00_000)).toBe("₹1.50L"); // ₹1,50,000
    expect(moneyCompact(5_00_00_00_000)).toBe("₹5.00Cr"); // ₹5,00,00,000
    expect(moneyCompact(null)).toBe(NO_VALUE);
  });

  it("keeps a negative amount signed", () => {
    expect(moneyCompact(-1_50_00_000)).toBe("-₹1.50L");
  });
});

describe("percent", () => {
  it("reads parts per million as a percentage", () => {
    expect(percent(1_000_000)).toBe("100.0%");
    expect(percent(875_000)).toBe("87.5%");
    expect(percent(2_500, 2)).toBe("0.25%");
  });
});

describe("shortId", () => {
  it("keeps both ends so two ids never collapse to the same label", () => {
    expect(shortId("agt_a926f2523a5943b5b7d4")).toBe("agt_a926f2…b7d4");
    expect(shortId("short")).toBe("short");
    expect(shortId(null)).toBe(NO_VALUE);
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-08-01T12:00:00Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it("counts up through the units", () => {
    expect(relativeTime(ago(5_000), now)).toBe("just now");
    expect(relativeTime(ago(45_000), now)).toBe("45s ago");
    expect(relativeTime(ago(5 * 60_000), now)).toBe("5 min ago");
    expect(relativeTime(ago(3 * 3_600_000), now)).toBe("3h ago");
    expect(relativeTime(ago(2 * 86_400_000), now)).toBe("2d ago");
  });

  it("falls back to an absolute date once relative stops being useful", () => {
    expect(relativeTime(ago(30 * 86_400_000), now)).toMatch(/\d{2} \w{3} \d{4}/);
  });
});
