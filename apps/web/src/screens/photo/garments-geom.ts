// Geometry for the garment drawings. A silhouette is a polygon of vertices with a rounding distance each; the same polygon
// gives the soft-cornered shape that is drawn and a slightly smaller "inner" polygon that stripes, check lines and dots
// are cut from, so a pattern never leaves the fabric and no clip path or id is needed.

export type Pt = readonly [x: number, y: number];
/** x, y and how far from the corner the rounding starts (0 keeps the corner sharp). */
export type Vtx = readonly [x: number, y: number, r: number];
type Xy = readonly [number, number, ...number[]];

/** Drawings are 120 wide and mirror across x = 60. */
const MIRROR = 120;

export const mirrorPt = ([x, y]: Pt): Pt => [MIRROR - x, y];
export const mirrorVtx = ([x, y, r]: Vtx): Vtx => [MIRROR - x, y, r];
export const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const distance = (a: Pt, b: Pt): number => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** The left half of a symmetric outline, listed top to bottom, becomes the whole outline. */
export function sym(left: readonly Vtx[]): readonly Vtx[] {
  return dedupe([...left, ...[...left].reverse().map(mirrorVtx)]);
}

const samePoint = (a: Xy, b: Xy): boolean => Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01;

/** Drops any vertex equal to the one before it (cyclically): a mirrored shape meets itself on the axis. */
export function dedupe<T extends Xy>(vs: readonly T[]): readonly T[] {
  return vs.filter((v, i) => {
    const prev = vs[(i + vs.length - 1) % vs.length];
    return vs.length < 2 || prev === undefined || !samePoint(prev, v);
  });
}

export function signedArea(points: readonly Xy[]): number {
  return (
    points.reduce((sum, a, i) => {
      const b = points[(i + 1) % points.length] ?? a;
      return sum + a[0] * b[1] - b[0] * a[1];
    }, 0) / 2
  );
}

interface Fillet {
  readonly a: Pt;
  readonly v: Pt;
  readonly b: Pt;
  readonly round: boolean;
  readonly convex: boolean;
  /** How far from the corner the rounding starts. */
  readonly reach: number;
}

/** Per vertex: where the rounding starts and ends, and whether the corner points outward. */
function fillets(vs: readonly Vtx[]): readonly Fillet[] {
  const total = signedArea(vs);
  return vs.map(([x, y, r], i): Fillet => {
    const [px, py] = vs[(i + vs.length - 1) % vs.length] ?? [x, y, 0];
    const [nx, ny] = vs[(i + 1) % vs.length] ?? [x, y, 0];
    const before = Math.hypot(px - x, py - y);
    const after = Math.hypot(nx - x, ny - y);
    const convex = ((x - px) * (ny - y) - (y - py) * (nx - x)) * total > 0;
    const reach = Math.min(r, before / 2, after / 2);
    if (r <= 0 || reach < 0.05) return { a: [x, y], v: [x, y], b: [x, y], round: false, convex, reach: 0 };
    return {
      a: [x + ((px - x) * reach) / before, y + ((py - y) * reach) / before],
      v: [x, y],
      b: [x + ((nx - x) * reach) / after, y + ((ny - y) * reach) / after],
      round: true,
      convex,
      reach,
    };
  });
}

const r3 = (value: number): number => Math.round(value * 1000) / 1000;
const xy = ([x, y]: Pt): string => `${r3(x)} ${r3(y)}`;

/** Closed path data with every rounded corner drawn as a quadratic curve through the corner. */
export function roundedD(vs: readonly Vtx[]): string {
  const corners = fillets(vs);
  const [first] = corners;
  if (first === undefined) return "";
  const rest = corners.map((f, i) => (i === 0 ? "" : `L${xy(f.a)}`) + (f.round ? `Q${xy(f.v)} ${xy(f.b)}` : "")).join("");
  return `M${xy(first.a)}${rest}Z`;
}

/** A point on the quadratic curve from a to b with control point v. */
const curveAt = (a: Pt, v: Pt, b: Pt, t: number): Pt => [
  (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * v[0] + t ** 2 * b[0],
  (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * v[1] + t ** 2 * b[1],
];

/** A rounding wider than this many units is followed in four chords instead of one. */
const WIDE_CORNER = 3;

/**
 * The same outline cut a little inside: a rounded outward corner becomes chords along its curve, a rounded inward corner
 * stays sharp. Both lie inside the drawn (rounded) shape, so anything cut from this polygon stays on the fabric.
 */
export function innerPoly(vs: readonly Vtx[]): readonly Pt[] {
  return fillets(vs).flatMap((f): readonly Pt[] => {
    if (!f.round || !f.convex) return [f.v];
    const chords = f.reach > WIDE_CORNER ? 4 : 1;
    return Array.from({ length: chords + 1 }, (_, i) => curveAt(f.a, f.v, f.b, i / chords));
  });
}

/** Closed polygon path data. */
export function polyD(points: readonly Pt[]): string {
  return points.length < 3 ? "" : `M${points.map(xy).join("L")}Z`;
}

/** Open polyline path data. */
export function lineD(points: readonly Pt[]): string {
  return points.length < 2 ? "" : `M${points.map(xy).join("L")}`;
}

/** Drops repeated points and points on a straight run, which clipping leaves behind. */
export function tidy(points: readonly Pt[]): readonly Pt[] {
  const unique = dedupe(points);
  return unique.filter((p, i) => {
    const prev = unique[(i + unique.length - 1) % unique.length];
    const next = unique[(i + 1) % unique.length];
    if (prev === undefined || next === undefined) return true;
    const cross = (p[0] - prev[0]) * (next[1] - p[1]) - (p[1] - prev[1]) * (next[0] - p[0]);
    const dot = (p[0] - prev[0]) * (next[0] - p[0]) + (p[1] - prev[1]) * (next[1] - p[1]);
    return !(Math.abs(cross) < 0.05 && dot > 0);
  });
}

type Axis = 0 | 1;

/** Keeps the part of a polygon where `side` is zero or more; edges that cross are cut where `side` is zero. */
function clipBy(poly: readonly Pt[], side: (p: Pt) => number): readonly Pt[] {
  return poly.flatMap((cur, i): readonly Pt[] => {
    const prev = poly[(i + poly.length - 1) % poly.length] ?? cur;
    const now = side(cur);
    const before = side(prev);
    const cut = (): Pt => {
      const t = before / (before - now);
      return [prev[0] + t * (cur[0] - prev[0]), prev[1] + t * (cur[1] - prev[1])];
    };
    if (now >= 0) return before >= 0 ? [cur] : [cut(), cur];
    return before >= 0 ? [cut()] : [];
  });
}

/** A clipped piece worth drawing: three points or more and some area. */
const worth = (piece: readonly Pt[]): readonly Pt[] => (piece.length < 3 || Math.abs(signedArea(piece)) < 0.4 ? [] : piece);

/**
 * The part of a polygon between two lines (axis 1: y from lo to hi; axis 0: x from lo to hi), by Sutherland-Hodgman.
 * A polygon that the band cuts in two comes back as one outline joined along the band edge by zero-width runs, which
 * paint nothing. Too small a piece comes back empty.
 */
export function clipBand(poly: readonly Pt[], axis: Axis, lo: number, hi: number): readonly Pt[] {
  return worth(tidy(clipBy(clipBy(poly, (p) => p[axis] - lo), (p) => hi - p[axis])));
}

/**
 * The part of a polygon on the right-hand side of a traveller going from a to b. The screen's y axis points down, so a line
 * drawn upward keeps the right of the screen and a line drawn downward keeps the left.
 */
export function clipLine(poly: readonly Pt[], a: Pt, b: Pt): readonly Pt[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return worth(tidy(clipBy(poly, (p) => dx * (p[1] - a[1]) - dy * (p[0] - a[0]))));
}

export interface Bounds {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export function boundsOf(points: readonly Xy[]): Bounds {
  return {
    x0: Math.min(...points.map((p) => p[0])),
    y0: Math.min(...points.map((p) => p[1])),
    x1: Math.max(...points.map((p) => p[0])),
    y1: Math.max(...points.map((p) => p[1])),
  };
}

function distanceToSegment([px, py]: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.min(1, Math.max(0, ((px - a[0]) * dx + (py - a[1]) * dy) / length2));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

/** Whether a point is inside a polygon and at least `margin` away from every edge. */
export function insideBy(poly: readonly Pt[], point: Pt, margin: number): boolean {
  const crossings = poly.reduce((count, a, i) => {
    const b = poly[(i + 1) % poly.length] ?? a;
    const straddles = a[1] > point[1] !== (b[1] > point[1]);
    return straddles && point[0] < a[0] + ((point[1] - a[1]) / (b[1] - a[1])) * (b[0] - a[0]) ? count + 1 : count;
  }, 0);
  return crossings % 2 === 1 && poly.every((a, i) => distanceToSegment(point, a, poly[(i + 1) % poly.length] ?? a) >= margin);
}

/** Plain points as vertices with one rounding distance. */
export const withRadius = (points: readonly Pt[], r: number): readonly Vtx[] => points.map(([x, y]): Vtx => [x, y, r]);
