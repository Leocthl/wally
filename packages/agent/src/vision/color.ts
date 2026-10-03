// Colour science for the photo feature, kept small and exact: sRGB to CIELAB (D65), the distance between two Lab
// colours (CIE76, a straight line in Lab), and the 17 colour words with hex anchors. A pixel is named by its nearest
// anchor; two named colours are compared by the distance between their swatches. No model, no randomness.
import { COLORS, type Color } from "./vocab";

export type Rgb = readonly [number, number, number];
export type Lab = readonly [number, number, number];

const linear = (channel: number): number => {
  const v = Math.min(255, Math.max(0, channel)) / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

const lab = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);

/** sRGB (0 to 255 per channel) to CIELAB under D65. */
export function rgbToLab([r, g, b]: Rgb): Lab {
  const [lr, lg, lb] = [linear(r), linear(g), linear(b)];
  const fx = lab((0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / 0.95047);
  const fy = lab(0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb);
  const fz = lab((0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76: the straight-line distance between two Lab colours. About 2.3 is the smallest difference an eye notices. */
export const deltaE = (a: Lab, b: Lab): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * Several sRGB anchors per colour word, so a pale mint and a deep green are both "green" and a charcoal is "grey" while
 * a true black stays "black". The first anchor of each word is its swatch: the colour drawn in the shop illustrations and
 * the palette dots, and the point two words are compared at.
 */
export const COLOR_ANCHORS: Readonly<Record<Color, readonly string[]>> = {
  black: ["#222326", "#141416", "#2e2e32"],
  white: ["#f5f5f2", "#ffffff", "#ebebe8"],
  grey: ["#9a9aa0", "#6f6f76", "#c5c5ca", "#4a4a50"],
  navy: ["#1f2f55", "#18233f", "#2a3a63", "#3a4a73"],
  blue: ["#2f66c0", "#4b78b0", "#1f4ea0", "#6a8fcf", "#4e7c9c"],
  light_blue: ["#aacdee", "#c6dcf2", "#8fb6dd", "#9fbcc8"],
  green: ["#2f8f5b", "#1f6b43", "#59a86f", "#a9d3a5", "#1d4a34", "#254d3a"],
  olive: ["#7a7a35", "#5f5f2a", "#8a8450", "#6b6a49"],
  red: ["#c8382c", "#a62a2a", "#7e1f2e", "#df4a3c"],
  orange: ["#ee7d1f", "#d96a12", "#f39a4a"],
  yellow: ["#efc93a", "#f4dc6a", "#d1a82a"],
  pink: ["#f4b3c4", "#e98aa5", "#f8cdd8"],
  purple: ["#7e55a8", "#5b3f8c", "#a78bcc"],
  brown: ["#7d5532", "#5a3a22", "#a0714a", "#8a5a35"],
  beige: ["#d9c4a0", "#cbb48c", "#e3d6b8", "#c3a77a"],
  cream: ["#f4ecd6", "#efe6cc", "#f8f2e4"],
  denim: ["#46678f", "#3a5880", "#6788b0"],
};

export const colorSwatch = (color: Color): string => COLOR_ANCHORS[color][0] ?? "#888888";

const ANCHOR_LABS: readonly (readonly [Color, readonly Lab[]])[] = COLORS.map((color) => [color, COLOR_ANCHORS[color].map((hex) => rgbToLab(hexToRgb(hex)))] as const);
const SWATCH_LABS: Readonly<Record<Color, Lab>> = Object.fromEntries(ANCHOR_LABS.map(([color, labs]) => [color, labs[0] as Lab])) as Record<Color, Lab>;

export const swatchLab = (color: Color): Lab => SWATCH_LABS[color];

/** The colour word whose nearest anchor is closest to this Lab colour, and how far that anchor is. Ties go to the earlier word. */
export function nearestColor(point: Lab): { readonly color: Color; readonly distance: number } {
  let best: { readonly color: Color; readonly distance: number } = { color: COLORS[0], distance: Number.POSITIVE_INFINITY };
  for (const [color, labs] of ANCHOR_LABS) {
    for (const anchor of labs) {
      const distance = deltaE(point, anchor);
      if (distance < best.distance) best = { color, distance };
    }
  }
  return best;
}

/** Distance between two colour words, swatch to swatch, in Lab. 0 for the same word. */
export const colorDistance = (a: Color, b: Color): number => (a === b ? 0 : deltaE(swatchLab(a), swatchLab(b)));
