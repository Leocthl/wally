// Integer minor-unit money for the generator and display text. No floats.

/** "HK$259" or "HK$259.50". Display text for listings and judge state only. */
export function formatHkd(minor: number): string {
  const whole = Math.floor(minor / 100);
  const cents = minor % 100;
  return cents === 0 ? `HK$${whole}` : `HK$${whole}.${String(cents).padStart(2, "0")}`;
}
