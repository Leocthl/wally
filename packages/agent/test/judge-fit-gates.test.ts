import { describe, expect, it } from "vitest";
import { GATES, gateById, stops } from "../src/judge/fit/gates";
import { CLEAN_LABELS, answers } from "./support/fit-data";

describe("gates mirror the R10 comparisons", () => {
  it("injection_risk stops at P(suspicious) + P(injection) >= T, equal included", () => {
    const gate = gateById("injection_risk");
    expect(gate.engineValue(answers({ clean: 0.3 }))).toBeCloseTo(0.7, 9);
    expect(stops(gate, answers({ clean: 0.37 }), 0.63)).toBe(true);
    expect(stops(gate, answers({ clean: 0.38 }), 0.63)).toBe(false);
  });

  it("scope_fit stops at P(in_scope) < T, equal passes", () => {
    const gate = gateById("scope_fit");
    expect(stops(gate, answers({ in_scope: 0.54 }), 0.55)).toBe(true);
    expect(stops(gate, answers({ in_scope: 0.55 }), 0.55)).toBe(false);
  });

  it("seller_risk has an escalate gate and a deny gate on the same probability", () => {
    expect(stops(gateById("seller_escalate"), answers({ high_risk: 0.42 }), 0.42)).toBe(true);
    expect(stops(gateById("seller_deny"), answers({ high_risk: 0.42 }), 0.55)).toBe(false);
    expect(stops(gateById("seller_deny"), answers({ high_risk: 0.6 }), 0.55)).toBe(true);
  });

  it("escalate_or_proceed stops at P(escalate) >= T", () => {
    expect(stops(gateById("escalate_or_proceed"), answers({ escalate: 0.5 }), 0.5)).toBe(true);
    expect(stops(gateById("escalate_or_proceed"), answers({ escalate: 0.49 }), 0.5)).toBe(false);
  });

  it("orients risk so that higher always means more dangerous", () => {
    const calm = answers({});
    const bad = answers({ in_scope: 0.1, clean: 0.1, high_risk: 0.9, escalate: 0.9 });
    for (const gate of GATES) expect(gate.risk(bad), gate.id).toBeGreaterThan(gate.risk(calm));
  });
});

describe("ground truth per gate", () => {
  it("maps labels to should-stop, should-pass, or ambiguous", () => {
    expect(gateById("scope_fit").positive({ ...CLEAN_LABELS, scope_fit: "out_of_scope" })).toBe(true);
    expect(gateById("scope_fit").positive(CLEAN_LABELS)).toBe(false);
    expect(gateById("injection_risk").positive({ ...CLEAN_LABELS, injection_risk: "injection" })).toBe(true);
    expect(gateById("injection_risk").positive(CLEAN_LABELS)).toBe(false);
    expect(gateById("injection_risk").positive({ ...CLEAN_LABELS, injection_risk: "suspicious" })).toBeNull();
    expect(gateById("seller_deny").positive({ ...CLEAN_LABELS, seller_risk: "high_risk" })).toBe(true);
    expect(gateById("escalate_or_proceed").positive({ ...CLEAN_LABELS, escalate_or_proceed: "escalate" })).toBe(true);
  });

  it("names the threshold each gate fits", () => {
    expect(GATES.map((g) => g.thresholdName)).toEqual(["T_scope", "T_inj", "T_sell_esc", "T_sell_deny", "T_esc"]);
  });
});
