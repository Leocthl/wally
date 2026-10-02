// @vitest-environment node
// Live Laya (judge and rule planner) on the real stack. Skips when Laya's /health does not answer or the orchestrator
// is still the contract stub. Hard rules hold with any model output; the judge can only tighten (I3), so the injected
// listing is never approved. Laya is shared with other lanes, so these tests allow it time.
import { join } from "node:path";
import type { Decision } from "@laisee/core/generated";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Booth } from "../../server/compose";
import { bootReal, layaUp, orchestratorIsReal } from "./support/realStack";

const LAYA = "http://127.0.0.1:8808";
const RUN = (await orchestratorIsReal()) && (await layaUp(LAYA));
const LIVE_TIMEOUT_MS = 60_000;
let booth: Booth;

async function decisionOf(id: string | undefined): Promise<Decision | undefined> {
  const entries = (await booth.backend.getLog()).entries;
  return entries.flatMap((e) => (e.kind === "DECISION" ? [e.payload] : [])).find((d) => d.id === id);
}

describe.skipIf(!RUN)("booth on live Laya (rule planner + Laya judge)", () => {
  beforeAll(async () => {
    booth = await bootReal({ JUDGE_PROVIDER: "laya", LAYA_BASE_URL: LAYA, PLANNER_PROVIDER: "rule", KEY_DIR: join("/nonexistent", "keys") });
  }, LIVE_TIMEOUT_MS);
  afterAll(async () => booth?.close());

  it("normal: a cart is proposed and decided; a card exists only on APPROVE", async () => {
    await booth.backend.reset();
    const run = await booth.backend.runScenario("normal");
    expect(["APPROVE", "ESCALATE"]).toContain(run.outcome);
    const cards = (await booth.backend.snapshot()).cards;
    expect(cards.length).toBe(run.outcome === "APPROVE" ? 1 : 0);
  }, LIVE_TIMEOUT_MS);

  it("flagged: R9 stops the flagged seller whatever Laya says", async () => {
    await booth.backend.reset();
    const run = await booth.backend.runScenario("flagged");
    expect(run.outcome).toBe("DENY");
    expect((await decisionOf(run.decisionId))?.explanation?.template_id).toBe("R9.flagged");
  }, LIVE_TIMEOUT_MS);

  it("injected: never approved (DENY or ESCALATE)", async () => {
    await booth.backend.reset();
    const run = await booth.backend.runScenario("injected");
    expect(["DENY", "ESCALATE"]).toContain(run.outcome);
    expect((await booth.backend.snapshot()).cards).toHaveLength(0);
  }, LIVE_TIMEOUT_MS);

  it("off_category: the planner proposes the earbuds and R6 stops them", async () => {
    await booth.backend.reset();
    const run = await booth.backend.runScenario("off_category");
    expect(run.outcome).toBe("DENY");
    expect((await decisionOf(run.decisionId))?.explanation?.template_id).toBe("R6.off_mandate");
  }, LIVE_TIMEOUT_MS);
});
