// Where the quick tour draws its ring (screens/onboarding/coachGeometry.ts): around the target with a little room, never
// outside the screen, and never down over the card that explains it.
import { describe, expect, it } from "vitest";
import { nextMark, spotlightBox, type Box } from "../src/screens/onboarding/coachGeometry";

const VIEW = { width: 390, height: 844 } as const;
const box = (top: number, left: number, width: number, height: number): Box => ({ top, left, width, height });

describe("spotlightBox", () => {
  it("grows the target by the padding on every side", () => {
    expect(spotlightBox(box(100, 50, 200, 80), VIEW, 8, 800)).toEqual(box(92, 42, 216, 96));
  });

  it("stays inside the screen", () => {
    expect(spotlightBox(box(2, 3, 100, 40), VIEW, 8, 800)).toEqual(box(0, 0, 111, 50));
    const right = spotlightBox(box(100, 350, 60, 40), VIEW, 8, 800);
    expect(right.left + right.width).toBeLessThanOrEqual(VIEW.width);
  });

  it("stops above the floor (the top of the card), so the ring never covers what explains it", () => {
    const tall = spotlightBox(box(80, 16, 358, 900), VIEW, 8, 500);
    expect(tall.top + tall.height).toBe(500);
    expect(tall.height).toBeGreaterThan(0);
  });

  it("is never negative or inverted, even for a target that is off screen", () => {
    const off = spotlightBox(box(2000, 16, 100, 40), VIEW, 8, 500);
    expect(off.width).toBeGreaterThanOrEqual(0);
    expect(off.height).toBeGreaterThanOrEqual(0);
  });
});

describe("nextMark", () => {
  const present = [true, false, true];
  it("moves on to the next mark that has something to point at", () => {
    expect(nextMark(present, 0, 1)).toBe(2);
    expect(nextMark(present, 2, -1)).toBe(0);
  });

  it("is null at either end, and when nothing is left", () => {
    expect(nextMark(present, 2, 1)).toBeNull();
    expect(nextMark(present, 0, -1)).toBeNull();
    expect(nextMark([false, false], 0, 1)).toBeNull();
  });

  it("can start from before the first mark", () => {
    expect(nextMark(present, -1, 1)).toBe(0);
    expect(nextMark([false, true], -1, 1)).toBe(1);
  });
});
