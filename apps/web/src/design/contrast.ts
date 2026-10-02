// WCAG 2.x relative luminance and contrast ratio for #RRGGBB colours (docs/04 Accessibility). Pure, shared by the
// design tests and the style guide's palette table.

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

const HEX6 = /^#[0-9a-f]{6}$/i;

export function isHex6(value: string): boolean {
  return HEX6.test(value.trim());
}

export function luminance(hex: string): number {
  if (!isHex6(hex)) throw new RangeError(`expected #RRGGBB, got ${hex}`);
  const n = Number.parseInt(hex.trim().slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG level for a ratio: AAA text 7, AA text 4.5, AA large text and UI 3. */
export function wcagLevel(ratio: number): "AAA" | "AA" | "AA large" | "fail" {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA large";
  return "fail";
}
