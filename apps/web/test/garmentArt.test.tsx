// The garment drawings behind the shop cards: every kind draws, the markup stays small and carries nothing that loads or
// runs, the component renders the same shapes as the string, and bad data still draws something.
import { render } from "@testing-library/react";
import { COLORS, KINDS, PATTERNS, SHOP_KINDS, colorSwatch, type Color, type Kind, type Pattern } from "@wally/agent/vision";
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { GarmentArt } from "../src/screens/photo/GarmentArt";
import { detail, luma, mix, paletteFor, shade, tint } from "../src/screens/photo/garments-color";
import { clipBand, clipLine, innerPoly, insideBy, roundedD, signedArea, sym, type Pt, type Vtx } from "../src/screens/photo/garments-geom";
import { compactPath, mirrorPath, n, parsePath } from "../src/screens/photo/garments-path";
import { garmentBox, garmentParts, garmentSvg, VIEW_BOX, type GarmentSpec } from "../src/screens/photo/garments";

const MAX_BYTES = 3_000;
const spec = (kind: Kind, colors: readonly Color[], pattern: Pattern = "plain"): GarmentSpec => ({ kind, colors, pattern });
const shapes = (svg: string): number => (svg.match(/<(path|circle|rect)\b/g) ?? []).length;

/** Every kind in every colour and pattern: one colour, then three colours that shift with the first. */
function* combos(kinds: readonly Kind[]): Generator<GarmentSpec> {
  for (const kind of kinds) {
    for (const [i, color] of COLORS.entries()) {
      for (const pattern of PATTERNS) {
        yield spec(kind, [color], pattern);
        yield spec(kind, [color, COLORS[(i + 7) % COLORS.length] ?? color, COLORS[(i + 3) % COLORS.length] ?? color], pattern);
      }
    }
  }
}

/** The first outline of a drawing, to tell silhouettes apart. */
const firstOutline = (kind: Kind): string => {
  const first = garmentParts(spec(kind, ["navy"]))[0];
  return first?.children[0]?.attrs.d ?? first?.attrs.d ?? "";
};

/** The markup inside the root svg, as a browser serialises it, whether it came from a string or from React. */
const inner = (root: Element | null): string | undefined => root?.innerHTML;
const parsed = (svg: string): Element | null => {
  const host = document.createElement("div");
  host.innerHTML = svg;
  return host.querySelector("svg");
};

describe("garmentSvg: every kind draws", () => {
  it.each(KINDS.map((kind) => [kind]))("%s is a standalone svg with shapes", (kind) => {
    const svg = garmentSvg(spec(kind, ["navy"]));
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain(`viewBox="${VIEW_BOX}"`);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(shapes(svg)).toBeGreaterThan(0);
  });

  it("gives each of the 16 kinds its own silhouette", () => {
    const outlines = new Set(KINDS.map(firstOutline));
    expect(outlines.size).toBe(KINDS.length);
    expect([...outlines].every((d) => d.length > 20)).toBe(true);
  });
});

describe("garmentSvg: size and content", () => {
  it(`stays under ${MAX_BYTES} bytes for every kind, colour and pattern`, () => {
    let largest = { size: 0, spec: spec("tee", []) };
    for (const item of combos(KINDS)) {
      const size = new TextEncoder().encode(garmentSvg(item)).length;
      if (size > largest.size) largest = { size, spec: item };
    }
    expect(largest.size, JSON.stringify(largest.spec)).toBeLessThan(MAX_BYTES);
  });

  it("is deterministic and changes with the colour", () => {
    for (const kind of SHOP_KINDS) {
      expect(garmentSvg(spec(kind, ["navy"], "check"))).toBe(garmentSvg(spec(kind, ["navy"], "check")));
      expect(garmentSvg(spec(kind, ["navy"]))).not.toBe(garmentSvg(spec(kind, ["red"])));
    }
  });

  it("fills the body with the first colour's swatch", () => {
    for (const kind of KINDS) {
      for (const color of COLORS) expect(garmentSvg(spec(kind, [color, "white"])), `${kind} ${color}`).toContain(colorSwatch(color));
    }
  });

  it("draws extra shapes for a pattern and none for plain, in the second colour when there is one", () => {
    for (const kind of SHOP_KINDS) {
      const plain = garmentSvg(spec(kind, ["olive"]));
      for (const pattern of PATTERNS.filter((p) => p !== "plain")) {
        const patterned = garmentSvg(spec(kind, ["olive"], pattern));
        expect(patterned, `${kind} ${pattern}`).not.toBe(plain);
        expect(shapes(patterned), `${kind} ${pattern}`).toBeGreaterThan(shapes(plain));
      }
      expect(plain).not.toContain("fill-opacity");
    }
    expect(garmentSvg(spec("tee", ["white", "navy"], "stripes"))).toContain(colorSwatch("navy"));
    expect(garmentSvg(spec("shirt", ["light_blue", "red"], "logo"))).toContain(colorSwatch("red"));
  });

  it("carries nothing that loads, runs or references, and is well-formed XML", () => {
    const forbidden = /url\(|<style|<script|<text|<image|<use|<defs|<foreignObject|clipPath|href|xlink|javascript:|\son[a-z]+=|\sid=/i;
    const broken = /NaN|undefined|Infinity|null|d=""/;
    const tags = new Set(["svg", "g", "path", "circle", "rect"]);
    const reader = new DOMParser();
    for (const item of combos(KINDS)) {
      const svg = garmentSvg(item);
      expect(forbidden.test(svg) || broken.test(svg), JSON.stringify(item)).toBe(false);
      for (const match of svg.matchAll(/<\/?([a-zA-Z]+)/g)) expect(tags.has(match[1] ?? ""), `${JSON.stringify(item)} ${match[1]}`).toBe(true);
    }
    for (const kind of KINDS) {
      for (const pattern of PATTERNS) {
        const doc = reader.parseFromString(garmentSvg(spec(kind, ["navy", "light_blue"], pattern)), "image/svg+xml");
        expect(doc.getElementsByTagName("parsererror"), `${kind} ${pattern}`).toHaveLength(0);
        expect(doc.documentElement.nodeName).toBe("svg");
      }
    }
  });

  it("leaves about 8 units of padding around the fabric and keeps every mark inside the box", () => {
    for (const kind of KINDS) {
      const box = garmentBox(spec(kind, ["navy"]));
      if (box === null) continue;
      expect(Math.min(box.x0, box.y0), kind).toBeGreaterThanOrEqual(7);
      expect(Math.max(box.x1, box.y1), kind).toBeLessThanOrEqual(113);
      expect(Math.min(box.x1 - box.x0, box.y1 - box.y0), kind).toBeGreaterThan(40);
    }
    expect(garmentBox(spec("other", ["grey"]))).toBeNull();
    for (const item of combos(SHOP_KINDS)) {
      const numbers = [...garmentSvg(item).matchAll(/ (?:cx|cy|x|y|width|height)="(-?[\d.]+)"/g)].map((m) => Number(m[1]));
      expect(numbers.every((v) => v >= 0 && v <= 120), JSON.stringify(item)).toBe(true);
    }
  });

  it("outlines with currentColor and survives data that skipped the types", () => {
    expect(garmentSvg(spec("tee", ["white"]))).toContain('stroke="currentColor"');
    expect(garmentSvg(spec("tee", []))).toContain(colorSwatch("grey"));
    expect(garmentSvg(spec("hoodie", ["mauve" as Color]))).toContain(colorSwatch("grey"));
    expect(garmentSvg(spec("kimono" as Kind, ["red"]))).toBe(garmentSvg(spec("other", ["red"])));
    expect(garmentSvg(spec("tee", ["red"], "spots" as Pattern))).toBe(garmentSvg(spec("tee", ["red"])));
    expect(() => garmentSvg({ kind: "tee", colors: undefined as never, pattern: "plain" })).not.toThrow();
  });
});

describe("GarmentArt", () => {
  it("is a picture with a name when given a label", () => {
    const { container } = render(<GarmentArt kind="hoodie" colors={["navy"]} label="Navy hoodie" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("role", "img");
    expect(svg).toHaveAttribute("aria-label", "Navy hoodie");
    expect(svg).not.toHaveAttribute("aria-hidden");
  });

  it("is decorative without a label, or with a blank one", () => {
    for (const label of [undefined, "", "  "]) {
      const { container, unmount } = render(label === undefined ? <GarmentArt kind="tee" colors={["red"]} /> : <GarmentArt kind="tee" colors={["red"]} label={label} />);
      const svg = container.querySelector("svg");
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg).not.toHaveAttribute("role");
      expect(svg).not.toHaveAttribute("aria-label");
      unmount();
    }
  });

  it("takes a size, 96 by default, and a class", () => {
    const { container, rerender } = render(<GarmentArt kind="jeans" colors={["denim"]} />);
    expect(container.querySelector("svg")).toHaveAttribute("width", "96");
    expect(container.querySelector("svg")).toHaveAttribute("height", "96");
    rerender(<GarmentArt kind="jeans" colors={["denim"]} size={140} className="art" />);
    expect(container.querySelector("svg")).toHaveAttribute("width", "140");
    expect(container.querySelector("svg")).toHaveAttribute("height", "140");
    expect(container.querySelector("svg")).toHaveClass("art");
    expect(container.querySelector("svg")).toHaveAttribute("viewBox", VIEW_BOX);
  });

  it("renders exactly the shapes garmentSvg writes, and plain grey when given no pattern or colour", () => {
    const cases: readonly GarmentSpec[] = [
      spec("tee", ["black"]),
      spec("shirt", ["blue", "white"], "check"),
      spec("hoodie", ["navy", "white"], "logo"),
      spec("jacket", ["green"], "stripes"),
      spec("dress", ["pink"], "print"),
      spec("sneakers", ["white", "green"]),
      spec("boots", ["brown"], "print"),
      spec("other", ["grey"]),
      spec("skirt", []),
    ];
    for (const item of cases) {
      const { container, unmount } = render(<GarmentArt kind={item.kind} colors={item.colors} {...(item.pattern === "plain" ? {} : { pattern: item.pattern })} />);
      expect(inner(container.querySelector("svg")), JSON.stringify(item)).toBe(inner(parsed(garmentSvg(item))));
      unmount();
    }
  });

  it("renders every kind and pattern without a React warning, and still draws data that skipped the types", () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      for (const kind of KINDS) {
        for (const pattern of PATTERNS) {
          const { container, unmount } = render(<GarmentArt kind={kind} colors={["navy", "white"]} pattern={pattern} size={64} label={`${kind} ${pattern}`} />);
          expect(container.querySelectorAll("svg path").length).toBeGreaterThan(0);
          unmount();
        }
      }
      const { container } = render(<GarmentArt kind={"kimono" as Kind} colors={undefined as never} pattern={"spots" as Pattern} />);
      expect(container.innerHTML).toContain(colorSwatch("grey"));
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

const ARITY: Readonly<Record<string, number>> = { m: 2, l: 2, h: 1, v: 1, q: 4, c: 6 };

/** Every point a path names (control and end points), absolute, read by a small interpreter of M L H V Q C Z in both cases. */
function pointsOf(d: string): readonly (readonly [number, number])[] {
  const points: [number, number][] = [];
  let at: [number, number] = [0, 0];
  let start: [number, number] = [0, 0];
  for (const [, letter = "", args = ""] of d.matchAll(/([a-zA-Z])([^a-zA-Z]*)/g)) {
    const kind = letter.toLowerCase();
    const rel = letter === kind;
    const size = ARITY[kind] ?? 0;
    if (kind === "z") {
      points.push(start);
      at = start;
    }
    const nums = (args.match(/-?(?:\d+\.?\d*|\.\d+)/g) ?? []).map(Number);
    for (let k = 0; size > 0 && k + size <= nums.length; k += size) {
      const [ox, oy]: [number, number] = rel ? at : [0, 0];
      const first = nums[k] ?? 0;
      const pairs: [number, number][] =
        kind === "h" ? [[ox + first, at[1]]] : kind === "v" ? [[at[0], oy + first]] : Array.from({ length: size / 2 }, (_, j): [number, number] => [ox + (nums[k + 2 * j] ?? 0), oy + (nums[k + 2 * j + 1] ?? 0)]);
      points.push(...pairs);
      at = pairs.at(-1) ?? at;
      if (kind === "m" && k === 0) start = at;
    }
  }
  const near = (a: number, b: number | undefined): boolean => b !== undefined && Math.abs(a - b) < 1e-6;
  return points.filter((p, k) => k === 0 || !(near(p[0], points[k - 1]?.[0]) && near(p[1], points[k - 1]?.[1])));
}

describe("path data", () => {
  const same = (a: string, b: string): void => {
    const left = pointsOf(a);
    const right = pointsOf(b);
    expect(right).toHaveLength(left.length);
    left.forEach(([x, y], k) => {
      expect(right[k]?.[0]).toBeCloseTo(x, 5);
      expect(right[k]?.[1]).toBeCloseTo(y, 5);
    });
  };

  it("rounds to one decimal without a leading zero", () => {
    expect([n(0.5), n(-0.5), n(12), n(12.26), n(-0.04)]).toEqual([".5", "-.5", "12", "12.3", "0"]);
  });

  it("compacts absolute data into the shortest absolute or relative form", () => {
    expect(compactPath("M10 10L20 10L20 20Z")).toBe("M10 10H20V20z");
    expect(compactPath("M0.04 0.06L10.049 0.06")).toBe("M0 .1H10");
    expect(compactPath("M10 10L12 13L14 16")).toBe("M10 10l2 3 2 3");
    expect(compactPath("M50 50Q60 40 70 50")).toBe("M50 50q10-10 20 0");
    expect(compactPath("M46 16Q60 34 74 16Z").length).toBeLessThanOrEqual("M46 16Q60 34 74 16Z".length);
  });

  it("reads back the same points for shapes that use every command", () => {
    for (const d of ["M10 10L20 10L20 20Z", "M5.5 5.5Q10 0 15 5.5L15 15Q10 20 5.5 15Z", "M0 0C10 0 20 10 30 10L30 40H10V20ZM50 50L60 50L60 60", "M60 14.5L45 20H30V35L28 50Q24 60 30 70Z"]) same(d, compactPath(d));
  });

  it("holds for any run of commands on a 0.1 grid", () => {
    const coord = fc.integer({ min: 0, max: 1200 }).map((v) => v / 10);
    const step = fc.oneof(
      fc.tuple(coord, coord).map(([x, y]) => `L${x} ${y}`),
      coord.map((x) => `H${x}`),
      coord.map((y) => `V${y}`),
      fc.tuple(coord, coord, coord, coord).map(([a, b, c, e]) => `Q${a} ${b} ${c} ${e}`),
      fc.tuple(coord, coord, coord, coord, coord, coord).map(([a, b, c, e, f, g]) => `C${a} ${b} ${c} ${e} ${f} ${g}`),
      fc.constant("Z"),
    );
    fc.assert(
      fc.property(fc.tuple(coord, coord), fc.array(step, { maxLength: 14 }), ([x, y], steps) => {
        const d = `M${x} ${y}${steps.join("")}`;
        same(d, compactPath(d));
      }),
      { numRuns: 300 },
    );
  });

  it("splits implicit repeats, skips what it does not know, and mirrors across x = 60", () => {
    expect(parsePath("M1 2 3 4").map((s) => s.cmd)).toEqual(["M", "L"]);
    expect(parsePath("M1 2 q3 4 5 6 L7 8").map((s) => s.cmd)).toEqual(["M", "L"]);
    expect(parsePath("")).toEqual([]);
    expect(mirrorPath("M10 20H30V40Q40 50 50 60Z")).toBe("M110 20H90V40Q80 50 70 60Z");
  });
});

describe("geometry", () => {
  const square: readonly Pt[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const area = (poly: readonly Pt[]): number => Math.abs(signedArea(poly));

  it("cuts a band or a side out of a polygon", () => {
    expect(area(clipBand(square, 1, 2, 5))).toBeCloseTo(30);
    expect(area(clipBand(square, 0, 2, 5))).toBeCloseTo(30);
    expect(clipBand(square, 1, 20, 30)).toEqual([]);
    expect(clipBand(square, 1, -5, 15)).toHaveLength(4);
    expect(area(clipLine(square, [5, 10], [5, 0]))).toBeCloseTo(50);
    expect(clipLine(square, [5, 10], [5, 0]).every(([x]) => x >= 5 - 1e-9)).toBe(true);
    expect(clipLine(square, [5, 0], [5, 10]).every(([x]) => x <= 5 + 1e-9)).toBe(true);
  });

  it("keeps a concave outline in one piece with no area added", () => {
    const u: readonly Pt[] = [[0, 0], [10, 0], [10, 10], [6, 10], [6, 4], [4, 4], [4, 10], [0, 10]];
    expect(area(clipBand(u, 1, 6, 9))).toBeCloseTo(3 * 8);
  });

  it("mirrors a left half into a symmetric outline without repeating the axis", () => {
    const whole = sym([[30, 10, 0], [20, 60, 0], [60, 70, 0]]);
    expect(whole).toHaveLength(5);
    for (const [x, y] of whole) expect(whole.some(([mx, my]) => Math.abs(mx - (120 - x)) < 1e-9 && my === y)).toBe(true);
  });

  it("rounds corners with curves and cuts patterns inside the curve", () => {
    const rounded: readonly Vtx[] = [[0, 0, 4], [20, 0, 4], [20, 20, 4], [0, 20, 4]];
    expect(roundedD(rounded).match(/Q/g)).toHaveLength(4);
    expect(area(innerPoly(rounded))).toBeLessThan(400);
    expect(area(innerPoly(rounded))).toBeGreaterThan(370);
    expect(area(innerPoly([[0, 0, 0], [20, 0, 0], [20, 20, 0], [0, 20, 0]]))).toBeCloseTo(400);
  });

  it("keeps a point at a margin from every edge", () => {
    expect(insideBy(square, [5, 5], 4)).toBe(true);
    expect(insideBy(square, [5, 5], 6)).toBe(false);
    expect(insideBy(square, [15, 5], 0)).toBe(false);
  });
});

describe("colour", () => {
  it("mixes toward black and white", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(shade("#ffffff", 1)).toBe("#000000");
    expect(tint("#000000", 1)).toBe("#ffffff");
  });

  it("makes a detail tone that shows on the body: lighter on very dark, darker on the rest", () => {
    for (const color of ["black", "navy"] as const) expect(luma(detail(colorSwatch(color), 0.2))).toBeGreaterThan(luma(colorSwatch(color)));
    for (const color of ["white", "cream", "red"] as const) expect(luma(detail(colorSwatch(color), 0.2))).toBeLessThan(luma(colorSwatch(color)));
  });

  it("takes the body from the first colour and trim from the second only on a plain item", () => {
    const plain = paletteFor(["navy", "white"], "plain");
    expect([plain.main, plain.trim, plain.contrast]).toEqual([colorSwatch("navy"), colorSwatch("white"), true]);
    const striped = paletteFor(["navy", "white"], "stripes");
    expect([striped.accent, striped.contrast]).toEqual([colorSwatch("white"), false]);
    expect(paletteFor(["navy"], "plain").contrast).toBe(false);
  });
});
