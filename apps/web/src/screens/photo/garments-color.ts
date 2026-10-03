// Colours for one garment: the item's first colour fills the body, every other tone is computed from it so a navy hoodie
// gets a lighter rib and a cream dress a darker one. Pure functions on "#rrggbb" strings; sRGB mixing is good enough for
// flat illustration.
import { colorSwatch, isColor, type Color, type Pattern } from "@wally/agent/vision";

type Rgb = readonly [number, number, number];

const GREY: Color = "grey";

function parse(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

const channel = (value: number): string => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, "0");

/** `a` moved `t` (0 to 1) of the way to `b`. */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  return `#${channel(ar + (br - ar) * t)}${channel(ag + (bg - ag) * t)}${channel(ab + (bb - ab) * t)}`;
}

export const shade = (hex: string, t: number): string => mix(hex, "#000000", t);
export const tint = (hex: string, t: number): string => mix(hex, "#ffffff", t);

const linear = (value: number): number => {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luma(hex: string): number {
  const [r, g, b] = parse(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** A tone next to `hex` that stays visible on it: lighter for very dark colours, darker for everything else. */
export const detail = (hex: string, t: number): string => (luma(hex) < 0.06 ? tint(hex, t + 0.1) : shade(hex, t));

/** Swatch of a colour word; an unknown word (data that skipped the types) or none at all reads as grey. */
export const swatchOf = (color: Color | undefined): string => colorSwatch(color !== undefined && isColor(color) ? color : GREY);

export interface Palette {
  /** The body: the first colour, exactly its swatch. */
  readonly main: string;
  /** Collars, cuffs, hem ribs, waistbands: the second colour on a plain item, else a shade of the body. */
  readonly trim: string;
  /** True when the trim is a colour of its own (the item names a second colour), so contrast bands are drawn. */
  readonly contrast: boolean;
  /** The inside of a neck or hood. */
  readonly deep: string;
  /** Seams and stitch lines. */
  readonly line: string;
  /** Top stitching, as on jeans: lighter than the body, darker on a light body. */
  readonly stitch: string;
  /** Buttons, zip pulls, rivets: light on dark bodies, dark on light ones. */
  readonly ink: string;
  /** Stripes, check lines, print block, dots: the second colour when the pattern is not plain, else a shade of the body. */
  readonly accent: string;
  /** What is drawn on top of the accent (the shapes inside a print block). */
  readonly mark: string;
  /** The logo mark: the second colour, else the button ink. */
  readonly badge: string;
  /** A sneaker sole and the laces of a shoe. */
  readonly sole: string;
  readonly lace: string;
  /** A boot sole: dark, so the heavy base reads against the upper. */
  readonly boot: string;
}

export function paletteFor(colors: readonly Color[], pattern: Pattern): Palette {
  const main = swatchOf(colors[0]);
  const second = colors[1] === undefined ? null : swatchOf(colors[1]);
  const third = colors[2] === undefined ? null : swatchOf(colors[2]);
  const plain = pattern === "plain";
  const dark = luma(main) < 0.25;
  const ink = dark ? "#f1efe9" : "#2a2b30";
  const accent = second ?? detail(main, 0.28);
  const light = luma(main) > 0.5;
  const own = plain ? second : third;
  return {
    main,
    trim: own ?? detail(main, 0.16),
    contrast: own !== null,
    deep: shade(main, 0.4),
    line: detail(main, 0.22),
    stitch: light ? shade(main, 0.22) : tint(main, 0.4),
    ink,
    accent,
    mark: luma(accent) < 0.3 ? tint(accent, 0.75) : shade(accent, 0.6),
    badge: second ?? ink,
    sole: own ?? (light ? shade(main, 0.14) : tint(main, 0.82)),
    lace: light ? shade(main, 0.25) : tint(main, 0.8),
    boot: own ?? (luma(main) < 0.06 ? tint(main, 0.2) : shade(main, 0.5)),
  };
}
