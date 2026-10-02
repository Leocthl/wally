// Inline SVG state icons, decorative (aria-hidden): state is always icon + text (docs/04 State semantics).
// Same shapes as apps/web: check in a rounded square (pass), octagon (fail), dashed square (not verified).
const NS = "http://www.w3.org/2000/svg";

export type IconName = "pass" | "fail" | "pending" | "dot";

const SHAPES: Readonly<Record<IconName, readonly (readonly [string, Readonly<Record<string, string>>])[]>> = {
  pass: [
    ["rect", { x: "2.5", y: "2.5", width: "15", height: "15", rx: "4" }],
    ["path", { d: "M6.5 10.5l2.5 2.5 4.5-5.5" }],
  ],
  fail: [
    ["path", { d: "M7 2.5h6l4.5 4.5v6L13 17.5H7L2.5 13V7z" }],
    ["path", { d: "M7.5 7.5l5 5M12.5 7.5l-5 5" }],
  ],
  pending: [["rect", { x: "2.5", y: "2.5", width: "15", height: "15", rx: "1.5", "stroke-dasharray": "3 3" }]],
  dot: [["circle", { cx: "10", cy: "10", r: "2.5" }]],
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
