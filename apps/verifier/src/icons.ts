// Inline SVG state icons, decorative (aria-hidden): state is always icon + text (docs/04 State semantics).
// The shield language of the Wally app (apps/web/src/ui/icons.tsx, 24 units) redrawn on this page's 20-unit grid:
// shield with a check (pass), shield with an alert mark (fail), dashed shield (not verified). Small row marks:
// tick, cross and a dashed ring. Strokes are currentColor; CSS may thicken them per use.
const NS = "http://www.w3.org/2000/svg";

export type IconName = "pass" | "fail" | "pending" | "dot" | "tick" | "cross" | "ring";

type Shape = readonly [string, Readonly<Record<string, string>>];

const SHIELD = "M10 2.5l6.25 2.5v4.67c0 3.67-2.58 6.83-6.25 7.83-3.67-1-6.25-4.17-6.25-7.83V5z";

const SHAPES: Readonly<Record<IconName, readonly Shape[]>> = {
  pass: [
    ["path", { d: SHIELD }],
    ["path", { d: "M7.33 10.17l1.83 1.83 3.58-3.83" }],
  ],
  fail: [
    ["path", { d: SHIELD }],
    ["path", { d: "M10 6.67v3.75M10 13.33h.01" }],
  ],
  pending: [["path", { d: SHIELD, "stroke-dasharray": "2.6 2.6" }]],
  dot: [["circle", { cx: "10", cy: "10", r: "2.5" }]],
  tick: [["path", { d: "M5 10.5l3.3 3.3L15 6.7" }]],
  cross: [["path", { d: "M6 6l8 8M14 6l-8 8" }]],
  ring: [["circle", { cx: "10", cy: "10", r: "6.5", "stroke-dasharray": "2 3.1" }]],
};

function svgNode(tag: string, attrs: Readonly<Record<string, string>>): SVGElement {
  const node = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  return node;
}

export function icon(name: IconName, size = 20): SVGElement {
  const svg = svgNode("svg", {
    width: String(size),
    height: String(size),
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    focusable: "false",
    class: `icon icon--${name}`,
  });
  svg.append(...SHAPES[name].map(([tag, attrs]) => svgNode(tag, attrs)));
  return svg;
}
