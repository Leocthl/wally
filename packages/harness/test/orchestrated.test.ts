// The orchestrated world must hand B2 exactly what B0 and B1 are given: the same mandate, the same packet and the same cart.
// B0 and B1 read them off the scenario; B2 gets them from a signed log and from core's cart builder, so each is checked
// against the product's own code: the orchestrator's fold of the seeded log and the cart the orchestrator builds.
import { describe, expect, it } from "vitest";
import { createComponents } from "../src/factory";
import { SEAL_AGO_S } from "../src/scenario/history";
import { generateScenarios } from "../src/scenario/generate";
import { keywordJudge } from "./support/keyword-model";
import { scenarios } from "./support/rig";
import { RUN_MS } from "./support/timeouts";

const components = createComponents();
const world = (s: (typeof scenarios)[number]) => components.orchestrated(s, keywordJudge());

describe("the seeded log folds to the packet the scenario describes", () => {
  it("is the packet core's own fold gives, field for field, for every scenario", async () => {
    const wrong: string[] = [];
    for (const s of scenarios) {
      const snapshot = await (await world(s)).orchestrator.snapshot();
      if (JSON.stringify(snapshot.packet) !== JSON.stringify(s.packet)) wrong.push(`${s.id} ${s.variant}\n  log:      ${JSON.stringify(snapshot.packet)}\n  scenario: ${JSON.stringify(s.packet)}`);
    }
    expect(wrong).toEqual([]);
  }, RUN_MS);

  it("is the mandate the credential carries", async () => {
    for (const s of scenarios.slice(0, 40)) expect((await (await world(s)).orchestrator.snapshot()).mandate, s.id).toEqual(s.mandate);
  }, RUN_MS);

  it("seals before the history and the decision, and the history is all in the past", async () => {
    const s = scenarios.find((x) => x.history.length > 2);
    if (s === undefined) throw new Error("no scenario with history");
    const log = (await (await world(s)).orchestrator.snapshot()).log;
    expect(log[0]?.kind).toBe("MANDATE_SEALED");
    expect(Date.parse(log[0]?.ts ?? "")).toBe(Date.parse(s.now) - SEAL_AGO_S * 1000);
    for (const entry of log) expect(Date.parse(entry.ts), `${entry.seq} ${entry.kind}`).toBeLessThanOrEqual(Date.parse(s.now));
  });
});

describe("the cart the orchestrator builds is the cart the baselines are given", () => {
  it("is identical for every scenario with a proposal, down to the cart id and the time", async () => {
    const wrong: string[] = [];
    for (const s of scenarios) {
      const w = await world(s);
      const result = await w.orchestrator.submit({ requestText: s.requestText, listings: [s.listing], checkout: "none" });
      const built = result.ok && "decision" in result ? result.decision.cart : null;
      if (JSON.stringify(built) !== JSON.stringify(s.cart)) wrong.push(`${s.id} ${s.variant}`);
    }
    expect(wrong).toEqual([]);
  }, RUN_MS);
});

describe("the scenario set a run starts from", () => {
  it("builds a cart for every scenario of every seed it is run with", () => {
    for (const seed of [7, 11, 42, 2026]) expect(() => generateScenarios({ seed, n: 150 })).not.toThrow();
  });
});
