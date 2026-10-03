// What a garment drawing is made of, and the helpers its builders share. A builder turns a palette into fabric pieces
// (one filled, outlined polygon each, the body colour unless a piece says otherwise) and details drawn over the fabric and
// the pattern. The three builder files (tops, bottoms, shoes) only produce this shape.
import type { Palette } from "./garments-color";
import { clipBand, distance, innerPoly, lerp, mirrorPt, polyD, type Pt, type Vtx } from "./garments-geom";
import type { GarmentNode } from "./garments-node";
import { mirrorPath } from "./garments-path";

export interface Piece {
  readonly vs: readonly Vtx[];
  /** A fill other than the body colour. */
  readonly fill?: string;
  /** No pattern is cut from this piece (a sole). */
  readonly bare?: boolean;
}

export interface Built {
  readonly pieces: readonly Piece[];
  /** Details in paint order, drawn after the fabric and the pattern. */
  readonly over: readonly GarmentNode[];
  /** Centre of the chest print and of the logo mark. */
  readonly chest: Pt;
  readonly logo: Pt;
  /** Dots instead of a chest graphic when the item has no chest. */
  readonly allover: boolean;
  /** Which way stripes run; across the body unless a builder says down (trousers, jeans, shorts). */
  readonly stripes?: "horizontal" | "vertical";
}

export type Builder = (palette: Palette) => Built;

/** Path data for a shape on the left plus its mirror image on the right. */
export const both = (d: string): string => d + mirrorPath(d);

export const mirrorPoly = (points: readonly Pt[]): readonly Pt[] => points.map(mirrorPt);

/** A point as a vertex. */
export const vtx = (p: Pt, r: number): Vtx => [p[0], p[1], r];

/** The part of a piece's inner polygon between two heights: a rib or hem band that follows the soft corners. */
export const bandAcross = (vs: readonly Vtx[], y0: number, y1: number): string => polyD(clipBand(innerPoly(vs), 1, y0, y1));

/**
 * A band of width `w` across the end of a sleeve or leg. The quadrilateral a, b, c, d has its end edge a-b and long
 * sides a to d and b to c; the band runs `w` along each long side. The end corners keep the garment's own rounding.
 */
export function endBand(a: Pt, b: Pt, c: Pt, d: Pt, w: number, r: number): readonly Vtx[] {
  return [vtx(a, r), vtx(b, r), vtx(lerp(b, c, w / distance(b, c)), 0), vtx(lerp(a, d, w / distance(a, d)), 0)];
}
