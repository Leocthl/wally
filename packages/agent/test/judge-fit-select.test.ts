import { describe, expect, it } from "vitest";
import { SELECTION_RULE, fitVariant, rankVariants } from "../src/judge/fit/select";
import { row } from "./support/fit-data";

const INJ = { injection_risk: "injection", escalate_or_proceed: "escalate" } as const;
const RISKY = { seller_risk: "high_risk", escalate_or_proceed: "escalate" } as const;

// v-a separates the classes; v-b blocks one legit case; v-c ties v-a on legit approved but its seller score
// ranks an injected (low-risk-labelled) case above the risky seller, so its mean AUC is lower.
const va = [row("l1", {}, { clean: 0.7 }), row("l2", {}, { clean: 0.6 }), row("i1", INJ, { clean: 0.2 }), row("i2", INJ, { clean: 0.1 }), row("r1", RISKY, { high_risk: 0.9 })];
const vb = [row("l1", {}, { clean: 0.7 }), row("l2", {}, { clean: 0.15 }), row("i1", INJ, { clean: 0.2 }), row("i2", INJ, { clean: 0.1 }), row("r1", RISKY, { high_risk: 0.9 })];
const vc = [
  row("l1", {}, { clean: 0.7 }),
  row("l2", {}, { clean: 0.6, high_risk: 0.85 }),
  row("i1", INJ, { clean: 0.2, high_risk: 0.95 }),
  row("i2", INJ, { clean: 0.1 }),
  row("r1", RISKY, { high_risk: 0.9 }),
];

describe("rankVariants", () => {
  const fits = [fitVariant("v-b", vb, 0.5), fitVariant("v-c", vc, 0.5), fitVariant("v-a", va, 0.5)];

  it("ranks by legitimate cases approved, then by mean AUC", () => {
    expect(fits.find((f) => f.id === "v-b")?.fit.counts.legitApproved.k).toBe(1);
    expect(rankVariants(fits).map((f) => f.id)).toEqual(["v-a", "v-c", "v-b"]);
  });

  it("keeps the listed order for exact ties", () => {
    const tie = [fitVariant("first", va, 0.5), fitVariant("second", va, 0.5)];
    expect(rankVariants(tie).map((f) => f.id)).toEqual(["first", "second"]);
  });

  it("reports per-gate AUCs and states its rule", () => {
    const a = fits.find((f) => f.id === "v-a");
    expect(a?.aucs.injection).toBe(1);
    expect(a?.aucs.scope).toBeNull();
    expect(a?.meanAuc).toBe(1);
    expect(fits.find((f) => f.id === "v-c")?.meanAuc).toBeCloseTo(0.875, 9);
    expect(SELECTION_RULE).toMatch(/tuning split/);
  });
});
