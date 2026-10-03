// Bottoms and the dress, drawn front on: jeans, trousers, shorts, skirt, dress. Legs are one polygon with the crotch as
// a notch; details are a waistband, belt loops, pockets, fly and hem stitching.
import { detail, type Palette } from "./garments-color";
import { bandAcross, both, type Builder, type Built } from "./garments-build";
import { sym } from "./garments-geom";
import { disc, line, path, strokes, type GarmentNode } from "./garments-node";

const flat = (d: string, fill: string): GarmentNode => path(d, { fill });

const DASH = { strokeDasharray: "2.6 1.8" } as const;
const BUTT = { strokeLinecap: "butt" } as const;

export const jeans: Builder = (p: Palette): Built => {
  const vs = sym([[35, 11, 2.5], [31, 111, 2.5], [56, 111, 2.5], [60, 52, 3]]);
  return {
    pieces: [{ vs }],
    over: [
      flat(bandAcross(vs, 11, 19), p.trim),
      strokes([
        [both("M40 12V21M50.5 12V21"), detail(p.main, 0.32), 2.4, BUTT],
        [both("M43 19.5Q43 31 35.5 35") + "M58 19.5V38Q58 43.5 63 44", p.stitch, 1, DASH],
        [both("M37.6 21L34.2 108") + both("M32.5 106.5H54.5"), p.stitch, 1, DASH],
      ]),
      disc(60, 15, 1.9, p.ink),
      disc(43, 19.5, 1.1, p.ink),
      disc(77, 19.5, 1.1, p.ink),
    ],
    chest: [60, 40],
    logo: [47, 28],
    allover: true,
    stripes: "vertical",
  };
};

export const trousers: Builder = (p: Palette): Built => {
  const vs = sym([[35, 11, 2.5], [32, 111, 2.5], [55, 111, 2.5], [60, 52, 3]]);
  return {
    pieces: [{ vs }],
    over: [
      flat(bandAcross(vs, 11, 18), p.trim),
      disc(60, 14.5, 1.8, p.ink),
      line("M60 18V42" + both("M44 18.5L35.5 31") + both("M45.5 36L44 109") + both("M32.5 106.5H54.5"), p.line),
    ],
    chest: [60, 40],
    logo: [46, 30],
    allover: true,
    stripes: "vertical",
  };
};

export const shorts: Builder = (p: Palette): Built => {
  const vs = sym([[38, 24, 2.5], [24, 92, 3], [57, 92, 3], [60, 60, 3]]);
  return {
    pieces: [{ vs }],
    over: [
      flat(bandAcross(vs, 24, 32), p.trim),
      strokes([
        ["M56 31Q55.5 39 52.5 43M64 31Q64.5 39 67.5 43", p.ink, 1.4],
        [both("M43 34L38 50") + both("M26.5 87.5H56.5"), p.line],
      ]),
      disc(52.5, 44.2, 1.5, p.ink),
      disc(67.5, 44.2, 1.5, p.ink),
    ],
    chest: [60, 50],
    logo: [46, 42],
    allover: true,
    stripes: "vertical",
  };
};

export const skirt: Builder = (p: Palette): Built => {
  const vs = sym([[38, 24, 2.5], [20, 93, 4], [60, 96, 30]]);
  return {
    pieces: [{ vs }],
    over: [
      flat(bandAcross(vs, 24, 32), p.trim),
      disc(60, 28, 1.7, p.ink),
      line("M60 33V97" + both("M49.5 33L42 96"), p.line),
    ],
    chest: [60, 52],
    logo: [47, 44],
    allover: true,
  };
};

export const dress: Builder = (p: Palette): Built => {
  const vs = sym([[60, 29, 14], [52, 9.5, 1.5], [44, 9.5, 1.5], [41, 24, 7], [38, 40, 2], [44, 58, 3], [21, 106, 4], [60, 109, 28]]);
  return {
    pieces: [{ vs }],
    over: [
      flat(bandAcross(vs, 54, 61), p.trim),
      line("M60 62V108" + both("M53 62L38 106"), p.line),
    ],
    chest: [60, 42],
    logo: [49, 38],
    allover: true,
  };
};

export const BOTTOMS = { jeans, trousers, shorts, skirt, dress } as const;
