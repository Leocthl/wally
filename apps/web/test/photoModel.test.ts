// What the chips can change, as pure steps, and the size the page shrinks a picture to before anything leaves the phone.
import { describe, expect, it } from "vitest";
import type { SeeAttributes } from "../src/api/types";
import { chosenKind, sameAttributes, withFit, withKind, withPattern, withToggledColor, withToggledStyle } from "../src/screens/photo/photoModel";
import { fitWithin, MAX_SOURCE_BYTES, TARGET_EDGE } from "../src/screens/photo/prepare";

const BASE: SeeAttributes = { kind: "hoodie", colors: ["navy"], pattern: null, fit: "relaxed", style: ["streetwear"] };

describe("chip steps (each returns a new value)", () => {
  it("sets the kind", () => {
    expect(withKind(BASE, "jacket")).toEqual({ ...BASE, kind: "jacket" });
    expect(BASE.kind).toBe("hoodie");
  });

  it("turns a colour on and off", () => {
    expect(withToggledColor(BASE, "white").colors).toEqual(["navy", "white"]);
    expect(withToggledColor(BASE, "navy").colors).toEqual([]);
  });

  it("keeps at most three colours: a fourth replaces the least dominant", () => {
    const three = { ...BASE, colors: ["navy", "white", "red"] } as const;
    expect(withToggledColor(three, "olive").colors).toEqual(["navy", "white", "olive"]);
  });

  it("sets a pattern or fit and clears it when tapped again", () => {
    expect(withPattern(BASE, "stripes").pattern).toBe("stripes");
    expect(withPattern(withPattern(BASE, "stripes"), "stripes").pattern).toBeNull();
    expect(withFit(BASE, "slim").fit).toBe("slim");
    expect(withFit(BASE, "relaxed").fit).toBeNull();
  });

  it("keeps at most two style tags", () => {
    expect(withToggledStyle(BASE, "cozy").style).toEqual(["streetwear", "cozy"]);
    expect(withToggledStyle({ ...BASE, style: ["streetwear", "cozy"] }, "sporty").style).toEqual(["streetwear", "sporty"]);
    expect(withToggledStyle(BASE, "streetwear").style).toEqual([]);
  });

  it("knows when nothing changed", () => {
    expect(sameAttributes(BASE, { ...BASE })).toBe(true);
    expect(sameAttributes(BASE, withKind(BASE, "tee"))).toBe(false);
    expect(sameAttributes(BASE, { ...BASE, colors: ["navy", "white"] })).toBe(false);
  });

  it("shows no kind chip for a kind the shop does not sell", () => {
    expect(chosenKind(BASE)).toBe("hoodie");
    expect(chosenKind({ ...BASE, kind: "bag" })).toBeNull();
    expect(chosenKind({ ...BASE, kind: "not_clothing" })).toBeNull();
    expect(chosenKind({ ...BASE, kind: null })).toBeNull();
  });
});

describe("fitWithin (the long edge is 1024 px, never scaled up)", () => {
  it("shrinks a tall phone photo and a wide screenshot to 1024 on the long side", () => {
    expect(fitWithin(3024, 4032)).toEqual({ width: 768, height: 1024 });
    expect(fitWithin(2532, 1170)).toEqual({ width: 1024, height: 473 });
  });

  it("leaves a smaller picture alone and never returns zero", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1024, 1024)).toEqual({ width: 1024, height: 1024 });
    expect(fitWithin(10_000, 1)).toEqual({ width: 1024, height: 1 });
  });

  it("states its limits", () => {
    expect(TARGET_EDGE).toBe(1024);
    expect(MAX_SOURCE_BYTES).toBe(30 * 1024 * 1024);
  });
});
