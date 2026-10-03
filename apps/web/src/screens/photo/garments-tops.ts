// Tops, drawn front on: tee, shirt, polo, sweater, hoodie, jacket. Each is one polygon (body and sleeves together, the
// hood too for a hoodie) listed for the left half and mirrored, then details: neck, collar, rib bands, pockets, zip.
import { mix, type Palette } from "./garments-color";
import { bandAcross, both, endBand, mirrorPoly, vtx, type Builder, type Built } from "./garments-build";
import { distance, lerp, lineD, mirrorVtx, polyD, roundedD, sym, withRadius, type Pt } from "./garments-geom";
import { disc, el, line, outlined, path, strokes, type GarmentNode, type Stroke } from "./garments-node";

/** The four points that describe one sleeve (left): shoulder tip, outer and inner end corners, armpit. */
interface Sleeve {
  readonly s: Pt;
  readonly o1: Pt;
  readonly o2: Pt;
  readonly a: Pt;
}

const flat = (d: string, fill: string): GarmentNode => path(d, { fill });

/** A rib or hem texture: a dashed stroke whose dashes read as thin ticks across a band. */
const RIB = { strokeDasharray: "1.1 2.5", strokeLinecap: "butt" } as const;

/** A band of width `w` on the end of each sleeve, flat in the trim colour. */
function cuffs(sleeve: Sleeve, w: number, r: number, fill: string): GarmentNode {
  const left = endBand(sleeve.o1, sleeve.o2, sleeve.a, sleeve.s, w, r);
  return flat(roundedD(left) + roundedD(left.map(mirrorVtx)), fill);
}

/** Rib ticks across the cuffs: a dashed stroke along the middle of each cuff band, one tick per dash. */
function cuffRibs(sleeve: Sleeve, w: number, color: string): Stroke {
  const middle = (from: Pt, to: Pt): Pt => lerp(from, to, w / 2 / distance(from, to));
  const a = middle(sleeve.o1, sleeve.s);
  const b = middle(sleeve.o2, sleeve.a);
  return [both(lineD([lerp(a, b, 0.1), lerp(a, b, 0.9)])), color, w - 1.2, RIB];
}

/** The seam from the shoulder tip down to the armpit, both sides. */
const armscye = ({ s, a }: Sleeve): string => both(`M${s[0] + 0.5} ${s[1] + 1.5}L${a[0] - 0.2} ${a[1] - 0.5}`);

/** Round buttons down the centre. */
const buttons = (ys: readonly number[], fill: string): readonly GarmentNode[] => ys.map((y) => disc(60, y, 1.4, fill));

/** Both collar flaps from the left one. */
const flapsOf = (left: readonly Pt[], r: number, fill: string): readonly GarmentNode[] =>
  [left, mirrorPoly(left)].map((flap) => path(roundedD(withRadius(flap, r)), { fill }));

const TEE: Sleeve = { s: [30, 22], o1: [9, 41], o2: [19, 52], a: [32, 43] };

export const tee: Builder = (p: Palette): Built => {
  const body = sym([[46, 16, 3], vtx(TEE.s, 3.5), vtx(TEE.o1, 2.5), vtx(TEE.o2, 2.5), vtx(TEE.a, 1.5), [33, 106, 3]]);
  const bands = p.contrast ? [cuffs(TEE, 4, 2.5, p.trim), flat(bandAcross(body, 100, 106), p.trim)] : [];
  return {
    pieces: [{ vs: body }],
    over: [
      flat("M46 16Q60 34 74 16Z", p.deep),
      ...bands,
      strokes([
        ["M45 16Q60 35.5 75 16", p.trim, 3.4, { strokeLinecap: "butt" }],
        [both("M11.5 39L21.5 50") + armscye(TEE) + "M34.5 100.5H85.5", p.line],
      ]),
    ],
    chest: [60, 54],
    logo: [45, 38],
    allover: false,
  };
};

const POLO: Sleeve = { s: [30, 22], o1: [11, 39], o2: [19, 49], a: [32, 42] };

export const polo: Builder = (p: Palette): Built => {
  const body = sym([[46, 16, 3], vtx(POLO.s, 3.5), vtx(POLO.o1, 2.5), vtx(POLO.o2, 2.5), vtx(POLO.a, 1.5), [33, 106, 3]]);
  const placket = path(polyD([[57, 24], [63, 24], [63, 57], [57, 57]]), { fill: mix(p.main, p.trim, 0.55) });
  return {
    pieces: [{ vs: body }],
    over: [
      flat("M47 16H73L60 31Z", p.deep),
      outlined([placket, ...flapsOf([[44, 14.5], [60, 17.5], [56.5, 32]], 1.5, p.trim)]),
      ...buttons([37, 48], p.ink),
      cuffs(POLO, 5, 2.5, p.trim),
      line(armscye(POLO) + "M34.5 100.5H85.5", p.line),
    ],
    chest: [60, 66],
    logo: [45, 40],
    allover: true,
  };
};

const SHIRT: Sleeve = { s: [30, 22], o1: [11, 88], o2: [24, 92], a: [33, 45] };

export const shirt: Builder = (p: Palette): Built => {
  const body = sym([[47, 16, 3], vtx(SHIRT.s, 3.5), vtx(SHIRT.o1, 2.5), vtx(SHIRT.o2, 2.5), vtx(SHIRT.a, 1.5), [34, 106, 3]]);
  return {
    pieces: [{ vs: body }],
    over: [
      flat("M47 16H73L60 27Z", p.deep),
      outlined(flapsOf([[43.5, 14], [60, 18.5], [57, 34], [45, 26]], 1.2, p.trim)),
      ...buttons([42, 56, 70, 84, 98], p.ink),
      cuffs(SHIRT, 6, 2.5, p.trim),
      line(armscye(SHIRT) + "M40 47H52V58L46 61L40 58ZM57.5 30V104M62.5 30V104", p.line),
    ],
    chest: [60, 52],
    logo: [47, 40],
    allover: true,
  };
};

const SWEATER: Sleeve = { s: [29, 22], o1: [10, 86], o2: [25, 90], a: [33, 48] };

export const sweater: Builder = (p: Palette): Built => {
  const body = sym([[45, 16, 3], vtx(SWEATER.s, 4.5), vtx(SWEATER.o1, 3), vtx(SWEATER.o2, 3), vtx(SWEATER.a, 1.5), [34, 104, 4]]);
  return {
    pieces: [{ vs: body }],
    over: [
      flat("M45 16Q60 33 75 16Z", p.deep),
      flat(bandAcross(body, 96, 104), p.trim),
      cuffs(SWEATER, 6, 3, p.trim),
      strokes([
        ["M44.5 16Q60 35 75.5 16", p.trim, 4.6, { strokeLinecap: "butt" }],
        ["M40 100H80", p.line, 8, RIB],
        cuffRibs(SWEATER, 6, p.line),
        [armscye(SWEATER), p.line],
      ]),
    ],
    chest: [60, 52],
    logo: [45, 40],
    allover: false,
  };
};

const HOODIE: Sleeve = { s: [29, 33], o1: [10, 90], o2: [24, 94], a: [34, 54] };

export const hoodie: Builder = (p: Palette): Built => {
  const body = sym([[44, 9, 9], [41, 26, 2.5], vtx(HOODIE.s, 4), vtx(HOODIE.o1, 3), vtx(HOODIE.o2, 3), vtx(HOODIE.a, 1.5), [35, 106, 3]]);
  const opening = "M47 22Q47 13 60 13Q73 13 73 22Q73 34 60 37Q47 34 47 22Z";
  const pouch = path(roundedD(withRadius([[41, 72], [79, 72], [84, 97], [36, 97]], 3)), { fill: p.trim });
  return {
    pieces: [{ vs: body }],
    over: [
      flat(opening, p.deep),
      outlined([pouch]),
      flat(bandAcross(body, 98, 106), p.trim),
      cuffs(HOODIE, 6, 3, p.trim),
      strokes([
        [opening, p.trim, 2.2],
        ["M40 102H80", p.line, 8, RIB],
        cuffRibs(HOODIE, 6, p.line),
        ["M55 36L54.6 45M65 36L65.4 45", p.ink, 1.5],
        [armscye(HOODIE) + both("M41.5 73.5L38 85"), p.line],
      ]),
      disc(54.6, 46.2, 1.7, p.ink),
      disc(65.4, 46.2, 1.7, p.ink),
    ],
    chest: [60, 60],
    logo: [44, 46],
    allover: false,
  };
};

const JACKET: Sleeve = { s: [29, 21], o1: [10, 88], o2: [24, 92], a: [33, 46] };

export const jacket: Builder = (p: Palette): Built => {
  const body = sym([[46, 14, 3], vtx(JACKET.s, 3.5), vtx(JACKET.o1, 2.5), vtx(JACKET.o2, 2.5), vtx(JACKET.a, 1.5), [34, 106, 3]]);
  return {
    pieces: [{ vs: body }],
    over: [
      flat("M46 14H74L60 26Z", p.deep),
      outlined(flapsOf([[43, 11.5], [59, 16.5], [59, 31], [46.5, 24]], 1.5, p.trim)),
      flat(bandAcross(body, 98, 106), p.trim),
      cuffs(JACKET, 6, 2.5, p.trim),
      strokes([
        ["M60 31V106", p.line, 2.6],
        ["M60 31V106", p.ink, 2.6, { strokeDasharray: "1 1.6", strokeLinecap: "butt" }],
        [armscye(JACKET) + both("M40 74L44 91"), p.line],
      ]),
      el("rect", { x: 58.4, y: 33, width: 3.2, height: 6, rx: 1.2, fill: p.ink }),
    ],
    chest: [47, 50],
    logo: [47, 44],
    allover: true,
  };
};

export const TOPS = { tee, shirt, polo, sweater, hoodie, jacket } as const;
