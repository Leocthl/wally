// Shoes and the fallback shapes. Sneakers and boots are drawn side on, toe to the right: an upper (patterned) on a sole.
// A bag draws as a tote, anything else as a hanger or a plain box; those three are rarely shown.
import { luma, shade, tint, type Palette } from "./garments-color";
import { bandAcross, type Builder, type Built } from "./garments-build";
import { clipLine, innerPoly, polyD, sym, withRadius, type Pt, type Vtx } from "./garments-geom";
import { disc, line, path, strokes, type GarmentNode } from "./garments-node";

const flat = (d: string, fill: string): GarmentNode => path(d, { fill });

/**
 * The part of a piece's inner polygon on the right-hand side of a traveller going from a to b (up the screen that is the
 * right of the screen, down the screen it is the left): a toe cap with the seam drawn upward, a heel counter downward.
 */
const beyond = (vs: readonly Vtx[], a: Pt, b: Pt): string => polyD(clipLine(innerPoly(vs), a, b));

/** Short bars across a throat running from a to b, each perpendicular to it. */
function laces(a: Pt, b: Pt, count: number, half: number): string {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const nx = -(b[1] - a[1]) / length;
  const ny = (b[0] - a[0]) / length;
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const cx = a[0] + (b[0] - a[0]) * t;
    const cy = a[1] + (b[1] - a[1]) * t;
    return `M${cx - nx * half} ${cy - ny * half}L${cx + nx * half} ${cy + ny * half}`;
  }).join("");
}

export const sneakers: Builder = (p: Palette): Built => {
  const upper: readonly Vtx[] = [
    [13, 77, 1], [11, 59, 7], [19, 48, 5], [36, 52, 9], [45, 43, 3], [57, 43, 3], [62, 51, 2], [84, 57, 9], [108, 62, 10], [111, 77, 1],
  ];
  const sole = withRadius([[10, 76], [112, 76], [113, 84], [109, 89], [15, 89], [9, 84]], 3);
  return {
    pieces: [{ vs: upper }, { vs: sole, fill: p.sole, bare: true }],
    over: [
      flat(beyond(upper, [87, 77], [91.5, 58.5]), p.trim),
      flat(beyond(upper, [24.5, 48], [21.5, 77]), p.trim),
      strokes([
        ["M20 51.5Q33 57 40 53L45 46", p.trim, 2.4],
        [laces([49.5, 49.5], [74.5, 60.5], 4, 4.1), p.lace, 1.7],
        ["M87 77L91.5 58.5M24.5 48L21.5 77M12.5 67Q34 63 52 74M13 80.5H109", p.line],
      ]),
    ],
    chest: [60, 62],
    logo: [36, 66],
    allover: true,
  };
};

export const boots: Builder = (p: Palette): Built => {
  const upper: readonly Vtx[] = [[30, 92, 2], [28, 14, 3], [61, 14, 3], [62, 60, 5], [80, 66, 9], [103, 76, 11], [108, 92, 1]];
  const sole = withRadius([[26, 91], [110, 91], [111, 100], [104, 102], [58, 102], [54, 108], [26, 108]], 2.5);
  const welt = luma(p.boot) < 0.3 ? tint(p.boot, 0.3) : shade(p.boot, 0.3);
  const eyelets = [29, 37, 45, 53].map((y, i) => disc(61 + i * 0.4, y, 1.2, p.ink));
  return {
    pieces: [{ vs: upper }, { vs: sole, fill: p.boot, bare: true }],
    over: [
      flat(bandAcross(upper, 14, 23), p.trim),
      flat(beyond(upper, [88, 92], [91.8, 70.5]), p.trim),
      strokes([
        ["M30 17Q21 17 22 28L28 28", p.trim, 2.4],
        ["M61 29H52M61.4 37H52.4M61.8 45H52.8M62.2 53H53.2", p.lace, 1.6],
        ["M88 92L91.8 70.5", p.line],
        ["M30 96.5H108", welt],
      ]),
      ...eyelets,
    ],
    chest: [46, 50],
    logo: [44, 66],
    allover: true,
  };
};

export const bag: Builder = (p: Palette): Built => {
  const vs = sym([[28, 44, 5], [22, 108, 6]]);
  return {
    pieces: [{ vs }],
    over: [
      strokes([
        ["M44 46V34Q44 20 60 20Q76 20 76 34V46", p.trim, 3.6, { strokeLinecap: "butt" }],
        ["M29 54H91", p.line],
      ]),
    ],
    chest: [60, 78],
    logo: [44, 66],
    allover: true,
  };
};

/** A wire hanger: the same path drawn twice, wide in the outline colour then narrow in the item colour. */
export const hanger: Builder = (p: Palette): Built => {
  const wire = "M60 38L103 80Q106 84 100 84H20Q14 84 17 80L60 38V32Q60 26 66 26Q73 26 73 21Q73 14 65 14";
  return {
    pieces: [],
    over: [
      strokes([
        [wire, "currentColor", 7.2, { strokeOpacity: ".35" }],
        [wire, p.main, 4.2],
      ]),
    ],
    chest: [60, 66],
    logo: [60, 66],
    allover: false,
  };
};

/** A plain rounded box, for a picture that is not clothing. */
export const box: Builder = (p: Palette): Built => {
  const vs = withRadius([[24, 24], [96, 24], [96, 96], [24, 96]], 10);
  return {
    pieces: [{ vs }],
    over: [line("M33 33H87V87H33Z", p.line, 1, { strokeDasharray: "3 2.4" })],
    chest: [60, 60],
    logo: [44, 44],
    allover: true,
  };
};

export const SHOES = { sneakers, boots, bag, other: hanger, not_clothing: box } as const;
