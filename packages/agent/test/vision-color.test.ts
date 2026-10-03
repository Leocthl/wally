// Colour words from pixels: sRGB to CIELAB, the distance between two Lab colours, the nearest colour word, and the
// dominant colours of a small synthetic picture. Everything is deterministic: the same pixels give the same words.
import { describe, expect, it } from "vitest";
import { COLOR_ANCHORS, colorDistance, colorSwatch, deltaE, hexToRgb, nearestColor, rgbToLab, swatchLab, type Rgb } from "../src/vision/color";
import { extractPalette, type PixelImage } from "../src/vision/palette";
import { COLORS, type Color } from "../src/vision/vocab";

const near = (actual: readonly number[], expected: readonly number[], tolerance = 0.15): void => {
  expected.forEach((value, i) => expect(Math.abs((actual[i] ?? Number.NaN) - value), `channel ${i}: ${actual[i]} vs ${value}`).toBeLessThanOrEqual(tolerance));
};

describe("rgbToLab (sRGB to CIELAB, D65)", () => {
  it("matches the published values for white, black and the sRGB primaries", () => {
    near(rgbToLab([255, 255, 255]), [100, 0, 0], 0.05);
    near(rgbToLab([0, 0, 0]), [0, 0, 0], 0.05);
    near(rgbToLab([255, 0, 0]), [53.24, 80.09, 67.2]);
    near(rgbToLab([0, 255, 0]), [87.73, -86.18, 83.18]);
    near(rgbToLab([0, 0, 255]), [32.3, 79.19, -107.86]);
    near(rgbToLab([128, 128, 128]), [53.59, 0, 0]);
  });

  it("clamps channels outside 0 to 255 instead of producing NaN", () => {
    expect(rgbToLab([300, -5, 12]).every(Number.isFinite)).toBe(true);
  });
});

describe("deltaE and colour words", () => {
  it("is the straight-line Lab distance", () => {
    expect(deltaE([50, 0, 0], [50, 3, 4])).toBe(5);
    expect(deltaE([10, 20, 30], [10, 20, 30])).toBe(0);
  });

  it("has a swatch and at least one anchor for each of the 17 words, and every swatch names itself", () => {
    expect(COLORS).toHaveLength(17);
    for (const color of COLORS) {
      expect(COLOR_ANCHORS[color].length).toBeGreaterThan(0);
      expect(hexToRgb(colorSwatch(color))).toHaveLength(3);
      expect(nearestColor(swatchLab(color)).color, color).toBe(color);
    }
  });

  it("names typical garment pixels: pastel mint is green, charcoal is grey, near black is black", () => {
    const named = (rgb: Rgb): Color => nearestColor(rgbToLab(rgb)).color;
    expect(named([176, 213, 168])).toBe("green");
    expect(named([68, 68, 74])).toBe("grey");
    expect(named([30, 30, 32])).toBe("black");
    expect(named([240, 240, 238])).toBe("white");
    expect(named([240, 232, 210])).toBe("cream");
    expect(named([220, 110, 30])).toBe("orange");
    expect(named([210, 40, 35])).toBe("red");
    expect(named([150, 190, 235])).toBe("light_blue");
    expect(named([78, 124, 156])).toBe("blue");
    expect(named([60, 75, 110])).toBe("navy");
    expect(named([30, 60, 45])).toBe("green");
    expect(named([108, 107, 74])).toBe("olive");
  });

  it("compares two words at their swatches: same is 0, near words are near, far words are far", () => {
    expect(colorDistance("navy", "navy")).toBe(0);
    expect(colorDistance("navy", "black")).toBeLessThan(colorDistance("navy", "red"));
    expect(colorDistance("light_blue", "blue")).toBeLessThan(colorDistance("light_blue", "orange"));
    expect(colorDistance("beige", "cream")).toBeLessThan(colorDistance("beige", "navy"));
    expect(colorDistance("red", "navy")).toBe(colorDistance("navy", "red"));
  });
});

/** An RGBA picture from a function of (x, y). */
function picture(width: number, height: number, at: (x: number, y: number) => readonly [number, number, number, number?]): PixelImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a = 255] = at(x, y);
      data.set([r, g, b, a], (y * width + x) * 4);
    }
  }
  return { data, width, height };
}

const solid = (rgb: Rgb): PixelImage => picture(64, 64, () => rgb);

describe("extractPalette", () => {
  it("names a plain picture with its one colour", () => {
    expect(extractPalette(solid([200, 30, 30]))).toEqual([{ color: "red", share: 1 }]);
  });

  it("splits two halves into two words, each about half", () => {
    const out = extractPalette(picture(64, 64, (x) => (x < 32 ? [31, 47, 85] : [245, 245, 242])));
    expect(out.map((e) => e.color).sort()).toEqual(["navy", "white"]);
    for (const entry of out) expect(entry.share).toBeGreaterThan(0.4);
  });

  it("puts a garment in the middle of a plain studio backdrop ahead of the backdrop", () => {
    const studio = picture(96, 128, (x, y) => (x > 24 && x < 72 && y > 30 && y < 100 ? [200, 56, 44] : [250, 250, 250]));
    const out = extractPalette(studio);
    expect(out[0]?.color).toBe("red");
  });

  it("keeps a garment that fills the frame, even if its edge colour is the picture's edge colour", () => {
    const crop = picture(96, 128, (x, y) => (x > 40 && x < 52 && y > 90 && y < 100 ? [245, 245, 245] : [29, 74, 52]));
    expect(extractPalette(crop)[0]?.color).toBe("green");
  });

  it("keeps a white garment on a white backdrop as white", () => {
    expect(extractPalette(solid([245, 245, 242]))[0]).toEqual({ color: "white", share: 1 });
  });

  it("ignores transparent pixels, and gives nothing for an empty or invalid picture", () => {
    expect(extractPalette(picture(32, 32, () => [10, 200, 10, 0]))).toEqual([]);
    expect(extractPalette({ data: new Uint8ClampedArray(0), width: 0, height: 0 })).toEqual([]);
    expect(extractPalette({ data: new Uint8ClampedArray(10), width: 64, height: 64 })).toEqual([]);
  });

  it("is deterministic and orders by share, at most four words, none under 5 percent", () => {
    const busy = picture(120, 120, (x, y) => [(x * 7) % 256, (y * 13) % 256, (x * y) % 256]);
    const first = extractPalette(busy);
    expect(extractPalette(busy)).toEqual(first);
    expect(first.length).toBeLessThanOrEqual(4);
    expect(first.every((e) => e.share >= 0.05 && e.share <= 1)).toBe(true);
    expect([...first].sort((a, b) => b.share - a.share)).toEqual(first);
  });

  it("only reports words from the vocabulary, with shares that add up to at most 1", () => {
    const out = extractPalette(picture(64, 64, (x, y) => [(x * 4) % 256, (y * 4) % 256, 120]));
    expect(out.length).toBeGreaterThan(0);
    for (const entry of out) expect(COLORS).toContain(entry.color);
    expect(out.reduce((sum, e) => sum + e.share, 0)).toBeLessThanOrEqual(1.001);
  });

  it.each([
    ["a wide strip", 2000, 20],
    ["a tall strip", 20, 2000],
    ["one pixel wide", 1, 2000],
    ["a panorama", 5000, 40],
  ])("still names the colour of %s (the sampling grid never skips the short side)", (_name, width, height) => {
    expect(extractPalette(solid2(width, height, [31, 47, 85]))[0]?.color).toBe("navy");
  });
});

/** A flat picture of any shape, built without a per-pixel callback (a 5000 by 40 strip is 200,000 pixels). */
function solid2(width: number, height: number, [r, g, b]: Rgb): PixelImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) data.set([r, g, b, 255], i * 4);
  return { data, width, height };
}
