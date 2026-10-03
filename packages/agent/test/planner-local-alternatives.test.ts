// Local planner alternatives after a budget stop (R3/R4): code keeps only items whose order total fits what is
// left, the model picks among them, and code re-checks the total. The model never does the arithmetic.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PlannerStop, PlannerTraceStep } from "@wally/core/ports";
import { createLocalPlanner } from "../src/planner/local/local-planner";
import { ALL_FIXTURE_LISTINGS, OPTS, R3_STOP, ctxOf, fixtureListing } from "./support/planner/data";
import { proposeAnswer, schemaChoices, startMockLlama, userMessage, type MockLlama } from "./support/qwen/mock-llama";

let mock: MockLlama;
beforeAll(async () => {
  mock = await startMockLlama();
});
afterAll(async () => {
  await mock.close();
});
beforeEach(() => mock.reset());

const tee = fixtureListing("tee");
const socks = fixtureListing("socks");
const jacket = fixtureListing("jacket");
const planner = () => createLocalPlanner({ catalogue: ALL_FIXTURE_LISTINGS, baseUrl: mock.url });
const ctx = ctxOf("something cheaper, like ankle socks", [jacket, tee, socks]);
const SOCKS = "Ankle socks, 3 pairs (SIMULATED)";

describe("alternatives after a budget stop", () => {
  it("offers the model only the items that fit what is left (HK$541 [F21]: not the HK$550 jacket [F22])", async () => {
    mock.set({ answer: proposeAnswer(socks.url, SOCKS) });
    const out = await planner().alternatives?.(ctx, R3_STOP, OPTS);
    expect(out).toEqual({ listing_url: socks.url, items: [{ title: SOCKS, qty: 1 }], note: "Closest cheaper item to the request: Ankle socks, 3 pairs." });
    const { urls, titles } = schemaChoices(mock.requests()[0]);
    expect(urls).toEqual([tee.url, socks.url]);
    expect(titles).not.toContain("Denim jacket (SIMULATED)");
    expect(userMessage(mock.requests()[0])).toContain("previous cart was stopped");
    expect(userMessage(mock.requests()[0])).not.toContain("541");
  });

  it("re-checks the total in code: a quantity that no longer fits is no proposal", async () => {
    mock.set({ answer: proposeAnswer(socks.url, SOCKS, 5) }); // 5 x HK$120 = HK$600 > HK$541
    expect(await planner().alternatives?.(ctx, R3_STOP, OPTS)).toBeNull();
    mock.set({ answer: proposeAnswer(socks.url, SOCKS, 4) }); // HK$480 fits
    expect((await planner().alternatives?.(ctx, R3_STOP, OPTS))?.items).toEqual([{ title: SOCKS, qty: 4 }]);
  });

  it("works for the R4 cap stop as well", async () => {
    mock.set({ answer: proposeAnswer(socks.url, SOCKS) });
    const stop: PlannerStop = { templateId: "R4.over_cap", remainingMinor: 20_000 };
    expect((await planner().alternatives?.(ctx, stop, OPTS))?.items[0]?.title).toBe(SOCKS);
    expect(schemaChoices(mock.requests()[0]).urls).toEqual([socks.url]);
  });

  it("asks nothing and returns null when nothing fits, with a forced give_up trace", async () => {
    const steps: PlannerTraceStep[] = [];
    const out = await planner().alternatives?.(ctx, { templateId: "R3.over_remaining", remainingMinor: 5_000 }, { ...OPTS, onTrace: (s) => steps.push(s) });
    expect(out).toBeNull();
    expect(mock.requests()).toHaveLength(0);
    expect(steps).toEqual([expect.objectContaining({ question: "local_alternatives_forced", choice: "give_up", source: "generative" })]);
  });

  it.each([
    ["a judge escalation", { templateId: "R10.injection", remainingMinor: 54_100 }],
    ["a negative remainder", { templateId: "R3.over_remaining", remainingMinor: -1 }],
    ["a fractional remainder", { templateId: "R3.over_remaining", remainingMinor: 1.5 }],
  ] as const)("returns null without a model call after %s", async (_name, stop) => {
    expect(await planner().alternatives?.(ctx, stop as unknown as PlannerStop, OPTS)).toBeNull();
    expect(mock.requests()).toHaveLength(0);
  });
});
