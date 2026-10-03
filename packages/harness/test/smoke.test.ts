import { describe, expect, it } from "vitest";
import { engine } from "@wally/core/engine";
import { RAIL_LABEL } from "@wally/rail-sim";
import { BASELINES } from "../src";

describe("@wally/harness scaffold", () => {
  it("reaches core and rail-sim through their package exports", () => {
    expect(typeof engine.decide).toBe("function");
    expect(RAIL_LABEL).toBe("SIMULATED");
    expect(BASELINES).toEqual(["B0", "B1", "B2"]);
  });
});
