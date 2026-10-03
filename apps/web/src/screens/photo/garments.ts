// Flat garment illustrations for the photo feature's shop cards, drawn as inline SVG. No retailer photos, no logos, no
// brand marks, no text. The item's first colour fills the body; collars, ribs, soles and pattern marks are computed from
// it (or take the second colour). Every outline is currentColor at low opacity, so the parent card sets `color` and the
// background and black, white and cream items stay visible on both light and dark cards.
//
// This file assembles; the shapes live in garments-tops / -bottoms / -shoes, colours in garments-color, pattern cutting in
// garments-pattern, geometry in garments-geom. garmentParts is the single source: garmentSvg serialises it and GarmentArt
// renders the same nodes as React elements.
import { isKind, isPattern, type Color, type Kind, type Pattern } from "@wally/agent/vision";
import { BOTTOMS } from "./garments-bottoms";
import type { Builder } from "./garments-build";
import { paletteFor } from "./garments-color";
import { boundsOf, innerPoly, roundedD, type Bounds } from "./garments-geom";
import { outlined, path, toMarkup, type GarmentNode } from "./garments-node";
import { patternNodes } from "./garments-pattern";
import { SHOES } from "./garments-shoes";
import { TOPS } from "./garments-tops";

export type { GarmentNode } from "./garments-node";

export const VIEW_BOX = "0 0 120 120";

export interface GarmentSpec {
  readonly kind: Kind;
  readonly colors: readonly Color[];
  readonly pattern: Pattern;
}

const BUILDERS: Readonly<Record<Kind, Builder>> = { ...TOPS, ...BOTTOMS, ...SHOES };

/**
 * The shapes of one garment, in paint order: the fabric, the pattern marks cut from it, then the details. An unknown kind
 * draws as a hanger, an unknown pattern as plain, no colour as grey: data that skipped the types still draws something.
 */
export function garmentParts(spec: GarmentSpec): readonly GarmentNode[] {
  const kind = isKind(spec.kind) ? spec.kind : "other";
  const pattern = isPattern(spec.pattern) ? spec.pattern : "plain";
  const palette = paletteFor(Array.isArray(spec.colors) ? spec.colors : [], pattern);
  const built = BUILDERS[kind](palette);
  const fabric = built.pieces.map((piece) => path(roundedD(piece.vs), piece.fill === undefined ? {} : { fill: piece.fill }));
  const marks = patternNodes({
    pattern,
    palette,
    regions: built.pieces.filter((piece) => piece.bare !== true).map((piece) => innerPoly(piece.vs)),
    chest: built.chest,
    logo: built.logo,
    allover: built.allover,
    stripes: built.stripes ?? "horizontal",
  });
  return [...(fabric.length === 0 ? [] : [outlined(fabric, palette.main)]), ...marks, ...built.over];
}

/** The box the fabric fills (every vertex of every piece), for layout checks; null for a drawing with no fabric. */
export function garmentBox(spec: GarmentSpec): Bounds | null {
  const kind = isKind(spec.kind) ? spec.kind : "other";
  const vertices = BUILDERS[kind](paletteFor([], "plain")).pieces.flatMap((piece) => piece.vs);
  return vertices.length === 0 ? null : boundsOf(vertices);
}

/**
 * Standalone SVG markup for the garment, viewBox "0 0 120 120". Self-contained: no ids, no url(), no style, no text, no
 * image, no external reference, no script. The size is left to the parent (CSS, or width and height on the element).
 */
export function garmentSvg(spec: GarmentSpec): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW_BOX}">${garmentParts(spec).map(toMarkup).join("")}</svg>`;
}
