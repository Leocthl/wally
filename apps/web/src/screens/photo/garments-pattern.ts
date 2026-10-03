// Pattern marks for a garment: stripes, check, a chest print, a small logo mark, or an all-over dot print. Stripes and
// check are cut from the fabric polygons, dots are placed only where the whole dot fits, and the chest marks sit inside
// the body, so nothing needs clipping and the markup carries no ids.
import type { Pattern } from "@wally/agent/vision";
import type { Palette } from "./garments-color";
import { boundsOf, clipBand, insideBy, polyD, type Bounds, type Pt } from "./garments-geom";
import { disc, el, line, path, type GarmentNode } from "./garments-node";

const STRIPE_STEP = 12;
const STRIPE_WIDTH = 5;
const CHECK_STEP = 15;
const CHECK_WIDTH = 5.5;
const CHECK_OPACITY = ".4";
const DOT_STEP = 13;
const DOT_ROW = 11.5;
const DOT_SIZE = 4.2;
const LOGO_RADIUS = 3.6;

export interface PatternInput {
  readonly pattern: Pattern;
  readonly palette: Palette;
  /** The patterned fabric, one inner polygon per piece. */
  readonly regions: readonly (readonly Pt[])[];
  /** Centre of the chest print and of the logo mark. */
  readonly chest: Pt;
  readonly logo: Pt;
  /** Garments with no chest (trousers, skirts, shoes) take a dot print where tops take a chest graphic. */
  readonly allover: boolean;
  /** Stripes run across the garment, or down it (pinstripes on trousers). */
  readonly stripes: "horizontal" | "vertical";
}

type Span = readonly [number, number];
type Regions = readonly (readonly Pt[])[];

/** Equal cells between lo and hi, one band of the given width centred in each. */
function bands(lo: number, hi: number, step: number, width: number): readonly Span[] {
  const count = Math.max(1, Math.round((hi - lo) / step));
  const cell = (hi - lo) / count;
  return Array.from({ length: count }, (_, i): Span => [lo + cell * (i + 0.5) - width / 2, lo + cell * (i + 0.5) + width / 2]);
}

const slices = (regions: Regions, axis: 0 | 1, spans: readonly Span[]): string =>
  regions.flatMap((region) => spans.map(([lo, hi]) => polyD(clipBand(region, axis, lo, hi)))).join("");

const filled = (d: string, fill: string, fillOpacity?: string): readonly GarmentNode[] =>
  d === "" ? [] : [path(d, fillOpacity === undefined ? { fill } : { fill, fillOpacity })];

/** Staggered rows of round dots, each placed only where the whole dot lies inside the fabric. */
function dots(regions: Regions, box: Bounds, color: string): readonly GarmentNode[] {
  const rows = Math.floor((box.y1 - box.y0) / DOT_ROW) + 1;
  const cols = Math.ceil((box.x1 - box.x0) / DOT_STEP) + 1;
  const grid = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (__, col): Pt => [box.x0 + (row % 2 === 0 ? 0 : DOT_STEP / 2) + col * DOT_STEP, box.y0 + DOT_ROW * 0.6 + row * DOT_ROW]),
  );
  const kept = grid.flat().filter((p) => regions.some((region) => insideBy(region, p, DOT_SIZE / 2 + 0.9)));
  if (kept.length === 0) return [];
  const d = kept.map(([x, y]) => `M${x} ${y}H${x + 0.1}`).join("");
  return [path(d, { fill: "none", stroke: color, strokeWidth: DOT_SIZE, strokeLinecap: "round" })];
}

/** A small graphic block, a sun over two waves on a rounded rectangle: reads as a print and carries no lettering. */
function chestPrint([cx, cy]: Pt, palette: Palette): readonly GarmentNode[] {
  const wave = (y: number): string =>
    `M${cx - 9} ${y}Q${cx - 6.75} ${y - 3} ${cx - 4.5} ${y}Q${cx - 2.25} ${y + 3} ${cx} ${y}Q${cx + 2.25} ${y - 3} ${cx + 4.5} ${y}Q${cx + 6.75} ${y + 3} ${cx + 9} ${y}`;
  return [
    el("rect", { x: cx - 13, y: cy - 11, width: 26, height: 22, rx: 4, fill: palette.accent }),
    disc(cx, cy - 4.6, 4.2, palette.mark),
    line(wave(cy + 3.6) + wave(cy + 7.6), palette.mark, 1.6),
  ];
}

/** The marks for one item, drawn over the fabric. Nothing for a plain item. */
export function patternNodes({ pattern, palette, regions, chest, logo, allover, stripes }: PatternInput): readonly GarmentNode[] {
  if (pattern === "plain" || regions.length === 0) return [];
  const box = boundsOf(regions.flat());
  switch (pattern) {
    case "stripes":
      return stripes === "vertical"
        ? filled(slices(regions, 0, bands(box.x0, box.x1, STRIPE_STEP, STRIPE_WIDTH)), palette.accent)
        : filled(slices(regions, 1, bands(box.y0, box.y1, STRIPE_STEP, STRIPE_WIDTH)), palette.accent);
    case "check":
      return [
        ...filled(slices(regions, 1, bands(box.y0, box.y1, CHECK_STEP, CHECK_WIDTH)), palette.accent, CHECK_OPACITY),
        ...filled(slices(regions, 0, bands(box.x0, box.x1, CHECK_STEP, CHECK_WIDTH)), palette.accent, CHECK_OPACITY),
      ];
    case "print":
      return allover ? dots(regions, box, palette.accent) : chestPrint(chest, palette);
    case "logo":
      return [disc(logo[0], logo[1], LOGO_RADIUS, palette.badge)];
  }
}
