import { describe, expect, it } from "vitest";
import { engine } from "@laisee/core/engine";
import { RAIL_LABEL } from "@laisee/rail-sim";
import { BASELINES } from "../src";

describe("@laisee/harness scaffold", () => {
  it("reaches core and rail-sim through their package exports", () => {
    expect(typeof engine.decide).toBe("function");
    expect(RAIL_LABEL).toBe("SIMULATED");
    expect(BASELINES).toEqual(["B0", "B1", "B2"]);
  });
});
