import { describe, expect, it } from "vitest";
import { legitimateBlocked, stopsThrough, tallyGates } from "../src/report/breakdown";
import { generateScenarios } from "../src/scenario/generate";
import type { RunOutcome } from "../src/systems/types";
import type { Baseline, Scenario } from "../src/types";
import type { Pair } from "../src/metrics/metrics";

const scenarios = [7, 11, 2026].flatMap((seed) => generateScenarios({ seed, n: 150 }));
const first = (pred: (s: Scenario) => boolean): Scenario => {
  const s = scenarios.find(pred);
  if (s === undefined) throw new Error("no scenario matches");
  return s;
};

const BASE: Omit<RunOutcome, "scenarioId" | "baseline"> = {
  decision: { outcome: "DENY", rule: null, templateId: null, decisionIds: ["dec_x"] },
  judge: null,
  mints: [],
  mintBlocked: null,
  events: [],
  authorisedCount: 0,
  authorisedMinor: 0,
  r12Void: false,
  completed: false,
  latencyMs: null,
  error: null,
  log: null,
};
const outcome = (s: Scenario, baseline: Baseline, over: Partial<RunOutcome> = {}): RunOutcome => ({ ...BASE, scenarioId: s.id, baseline, ...over });
const legit = first((s) => s.label.legitimate && s.label.payment.kind === "authorised");
const stop = first((s) => !s.label.legitimate && s.label.payment.kind === "none" && s.injection === null);
const judgeOk = { provider: "laya", status: "OK", inputTruncated: false, latencyMs: 5, injectionCheck: "PASS" } as const;

describe("legitimate purchases a baseline blocked: which gate, which reason", () => {
  const blocked = (over: Partial<RunOutcome>): Pair => ({ scenario: legit, outcome: outcome(legit, "B2", over) });

  it("lists nothing when every legitimate purchase completed", () => {
    expect(legitimateBlocked([{ scenario: legit, outcome: outcome(legit, "B2", { completed: true, decision: { outcome: "APPROVE", rule: null, templateId: null, decisionIds: ["d"] }, authorisedCount: 1 }) }])).toEqual([]);
  });

  it("names an engine rule as the gate when a hard rule stopped it", () => {
    const rows = legitimateBlocked([blocked({ decision: { outcome: "DENY", rule: "R3", templateId: "R3.over_remaining", decisionIds: ["d"] } })]);
    expect(rows).toEqual([expect.objectContaining({ scenario: legit.id, gate: "engine rule", reason: "R3.over_remaining" })]);
  });

  it("names the judge as the gate for an R10 stop, and says when the judge was unavailable", () => {
    const rows = legitimateBlocked([
      blocked({ decision: { outcome: "DENY", rule: "R10", templateId: "R10.injection", decisionIds: ["d"] }, judge: judgeOk }),
      blocked({ decision: { outcome: "ESCALATE", rule: "R10", templateId: "R10.unavailable", decisionIds: ["d"] }, judge: { ...judgeOk, status: "TIMEOUT" } }),
    ]);
    expect(rows.map((r) => [r.gate, r.reason])).toEqual([
      ["judge", "R10.injection"],
      ["judge", "R10.unavailable (judge TIMEOUT)"],
    ]);
  });

  it("names the rail when an approved cart was refused at mint or declined at the rail", () => {
    const rows = legitimateBlocked([
      blocked({ decision: { outcome: "APPROVE", rule: null, templateId: null, decisionIds: ["d"] }, mintBlocked: "MAX_ACTIVE" }),
      blocked({ decision: { outcome: "APPROVE", rule: null, templateId: null, decisionIds: ["d"] }, events: [{ event: "DECLINED", amountMinor: 1, merchantDomain: "x", declineCode: "OVER_LIMIT" }] }),
    ]);
    expect(rows.map((r) => [r.gate, r.reason])).toEqual([
      ["rail", "mint refused: MAX_ACTIVE"],
      ["rail", "declined OVER_LIMIT"],
    ]);
  });

  it("names the executor when the re-quote voided the approval (R12), and a component error as an error", () => {
    const rows = legitimateBlocked([
      blocked({ decision: { outcome: "APPROVE", rule: null, templateId: null, decisionIds: ["d"] }, r12Void: true }),
      blocked({ error: "judge exploded" }),
    ]);
    expect(rows.map((r) => [r.gate, r.reason])).toEqual([
      ["executor", "R12.price_drift: the price moved before checkout"],
      ["error", "judge exploded"],
    ]);
  });

  it("ignores scenarios that are not legitimate: stopping those is the point", () => {
    expect(legitimateBlocked([{ scenario: stop, outcome: outcome(stop, "B2") }])).toEqual([]);
  });

  it("tallies rows by gate", () => {
    const rows = legitimateBlocked([
      blocked({ decision: { outcome: "DENY", rule: "R3", templateId: "R3.over_remaining", decisionIds: ["d"] } }),
      blocked({ decision: { outcome: "DENY", rule: "R3", templateId: "R3.over_remaining", decisionIds: ["d"] } }),
      blocked({ error: "x" }),
    ]);
    expect(tallyGates(rows)).toEqual({ "engine rule": 2, error: 1 });
  });
});

describe("stop cases that got through: money moved, or a card was minted, where the label says it must not", () => {
  it("lists a stop case that ended with an authorised charge", () => {
    const rows = stopsThrough([{ scenario: stop, outcome: outcome(stop, "B1", { authorisedCount: 1, authorisedMinor: stop.cart.total_minor, mints: [{ cardId: "c", limitMinor: 1, merchantLock: null }] }) }]);
    expect(rows).toEqual([expect.objectContaining({ scenario: stop.id, expected: "none", got: "1 authorised charge, 1 card minted" })]);
  });

  it("lists a stop case that minted a card even if the charge then declined", () => {
    const rows = stopsThrough([{ scenario: stop, outcome: outcome(stop, "B2", { mints: [{ cardId: "c", limitMinor: 1, merchantLock: null }] }) }]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.got).toBe("0 authorised charges, 1 card minted");
  });

  it("lists nothing for a stop case that ended with no card and no charge", () => {
    expect(stopsThrough([{ scenario: stop, outcome: outcome(stop, "B2") }])).toEqual([]);
  });

  it("does not list legitimate purchases", () => {
    expect(stopsThrough([{ scenario: legit, outcome: outcome(legit, "B2", { authorisedCount: 1, authorisedMinor: legit.cart.total_minor }) }])).toEqual([]);
  });

  it("flags whether only the judge stood in the way, so a model-free miss stands out", () => {
    const attack = first((s) => s.injection !== null && !s.injection.hardRulesAlsoStop && !s.label.legitimate);
    const [row] = stopsThrough([{ scenario: attack, outcome: outcome(attack, "B2", { authorisedCount: 1, authorisedMinor: 1 }) }]);
    expect(row?.judgeOnly).toBe(true);
    const [hard] = stopsThrough([{ scenario: stop, outcome: outcome(stop, "B2", { authorisedCount: 1, authorisedMinor: 1 }) }]);
    expect(hard?.judgeOnly).toBe(false);
  });
});
