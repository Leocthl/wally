import { describe, expect, it } from "vitest";
import { outcomeFor, suggestedThresholds, systemLevel } from "../src/judge/fit/system";
import type { GateReport } from "../src/judge/fit/report";
import type { GateThresholds } from "../src/judge/fit/thresholds";
import { row } from "./support/fit-data";

const t: GateThresholds = { T_inj: 0.63, T_sell_deny: 0.55, T_sell_esc: 0.42, T_scope: 0.55, T_esc: 0.5 };

describe("outcomeFor (what R10 does with a record, I3 and I5)", () => {
  it("approves a calm record", () => {
    expect(outcomeFor(row("a", {}, {}), t)).toBe("APPROVE");
  });
  it("denies on injection or on a high seller score", () => {
    expect(outcomeFor(row("a", {}, { clean: 0.3 }), t)).toBe("DENY");
    expect(outcomeFor(row("a", {}, { high_risk: 0.6 }), t)).toBe("DENY");
  });
  it("escalates on scope, a middling seller score or the escalate question", () => {
    expect(outcomeFor(row("a", {}, { in_scope: 0.4 }), t)).toBe("ESCALATE");
    expect(outcomeFor(row("a", {}, { high_risk: 0.45 }), t)).toBe("ESCALATE");
    expect(outcomeFor(row("a", {}, { escalate: 0.55 }), t)).toBe("ESCALATE");
  });
  it("takes the strictest outcome when several gates fire", () => {
    expect(outcomeFor(row("a", {}, { in_scope: 0.3, clean: 0.2 }), t)).toBe("DENY");
  });
  it("escalates a failed call, never approves it", () => {
    expect(outcomeFor(row("a", {}, null), t)).toBe("ESCALATE");
  });
});

describe("systemLevel", () => {
  const results = [
    row("legit-1", {}, {}),
    row("legit-2", {}, {}),
    row("legit-3", {}, { clean: 0.3 }),
    row("legit-4", {}, null),
    row("inj-1", { injection_risk: "injection", escalate_or_proceed: "escalate" }, { clean: 0.2 }),
    row("inj-2", { injection_risk: "injection", escalate_or_proceed: "escalate" }, {}),
    row("off-1", { scope_fit: "out_of_scope", escalate_or_proceed: "escalate" }, { in_scope: 0.2 }),
  ];
  const s = systemLevel(results, t);

  it("measures how many legitimate cases are approved, the figure F38 sets a floor for", () => {
    expect(s.legit).toMatchObject({ n: 4, approved: 2, blockedIds: ["legit-3", "legit-4"] });
    expect(s.legit.approvedRate).toBeCloseTo(0.5, 9);
    expect(s.legit.approvedCI?.low).toBeLessThan(0.5);
  });

  it("measures how many cases labelled stop were approved anyway", () => {
    expect(s.shouldStop).toMatchObject({ n: 3, notApproved: 2, approvedIds: ["inj-2"] });
  });

  it("measures how many injection cases were denied, stopped or approved", () => {
    expect(s.injected).toMatchObject({ n: 2, denied: 1, notApproved: 1, approvedIds: ["inj-2"] });
  });
});

describe("suggestedThresholds", () => {
  const gate = (id: GateReport["id"], thresholdName: keyof GateThresholds, suggested: number | null): GateReport =>
    ({ id, thresholdName, suggestion: { kind: suggested === null ? "no_positives" : "budgeted_recall", t: suggested } }) as unknown as GateReport;

  it("takes each gate's suggestion and keeps the current value where there is none", () => {
    const next = suggestedThresholds(
      [gate("scope_fit", "T_scope", 0.62), gate("injection_risk", "T_inj", 0.72), gate("seller_escalate", "T_sell_esc", 0.46), gate("seller_deny", "T_sell_deny", 0.6), gate("escalate_or_proceed", "T_esc", null)],
      t,
    );
    expect(next).toEqual({ T_scope: 0.62, T_inj: 0.72, T_sell_esc: 0.46, T_sell_deny: 0.6, T_esc: 0.5 });
  });

  it("keeps the deny threshold above the escalate threshold", () => {
    const next = suggestedThresholds([gate("seller_escalate", "T_sell_esc", 0.5), gate("seller_deny", "T_sell_deny", 0.46)], t);
    expect(next.T_sell_deny).toBeGreaterThan(next.T_sell_esc);
  });
});
