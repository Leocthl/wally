// planner.alternatives: after a budget stop (R3, R4) pick a cheaper item that fits, or return null.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ListingRecord } from "@laisee/core/generated";
import type { PlannerStop, PlannerTraceStep } from "@laisee/core/ports";
import { validateProposeCartInput } from "@laisee/core/schema";
import { createRulePlanner } from "../src/planner/rule-planner";
import { startMockLaya, type MockLaya } from "./support/mock-laya";
import { OPTS, R3_STOP, ctxOf, fixtureListing } from "./support/planner-data";

let mock: MockLaya;
beforeAll(async () => {
  mock = await startMockLaya();
});
afterAll(async () => {
  await mock.close();
});
beforeEach(() => mock.reset());

const tee = fixtureListing("tee");
const socks = fixtureListing("socks");
const jacket = fixtureListing("jacket");
const hoodie = fixtureListing("hoodie");
const STORE = [jacket, tee, socks, hoodie];

async function alternatives(request: string, stop: PlannerStop, records: readonly ListingRecord[] = STORE) {
  const steps: PlannerTraceStep[] = [];
  const planner = createRulePlanner({ catalogue: STORE, layaUrl: mock.url });
  const out = (await planner.alternatives?.(ctxOf(request, records), stop, { ...OPTS, onTrace: (s) => steps.push(s) })) ?? null;
  return { out, steps };
}

describe("after a budget stop", () => {
  it("lets Laya choose among the candidates that fit what is left", async () => {
    const { out } = await alternatives("a denim jacket, or ankle socks if it costs too much", R3_STOP);
    expect(out).toMatchObject({ listing_url: socks.url, items: [{ title: "Ankle socks, 3 pairs (SIMULATED)", qty: 1 }] });
    expect(validateProposeCartInput(out).ok).toBe(true);
  });

  it("never proposes the item that stopped: shipping counts toward what fits", async () => {
    // Jacket unit price HK$520 fits HK$530 left, but with HK$30 shipping the order is HK$550.
    const { out } = await alternatives("a denim jacket", { templateId: "R3.over_remaining", remainingMinor: 53000 });
    expect(out).toBeNull();
    const asked = mock.requests().map((r) => r.rawBody).join("\n");
    expect(asked).not.toContain("Denim jacket");
  });

  it("proposes the stopped item again once it fits", async () => {
    const { out } = await alternatives("a denim jacket", { templateId: "R3.over_remaining", remainingMinor: 55000 });
    expect(out?.items[0]?.title).toBe("Denim jacket (SIMULATED)");
  });

  it("works for the per-purchase cap stop as well", async () => {
    const { out } = await alternatives("ankle socks", { templateId: "R4.over_cap", remainingMinor: 20000 });
    expect(out?.items[0]?.title).toBe("Ankle socks, 3 pairs (SIMULATED)");
  });

  it("returns null without calling Laya when nothing fits", async () => {
    const { out, steps } = await alternatives("ankle socks", { templateId: "R3.over_remaining", remainingMinor: 1000 });
    expect(out).toBeNull();
    expect(mock.requests()).toHaveLength(0);
    expect(steps).toMatchObject([{ question: "next_action_forced", choice: "give_up" }]);
  });

  it("counts the stated quantity when checking what fits", async () => {
    // Two packs of socks are HK$240, over HK$200 left; one pack fits.
    const two = await alternatives("2 packs of ankle socks", { templateId: "R3.over_remaining", remainingMinor: 20000 });
    expect(two.out).toBeNull();
    const one = await alternatives("ankle socks", { templateId: "R3.over_remaining", remainingMinor: 20000 });
    expect(one.out?.items[0]?.qty).toBe(1);
  });

  it("returns null when the request names no cheaper item and Laya sees no clear substitute", async () => {
    const { out } = await alternatives("a denim jacket", R3_STOP);
    expect(out).toBeNull();
  });

  it("lets Laya rank the cheaper items when the request names none of them, and takes a clear winner", async () => {
    mock.set({ scorer: () => ({ fleece_hoodie: 0.8, cotton_tee: 0.1, ankle_socks_3_pairs: 0.1 }) });
    const { out, steps } = await alternatives("a warm jacket", R3_STOP);
    expect(out?.items[0]?.title).toBe("Fleece hoodie (SIMULATED)");
    expect(steps.map((s) => s.question)).toEqual(["next_action_forced", "item_choice", "next_action"]);
    const body = mock.requests()[0]?.body as { questions: Record<string, { instructions: string; criteria: object }> };
    expect(Object.values(body.questions)[0]?.instructions).toMatch(/substitute/i);
  });

  it("returns null when a lone cheaper item is not named by the request", async () => {
    const { out, steps } = await alternatives("a denim jacket", R3_STOP, [jacket, socks]);
    expect(out).toBeNull();
    expect(steps.at(-1)).toMatchObject({ question: "item_forced", choice: "none_of_these" });
    expect(mock.requests()).toHaveLength(0);
  });

  it("returns null when the best substitute wins by less than the margin", async () => {
    const { out } = await alternatives("a tee or a hoodie", R3_STOP);
    expect(out).toBeNull();
  });

  it("reports the replan and the choice through onTrace", async () => {
    const { steps } = await alternatives("ankle socks please", R3_STOP);
    expect(steps.map((s) => [s.step, s.question, s.choice])).toEqual([
      [1, "next_action_forced", "replan_cheaper"],
      [2, "item_forced", "ankle_socks_3_pairs"],
      [3, "next_action", "propose"],
    ]);
    expect(steps[0]).toMatchObject({ probabilities: { replan_cheaper: 1 }, margin: 1 });
  });
});

describe("not a budget stop, or a bad stop", () => {
  it.each([
    "R9.flagged", "R9.unverified", "R10.injection", "R10.seller_risk", "R10.scope", "R2.expired", "R4.ask_above", "R12.price_drift",
  ] as const)("returns null for %s without calling Laya", async (templateId) => {
    const { out } = await alternatives("ankle socks", { templateId, remainingMinor: 54100 });
    expect(out).toBeNull();
    expect(mock.requests()).toHaveLength(0);
  });

  it.each([-1, 10.5, Number.NaN, Number.POSITIVE_INFINITY])("returns null for remainingMinor %s", async (remainingMinor) => {
    const { out } = await alternatives("ankle socks", { templateId: "R3.over_remaining", remainingMinor });
    expect(out).toBeNull();
    expect(mock.requests()).toHaveLength(0);
  });
});

describe("fails closed", () => {
  it("returns null when Laya fails", async () => {
    mock.set({ status: 500 });
    expect((await alternatives("ankle socks", R3_STOP)).out).toBeNull();
  });

  it("returns null for empty candidates", async () => {
    const planner = createRulePlanner({ catalogue: STORE, layaUrl: mock.url });
    expect(await planner.alternatives?.({ intentText: "ankle socks", listings: [] }, R3_STOP, OPTS)).toBeNull();
  });

  it("is deterministic", async () => {
    const a = await alternatives("ankle socks please", R3_STOP);
    mock.reset();
    const b = await alternatives("ankle socks please", R3_STOP);
    expect(b).toEqual(a);
  });
});
