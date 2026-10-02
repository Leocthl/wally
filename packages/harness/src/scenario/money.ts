// Integer minor-unit money. No floats: rates are decimal strings and the arithmetic runs on BigInt.

const RATE_PATTERN = /^[0-9]+(\.[0-9]+)?$/;

/** listed * rate, rounded half up, both exact. `rate` is a plain decimal string such as "7.50". */
export function convertMinor(listedMinor: number, rate: string): number {
  if (!Number.isInteger(listedMinor) || listedMinor < 0) throw new RangeError(`listed amount must be a non-negative integer, got ${listedMinor}`);
  if (!RATE_PATTERN.test(rate)) throw new RangeError(`rate must be a plain decimal string, got ${rate}`);
  const [whole = "0", fraction = ""] = rate.split(".");
  const scale = 10n ** BigInt(fraction.length);
  const product = BigInt(listedMinor) * BigInt(`${whole}${fraction}`);
  return Number((product * 2n + scale) / (2n * scale));
}

/** floor(amount * bp / 10000). */
export function percentOfBp(amountMinor: number, bp: number): number {
  if (!Number.isInteger(amountMinor) || !Number.isInteger(bp) || amountMinor < 0 || bp < 0) {
    throw new RangeError(`percentOfBp needs non-negative integers, got ${amountMinor}, ${bp}`);
  }
  return Number((BigInt(amountMinor) * BigInt(bp)) / 10_000n);
}

/** "HK$259" or "HK$259.50". Display text for listings and judge state only. */
export function formatHkd(minor: number): string {
  const whole = Math.floor(minor / 100);
  const cents = minor % 100;
  return cents === 0 ? `HK$${whole}` : `HK$${whole}.${String(cents).padStart(2, "0")}`;
}
