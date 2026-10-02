// Audit lows (lane s-audit), fixed in lane m-qwen: two size patterns in planner/parse-request.ts had adjacent
// quantified whitespace runs (quadratic backtracking). They are linear now; this pins the behaviour and the time.
import { describe, expect, it } from "vitest";
import { parseSizes } from "../src/planner/parse-request";

const RUN = 50_000; // 50 times the planner's request cap [F56], so a regression shows up as seconds, not ms
const BUDGET_MS = 1_000; // generous on purpose: the machine is shared; the quadratic form took far longer

function timed(text: string): { readonly sizes: readonly string[]; readonly ms: number } {
  const started = performance.now();
  const sizes = parseSizes(text);
  return { sizes, ms: performance.now() - started };
}

describe("size patterns stay linear on long whitespace runs", () => {
  it("'size' followed by a long run of spaces and no size", () => {
    const out = timed(`size${" ".repeat(RUN)}x`);
    expect(out.sizes).toEqual([]);
    expect(out.ms).toBeLessThan(BUDGET_MS);
  });

  it("'small' followed by a long run of spaces that does not end the text", () => {
    const out = timed(`small${" ".repeat(RUN)}x`);
    expect(out.ms).toBeLessThan(BUDGET_MS);
  });

  it("keeps the old matches: separators, trailing punctuation and spaces", () => {
    expect(parseSizes("size: m")).toEqual(["m"]);
    expect(parseSizes("size - l")).toEqual(["l"]);
    expect(parseSizes("sz xl")).toEqual(["xl"]);
    expect(parseSizes("a tee, small !")).toEqual(["s"]);
    expect(parseSizes("a tee in medium")).toEqual(["m"]);
    expect(parseSizes("I want it large . ")).toEqual(["l"]);
  });
});
