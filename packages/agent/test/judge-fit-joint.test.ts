import { describe, expect, it } from "vitest";
import { auc } from "../src/judge/fit/auc";
import { gateById } from "../src/judge/fit/gates";
import { ESC_SIGNAL_AUC, STOP_CEILING, fitJoint } from "../src/judge/fit/joint";
import { samplesFor } from "../src/judge/fit/metrics";
import { outcomeFor } from "../src/judge/fit/system";
import { row } from "./support/fit-data";

const INJ = { injection_risk: "injection", escalate_or_proceed: "escalate" } as const;
const OFF = { scope_fit: "out_of_scope", escalate_or_proceed: "escalate" } as const;
const RISKY = { seller_risk: "high_risk", escalate_or_proceed: "escalate" } as const;

const tuning = [
  row("legit-1", {}, { clean: 0.6 }),
  row("legit-2", {}, { clean: 0.55 }),
  row("legit-3", {}, { clean: 0.5 }),
  row("legit-4", {}, { clean: 0.3 }),
  row("inj-1", INJ, { clean: 0.25 }),
  row("inj-2", INJ, { clean: 0.2 }),
  row("inj-3", INJ, { clean: 0.15 }),
  row("off-1", OFF, { in_scope: 0.3 }),
  row("risky-1", RISKY, { high_risk: 0.7 }),
  row("pad-1", INJ, null),
];

describe("fitJoint", () => {
  const fit = fitJoint(tuning, { currentTEsc: 0.5 });

  it("approves every legit case while no injected, off-category or risky case gets through", () => {
    expect(fit.counts.legitApproved).toEqual({ k: 4, n: 4 });
    expect(fit.counts.injectedApproved).toEqual({ k: 0, n: 4 });
    expect(fit.counts.outOfScopeApproved).toEqual({ k: 0, n: 1 });
    expect(fit.counts.highRiskApproved).toEqual({ k: 0, n: 1 });
    for (const r of tuning) expect(outcomeFor(r, fit.thresholds) === "APPROVE", r.id).toBe(r.id.startsWith("legit"));
  });

  it("puts each threshold in the middle of its flat stretch", () => {
    // Injection value is 1 - clean: legit at most 0.70, injected at least 0.75, so T_inj lies in (0.70, 0.75].
    expect(fit.thresholds.T_inj).toBe(0.73);
    expect(fit.plateaus.T_inj).toEqual({ lo: 0.71, hi: 0.75 });
    // Scope stops below T: off-category 0.30, legit 0.80, so T_scope lies in (0.30, 0.80].
    expect(fit.thresholds.T_scope).toBe(0.55);
    expect(fit.thresholds.T_sell_esc).toBe(0.45);
  });

  it("sets T_sell_deny above every legit seller score and above T_sell_esc, so a DENY never hits a legit case", () => {
    expect(fit.thresholds.T_sell_deny).toBe(0.46);
    expect(fit.thresholds.T_sell_deny).toBeGreaterThan(fit.thresholds.T_sell_esc);
  });

  it("keeps the current T_esc when escalate_or_proceed carries no signal", () => {
    expect(fit.escAuc).toBe(0.5);
    expect(fit.escSearched).toBe(false);
    expect(fit.thresholds.T_esc).toBe(0.5);
    expect(fit.plateaus.T_esc).toBeNull();
  });

  it("searches T_esc when its AUC reaches the signal bar", () => {
    const signal = [
      row("legit-a", {}, { escalate: 0.2 }),
      row("legit-b", {}, { escalate: 0.25 }),
      row("off-a", OFF, { in_scope: 0.75, escalate: 0.7 }),
      row("off-b", OFF, { in_scope: 0.3, escalate: 0.8 }),
    ];
    const f = fitJoint(signal, { currentTEsc: 0.9 });
    expect(f.escAuc).toBeGreaterThanOrEqual(ESC_SIGNAL_AUC);
    expect(f.escSearched).toBe(true);
    expect(f.counts.outOfScopeApproved.k).toBe(0);
    expect(f.counts.legitApproved).toEqual({ k: 2, n: 2 });
  });

  it("allows at most the stated ceiling of approvals per stop family", () => {
    expect(STOP_CEILING).toBe(0.1);
    // Legit injection values 0.40 to 0.49; one injected case scores 0.35, the other nine 0.60 to 0.68.
    const many = [
      ...Array.from({ length: 10 }, (_, i) => row(`legit-${i}`, {}, { clean: 0.6 - i * 0.01 })),
      row("inj-low", INJ, { clean: 0.65 }),
      ...Array.from({ length: 9 }, (_, i) => row(`inj-${i}`, INJ, { clean: 0.4 - i * 0.01 })),
    ];
    const f = fitJoint(many, { currentTEsc: 0.5 });
    expect(f.counts.injectedApproved).toEqual({ k: 1, n: 10 });
    expect(f.counts.legitApproved).toEqual({ k: 10, n: 10 });
  });

  it("is deterministic", () => {
    expect(fitJoint(tuning, { currentTEsc: 0.5 })).toEqual(fit);
  });
});

describe("auc", () => {
  it("is 1 when every should-stop case is riskier, 0.5 on ties, and null without both classes", () => {
    const gate = gateById("injection_risk");
    expect(auc(samplesFor(gate, tuning))).toBe(1);
    expect(auc(samplesFor(gate, [row("a", {}, { clean: 0.5 }), row("b", INJ, { clean: 0.5 })]))).toBe(0.5);
    expect(auc(samplesFor(gate, [row("a", {}, { clean: 0.5 })]))).toBeNull();
  });
});
