// @vitest-environment node
// The booth on the real stack: real orchestrator, engine, cart builder, executor, signed log, replay judge and planner,
// seeded RailSim. Every booth button reaches the outcome and template data/scenarios/booth.json expects, the presenter
// order reproduces the storyline numbers [F20-F23], tamper fails verification at the right seq with real signatures,
// reset returns to HK$800, and a judge that cannot be reached escalates (R10.unavailable) without stopping the server.
import { join } from "node:path";
import type { Decision } from "@laisee/core/generated";
import { afterEach, describe, expect, it } from "vitest";
import type { Booth } from "../../server/compose";
import { loadScenarioTable } from "../../server/booth/scenarioTable";
import { REPO_ROOT } from "../../server/booth/settings";
import { SCENARIO_IDS, type ScenarioId, type TraceEvent } from "../../src/api/types";
import { bootReal, orchestratorIsReal } from "./support/realStack";

const REAL = await orchestratorIsReal();
const TABLE = loadScenarioTable(join(REPO_ROOT, "data/scenarios/booth.json"));
const booths: Booth[] = [];

afterEach(async () => {
  for (const b of booths.splice(0)) await b.close();
});

async function boot(env: Readonly<Record<string, string>> = {}): Promise<{ booth: Booth; events: TraceEvent[] }> {
  const booth = await bootReal(env);
  booths.push(booth);
  const events: TraceEvent[] = [];
  booth.backend.subscribe((e) => events.push(e));
  return { booth, events };
}

async function decisionOf(booth: Booth, id: string | undefined): Promise<Decision | undefined> {
  const entries = (await booth.backend.getLog()).entries;
  return entries.flatMap((e) => (e.kind === "DECISION" ? [e.payload] : [])).find((d) => d.id === id);
}

const cardEvents = (events: readonly TraceEvent[], runId: string): string[] =>
  events.flatMap((e) => (e.type === "card.event" && e.runId === runId ? [e.event.event === "DECLINED" ? `DECLINED:${e.event.decline_code ?? ""}` : e.event.event] : []));

describe.skipIf(!REAL)("booth on the real stack", () => {
  it.each(SCENARIO_IDS.map((id) => [id] as [ScenarioId]))("%s on a fresh HK$800 packet matches booth.json", async (id) => {
    const { booth, events } = await boot();
    const expected = TABLE.scenarios[id].expect;
    const run = await booth.backend.runScenario(id);
    expect(run.outcome, run.note).toBe(expected.outcome);
    if (expected.templateId !== null) expect((await decisionOf(booth, run.decisionId))?.explanation?.template_id).toBe(expected.templateId);
    const seen = cardEvents(events, run.runId);
    expect(seen.slice(seen.length - expected.events.length)).toEqual(expected.events);
    const mine = events.filter((e) => "runId" in e && e.runId === run.runId);
    expect(mine[0]?.type).toBe("run.started");
    expect(mine.at(-1)?.type).toBe("run.finished");
    if (id === "revoke") expect((await booth.backend.snapshot()).cards.map((c) => c.state)).toEqual(["ACTIVE"]);
  });

  it("reproduces the presenter storyline: HK$259 minted, HK$541 left, HK$550 stopped by R3, HK$120 minted [F21-F23]", async () => {
    const { booth } = await boot();
    const normal = await booth.backend.runScenario("normal");
    expect((await booth.backend.snapshot()).cards[0]?.limit_minor).toBe(25_900);
    expect((await booth.backend.snapshot()).packet?.remaining_minor).toBe(54_100);
    expect(normal.outcome).toBe("APPROVE");
    expect((await booth.backend.runScenario("flagged")).outcome).toBe("DENY");
    const overflow = await booth.backend.runScenario("overflow");
    const stopped = await decisionOf(booth, overflow.decisionId);
    expect(stopped?.cart.total_minor).toBe(55_000);
    expect(stopped?.explanation?.template_id).toBe("R3.over_remaining");
    expect((await booth.backend.runScenario("injected")).outcome).toBe("DENY");
    await booth.backend.runScenario("small");
    const snap = await booth.backend.snapshot();
    expect(snap.cards.map((c) => c.limit_minor)).toEqual([25_900, 12_000]);
    expect(snap.packet?.remaining_minor).toBe(42_100);
  });

  it("verifies the real signed chain, fails a tampered copy at the changed seq, passes after restore", async () => {
    const { booth } = await boot();
    await booth.backend.runScenario("normal");
    expect((await booth.backend.verify()).result.ok).toBe(true);
    const view = await booth.backend.tamper();
    expect(view.tampered).not.toBeNull();
    const bad = await booth.backend.verify();
    expect(bad.result).toMatchObject({ ok: false, failedSeq: view.tampered?.seq });
    expect(bad.skipped).toEqual([]);
    await booth.backend.restore();
    expect((await booth.backend.verify()).result.ok).toBe(true);
    const exported = await booth.backend.exportLog();
    expect(exported.log.trim().split("\n")).toHaveLength((await booth.backend.getLog()).entries.length);
  });

  it("reset returns to step 0: a fresh HK$800 packet, one log entry, no cards or escalations", async () => {
    const { booth, events } = await boot();
    await booth.backend.runScenario("normal");
    await booth.backend.runScenario("unverified");
    events.length = 0;
    await booth.backend.reset();
    expect(events[0]?.type).toBe("reset");
    const snap = await booth.backend.snapshot();
    expect(snap.packet?.remaining_minor).toBe(80_000);
    expect(snap.log.entries.map((e) => e.kind)).toEqual(["MANDATE_SEALED"]);
    expect(snap.cards).toHaveLength(0);
    expect(snap.escalations).toHaveLength(0);
  });

  it("escalates every judged decision when Laya cannot be reached, and keeps serving (I5)", async () => {
    const { booth } = await boot({ JUDGE_PROVIDER: "laya", LAYA_BASE_URL: "http://127.0.0.1:9", PLANNER_PROVIDER: "replay" });
    const run = await booth.backend.runScenario("normal");
    expect(run.outcome).toBe("ESCALATE");
    expect((await decisionOf(booth, run.decisionId))?.explanation?.template_id).toBe("R10.unavailable");
    expect((await booth.backend.snapshot()).cards).toHaveLength(0);
    expect((await booth.backend.runScenario("flagged")).outcome).toBe("DENY");
    expect((await booth.backend.info()).judge.provider).toBe("laya");
  });

  it("answers an escalation: the delegator's signed APPROVE mints and pays on the escalated run", async () => {
    const { booth, events } = await boot();
    const run = await booth.backend.runScenario("unverified");
    const answered = await booth.backend.answerEscalation({ decisionId: run.decisionId ?? "", choice: "APPROVE" });
    expect(answered.runId).toBe(run.runId);
    expect(answered.outcome).toBe("APPROVE");
    expect(events.filter((e) => e.type === "card.minted" && e.runId === run.runId)).toHaveLength(1);
    await expect(booth.backend.answerEscalation({ decisionId: run.decisionId ?? "", choice: "APPROVE" })).rejects.toMatchObject({ status: 409 });
  });
});
