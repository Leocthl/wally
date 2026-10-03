// The small element model both outputs are built from: garmentSvg serialises it to markup and GarmentArt renders the same
// nodes as React elements, so the two cannot drift. The attribute names are a closed list on purpose: nothing that loads
// a resource or runs code (href, style, on*) can be expressed, so no drawing can ever contain one.
import { compactPath, n } from "./garments-path";

export type SvgTag = "g" | "path" | "circle" | "rect";

/** Attributes as they ship: camelCase names (React's) and string values. */
export type Attrs = {
  readonly d?: string;
  readonly fill?: string;
  readonly fillOpacity?: string;
  readonly stroke?: string;
  readonly strokeOpacity?: string;
  readonly strokeWidth?: string;
  readonly strokeLinecap?: "round" | "butt" | "square";
  readonly strokeLinejoin?: "round" | "miter" | "bevel";
  readonly strokeDasharray?: string;
  readonly paintOrder?: string;
  readonly cx?: string;
  readonly cy?: string;
  readonly r?: string;
  readonly x?: string;
  readonly y?: string;
  readonly width?: string;
  readonly height?: string;
  readonly rx?: string;
};

type Length = number | string;
/** What a builder passes in: lengths may be numbers (rounded to 0.1); opacities are strings so ".35" stays exact. */
export type AttrInput = {
  readonly d?: string;
  readonly fill?: string;
  readonly fillOpacity?: string;
  readonly stroke?: string;
  readonly strokeOpacity?: string;
  readonly strokeWidth?: Length;
  readonly strokeLinecap?: "round" | "butt" | "square";
  readonly strokeLinejoin?: "round" | "miter" | "bevel";
  readonly strokeDasharray?: string;
  readonly paintOrder?: string;
  readonly cx?: Length;
  readonly cy?: Length;
  readonly r?: Length;
  readonly x?: Length;
  readonly y?: Length;
  readonly width?: Length;
  readonly height?: Length;
  readonly rx?: Length;
};

export interface GarmentNode {
  readonly tag: SvgTag;
  readonly attrs: Attrs;
  readonly children: readonly GarmentNode[];
}

function toAttrs(input: AttrInput): Attrs {
  const entries = Object.entries(input)
    .filter((entry): entry is [string, Length] => typeof entry[1] === "string" || typeof entry[1] === "number")
    .map(([key, value]) => [key, typeof value === "number" ? n(value) : value] as const);
  return Object.fromEntries(entries) as Attrs;
}

export function el(tag: SvgTag, input: AttrInput = {}, children: readonly GarmentNode[] = []): GarmentNode {
  return { tag, attrs: toAttrs(input), children };
}

export const group = (input: AttrInput, children: readonly GarmentNode[]): GarmentNode => el("g", input, children);

/** Path data is written absolute and readable; it ships compacted. */
export const path = (d: string, input: AttrInput = {}): GarmentNode => el("path", { d: compactPath(d), ...input });

export const disc = (cx: number, cy: number, r: number, fill: string): GarmentNode => el("circle", { cx, cy, r, fill });

/** Thin outline for every filled shape: currentColor at low opacity, drawn under the fill so only its outer half shows. */
export const OUTLINE: AttrInput = { stroke: "currentColor", strokeOpacity: ".35", strokeWidth: 3, strokeLinejoin: "round", paintOrder: "stroke" };

/** A group whose filled children all get the outline. Give the group a fill, or each child its own. */
export const outlined = (children: readonly GarmentNode[], fill?: string): GarmentNode => group(fill === undefined ? OUTLINE : { fill, ...OUTLINE }, children);

/** An open line (seam, stitch, zip, lace): stroke only. Several segments can share one path. */
export function line(d: string, stroke: string, width = 1, extra: AttrInput = {}): GarmentNode {
  return path(d, { fill: "none", stroke, strokeWidth: width, strokeLinecap: "round", strokeLinejoin: "round", ...extra });
}

/** One line in a group: path data, colour, width (1 unless given) and any attributes that differ from the group's. */
export type Stroke = readonly [d: string, color: string, width?: number, extra?: AttrInput];

/** Several open lines with no fill and round caps and joins, those shared attributes written once for the group. */
export function strokes(list: readonly Stroke[]): GarmentNode {
  return group(
    { fill: "none", strokeLinecap: "round", strokeLinejoin: "round" },
    list.map(([d, color, width = 1, extra = {}]) => path(d, { stroke: color, strokeWidth: width, ...extra })),
  );
}

const kebab = (name: string): string => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const escapeAttr = (value: string): string => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** One node as SVG markup, no whitespace between tags. */
export function toMarkup(node: GarmentNode): string {
  const attrs = Object.entries(node.attrs)
    .map(([key, value]) => ` ${kebab(key)}="${escapeAttr(value)}"`)
    .join("");
  if (node.children.length === 0) return `<${node.tag}${attrs}/>`;
  return `<${node.tag}${attrs}>${node.children.map(toMarkup).join("")}</${node.tag}>`;
}
