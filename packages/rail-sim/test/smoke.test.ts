import { describe, expect, it } from "vitest";
import { MERCHANT_MODES, RAIL_LABEL } from "../src";

describe("@wally/rail-sim scaffold", () => {
  it("is labelled SIMULATED and lists the merchant stub modes", () => {
    expect(RAIL_LABEL).toBe("SIMULATED");
    expect(MERCHANT_MODES).toContain("wrong_merchant");
  });
});
