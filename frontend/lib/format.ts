import type { Money, Ppm, Timestamp } from "./types";

/**
 * Presentation of financial values.
 *
 * Two rules run through this file.
 *
 * One: money arrives as integer minor units and is divided exactly once, here,
 * on the way to the screen. Nothing upstream of this file does arithmetic on a
 * rupee value, so a rounding error has nowhere to enter.
 *
 * Two: absent is not zero. A rate with no denominator, a limit never set, a
 * chain never verified — each is unknown, and rendering "0" or "0%" would state
 * something false about the business. Every formatter takes `null | undefined`
 * and returns a dash the reader can recognise as "no value", never a figure.
 */

/** What the UI shows where a number does not exist. Never a zero. */
export const NO_VALUE = "—";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inrWhole = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const counts = new Intl.NumberFormat("en-IN");

/** Full precision: ₹1,20,000.00. Use anywhere an exact amount matters. */
export function money(minor: Money | null | undefined): string {
  if (minor === null || minor === undefined || !Number.isFinite(minor)) return NO_VALUE;
  return inr.format(minor / 100);
}

/** Rounded to the rupee, for headline figures where paise are noise. */
export function moneyShort(minor: Money | null | undefined): string {
  if (minor === null || minor === undefined || !Number.isFinite(minor)) return NO_VALUE;
  return inrWhole.format(Math.round(minor / 100));
}

/**
 * The plain rupee string a person edits in a form field: no symbol and no
 * grouping separators, because neither can be typed back reliably.
 *
 * This and `rupeeInputToMinor` are the only conversions that run toward minor
 * units rather than away from them. They live in this file so that the whole
 * paise/rupee boundary — both directions — stays in one place.
 */
export function rupeeInputValue(minor: Money | null | undefined): string {
  if (minor === null || minor === undefined || !Number.isFinite(minor)) return "";
  return String(minor / 100);
}

/** Parse an edited rupee string back to integer minor units. Null if unusable. */
export function rupeeInputToMinor(text: string): Money | null {
  const parsed = Number.parseFloat(text);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100);
}

/**
 * Compact headline form: ₹1.2L, ₹3.4Cr. Indian units, because the figures are
 * rupees and a reader here counts in lakhs, not millions.
 */
export function moneyCompact(minor: Money | null | undefined): string {
  if (minor === null || minor === undefined || !Number.isFinite(minor)) return NO_VALUE;
  const rupees = minor / 100;
  const sign = rupees < 0 ? "-" : "";
  const n = Math.abs(rupees);
  if (n >= 1_00_00_000) return `${sign}₹${(n / 1_00_00_000).toFixed(2)}Cr`;
  if (n >= 1_00_000) return `${sign}₹${(n / 1_00_000).toFixed(2)}L`;
  if (n >= 1_000) return `${sign}₹${(n / 1_000).toFixed(1)}K`;
  return `${sign}₹${n.toFixed(0)}`;
}

export function count(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_VALUE;
  return counts.format(value);
}

/** Parts per million to a percentage. 1_000_000 ppm == 100%. */
export function percent(ppm: Ppm | null | undefined, digits = 1): string {
  if (ppm === null || ppm === undefined || !Number.isFinite(ppm)) return NO_VALUE;
  return `${(ppm / 10_000).toFixed(digits)}%`;
}

/** Percentage from a plain ratio already in 0..1. */
export function percentOf(
  numerator: number | null | undefined,
  denominator: number | null | undefined,
  digits = 1,
): string {
  if (
    numerator === null ||
    numerator === undefined ||
    denominator === null ||
    denominator === undefined ||
    denominator === 0
  ) {
    // No denominator means the rate is undefined, not 0%.
    return NO_VALUE;
  }
  return `${((numerator / denominator) * 100).toFixed(digits)}%`;
}

/** Basis points, for fee rates where a percentage would read as 0.0%. */
export function ppmToBps(ppm: Ppm | null | undefined): string {
  if (ppm === null || ppm === undefined || !Number.isFinite(ppm)) return NO_VALUE;
  return `${(ppm / 100).toFixed(0)} bps`;
}

// ------------------------------------------------------------------- time --

const dateTime = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateOnly = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const timeOnly = new Intl.DateTimeFormat("en-IN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function dateTimeOf(iso: Timestamp | null | undefined): string {
  if (!iso) return NO_VALUE;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? NO_VALUE : dateTime.format(d);
}

export function dateOf(iso: Timestamp | null | undefined): string {
  if (!iso) return NO_VALUE;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? NO_VALUE : dateOnly.format(d);
}

export function timeOf(iso: Timestamp | null | undefined): string {
  if (!iso) return NO_VALUE;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? NO_VALUE : timeOnly.format(d);
}

/** "4 min ago". Falls back to an absolute date once it stops being useful. */
export function relativeTime(iso: Timestamp | null | undefined, now = Date.now()): string {
  if (!iso) return NO_VALUE;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return NO_VALUE;
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 0) return dateTimeOf(iso);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return dateOf(iso);
}

export function durationHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return NO_VALUE;
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest === 0 ? `${days}d` : `${days}d ${rest}h`;
}

// -------------------------------------------------------------- identifiers --

/**
 * Shorten an id or hash for a dense table while keeping both ends, so two
 * different values never look alike. The full value belongs in a tooltip or a
 * copy action, never truncated silently in a place a reader might trust it.
 */
export function shortId(value: string | null | undefined, head = 10, tail = 4): string {
  if (!value) return NO_VALUE;
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function shortHash(value: string | null | undefined): string {
  if (!value) return NO_VALUE;
  return value.length <= 16 ? value : `${value.slice(0, 8)}…${value.slice(-6)}`;
}

/**
 * Turn a backend SCREAMING_SNAKE code into a sentence. Used only where the
 * backend has not supplied a human label; a real label always wins, because the
 * UI must not invent business wording.
 */
export function humanise(code: string | null | undefined): string {
  if (!code) return NO_VALUE;
  const spaced = code.replace(/[_-]+/g, " ").toLowerCase().trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function pluralise(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}
