// Socks, drawn side on with the toe to the right like the shoes: one soft-cornered polygon for the whole sock (a leg tube
// and a plump foot), then a ribbed cuff, a heel patch and a toe patch over it. No sole and no laces, so it cannot be
// taken for a boot. The cuff and both patches take the trim colour (the second colour, else a shade of the body).
import { detail, type Palette } from "./garments-color";
import type { Builder, Built } from "./garments-build";
import { clipBand, clipLine, polyD, roundedD, type Pt, type Vtx } from "./garments-geom";
import { path, strokes, type GarmentNode } from "./garments-node";
import { parsePath } from "./garments-path";

const flat = (d: string, fill: string): GarmentNode => path(d, { fill });

/** A rib texture: a dashed stroke whose dashes read as thin vertical ticks across a band. */
const RIB = { strokeDasharray: "1.1 2.5", strokeLinecap: "butt" } as const;

const CUFF_TOP = 12;
const CUFF_BOTTOM = 23;
/** Cuff top left and right, the ankle (an inward corner), toe top and bottom, heel. */
const BODY: readonly Vtx[] = [[24, CUFF_TOP, 3.5], [56, CUFF_TOP, 3.5], [56, 62, 9], [106, 80, 13], [106, 108, 13], [16, 108, 20]];

/**
 * A rounded corner is followed in about CHORD_RATE * sqrt(reach) chords (reach: how far its curve starts from the vertex):
 * a 20 unit corner in 15, a 3.5 unit one in 6. That keeps a chord within 0.03 units of the curve, and long enough that
 * clipBand and clipLine do not take a run of chords for a straight line.
 */
const CHORD_RATE = 3.2;
/** How many sides the oval regions that cut the patches have. */
const OVAL_SIDES = 64;

const quadAt = (a: Pt, c: Pt, b: Pt, t: number): Pt => [
  (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t ** 2 * b[0],
  (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t ** 2 * b[1],
];

/** The drawn outline as a polygon, each rounded corner followed in fine chords, so a patch cut from it meets the outline. */
function outline(vs: readonly Vtx[]): readonly Pt[] {
  const walked = parsePath(roundedD(vs)).reduce<{ readonly at: Pt; readonly points: readonly Pt[] }>(
    (state, { cmd, args }) => {
      const [x = 0, y = 0, x2 = 0, y2 = 0] = args;
      if (cmd === "M" || cmd === "L") return { at: [x, y], points: [...state.points, [x, y]] };
      if (cmd !== "Q") return state;
      const chords = Math.ceil(CHORD_RATE * Math.sqrt(Math.hypot(x - state.at[0], y - state.at[1])));
      const curve = Array.from({ length: chords }, (_, i): Pt => quadAt(state.at, [x, y], [x2, y2], (i + 1) / chords));
      return { at: [x2, y2], points: [...state.points, ...curve] };
    },
    { at: [0, 0], points: [] },
  );
  return walked.points;
}

/** An ellipse as a polygon, clockwise on screen: a rounded region to cut a patch out of the sock. */
const oval = (cx: number, cy: number, rx: number, ry: number): readonly Pt[] =>
  Array.from({ length: OVAL_SIDES }, (_, i): Pt => {
    const turn = (i / OVAL_SIDES) * 2 * Math.PI;
    return [cx + rx * Math.cos(turn), cy + ry * Math.sin(turn)];
  });

/** The part of a polygon inside a convex region listed clockwise on screen: one cut per edge, each keeping its right-hand side. */
const within = (poly: readonly Pt[], region: readonly Pt[]): string =>
  polyD(region.reduce<readonly Pt[]>((rest, from, i) => clipLine(rest, from, region[(i + 1) % region.length] ?? from), poly));

const SILHOUETTE = outline(BODY);
const CUFF = polyD(clipBand(SILHOUETTE, 1, CUFF_TOP, CUFF_BOTTOM));
const HEEL = within(SILHOUETTE, oval(16, 108, 26, 30));
const TOE = within(SILHOUETTE, oval(108, 90, 23, 28));
/** Rib ticks in the middle of the cuff, clear of its top and of the seam below it. */
const RIB_Y = (CUFF_TOP + CUFF_BOTTOM) / 2;
const RIB_HEIGHT = CUFF_BOTTOM - CUFF_TOP - 4;

export const socks: Builder = (p: Palette): Built => {
  const rib = detail(p.trim, 0.2);
  return {
    pieces: [{ vs: BODY }],
    over: [
      flat(CUFF, p.trim),
      flat(HEEL, p.trim),
      flat(TOE, p.trim),
      strokes([
        [`M24.9 ${RIB_Y}H54.8`, rib, RIB_HEIGHT, RIB],
        [`M24.3 ${CUFF_BOTTOM}H54.9`, rib],
      ]),
    ],
    chest: [39, 42],
    logo: [39, 42],
    allover: true,
    // bands across the leg, the way a sock is knitted
    stripes: "horizontal",
  };
};

export const SOCKS = { socks } as const;
