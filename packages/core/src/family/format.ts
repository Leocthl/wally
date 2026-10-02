// Money in a sentence: integer HKD minor units as HK$1,000 or HK$1,000.50. Integer arithmetic only; no Intl, so the
// text is the same in Node and every browser.
const MINOR_PER_MAJOR = 100;

export function hkd(minor: number): string {
  const whole = Math.trunc(minor / MINOR_PER_MAJOR);
  const cents = Math.abs(minor % MINOR_PER_MAJOR);
  const grouped = String(Math.abs(whole)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sign = minor < 0 ? "-" : "";
  return `HK$${sign}${grouped}${cents === 0 ? "" : `.${String(cents).padStart(2, "0")}`}`;
}
