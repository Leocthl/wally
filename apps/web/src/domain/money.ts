// Money is integer HKD minor units everywhere (CLAUDE.md code style). Formatting only happens at the edge.

const CENTS_PER_DOLLAR = 100;

export function assertMinor(minor: number): void {
  if (!Number.isSafeInteger(minor)) throw new RangeError(`money must be an integer number of minor units, got ${minor}`);
}

/** 25900 -> "HK$259", 54100 -> "HK$541", 123450 -> "HK$1,234.50". Cents show only when non-zero. */
export function formatHkd(minor: number): string {
  assertMinor(minor);
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const dollars = Math.trunc(abs / CENTS_PER_DOLLAR).toLocaleString("en-US");
  const cents = abs % CENTS_PER_DOLLAR;
  return `${sign}HK$${dollars}${cents === 0 ? "" : `.${String(cents).padStart(2, "0")}`}`;
}

const HKD_TEXT = /^(-)?HK\$(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?$/;

/** Inverse of formatHkd for user input and tests. Returns null when the text is not an amount. */
export function parseHkd(text: string): number | null {
  const m = HKD_TEXT.exec(text.trim());
  if (!m) return null;
  const [, neg, dollars, frac] = m;
  const cents = frac === undefined ? 0 : Number.parseInt(frac.padEnd(2, "0"), 10);
  const minor = Number.parseInt((dollars ?? "0").replaceAll(",", ""), 10) * CENTS_PER_DOLLAR + cents;
  return neg ? -minor : minor;
}

/**
 * Whole dollars to minor units for typed input (HK$ field in a rule chip). Null when not a non-negative number, and null when the
 * amount is too large to hold as an integer of minor units (a 16-digit paste): such text is not an amount, and the formatter
 * would refuse it.
 */
export function dollarsToMinor(input: string): number | null {
  const text = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [whole = "0", frac = ""] = text.split(".");
  const minor = Number.parseInt(whole, 10) * CENTS_PER_DOLLAR + Number.parseInt(frac.padEnd(2, "0") || "0", 10);
  return Number.isSafeInteger(minor) ? minor : null;
}

export function minorToDollarsText(minor: number): string {
  assertMinor(minor);
  const cents = minor % CENTS_PER_DOLLAR;
  const whole = Math.trunc(minor / CENTS_PER_DOLLAR);
  return cents === 0 ? String(whole) : `${whole}.${String(cents).padStart(2, "0")}`;
}
