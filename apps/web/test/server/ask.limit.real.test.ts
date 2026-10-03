// @vitest-environment node
// A price limit in a typed Ask on the composed booth, real stack: real orchestrator, engine, cart builder, executor, signed
// log, replay judge and seeded RailSim, with the planner on a mock model server on loopback (Qwen's llama-server, then Laya).
// "a cotton tee under HK$50" must not end as an approved HK$259 card: the planner's pick is priced by code and a cart above the
// limit the shopper typed is no proposal (NO_PROPOSAL, nothing decided, no card), which the page answers with the reader's list.
// The fixed Demo scenarios never meet the limit and run as before.
import type { Decision } from "@wally/core/generated";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { startMockLaya, type MockLaya } from "../../../../packages/agent/test/support/planner/mock-laya";
import { startMockLlama, type ChatBody, type MockLlama } from "../../../../packages/agent/test/support/qwen/mock-llama";
import type { Booth } from "../../server/compose";
import type { RunSummary } from "../../src/api/types";
import { bootReal, orchestratorIsReal } from "./support/realStack";

const REAL = await orchestratorIsReal();
const BASE = "http://127.0.0.1:8787";

const SHELF = {
  tee: { url: "https://demo-apparel.example/p/tee", title: "Cotton tee (SIMULATED)" },
  jacket: { url: "https://demo-streetwear.example/p/jacket", title: "Denim jacket (SIMULATED)" },
} as const;

/** The model names the shelf item the request mentions, whatever the request says about money. */
function model(body: ChatBody): string {
  const user = body.messages.find((m) => m.role === "user")?.content ?? "";
  const request = /<<<REQUEST\n([\s\S]*?)\nREQUEST>>>/.exec(user)?.[1]?.toLowerCase() ?? "";
  const pick = Object.entries(SHELF).find(([word]) => request.includes(word))?.[1] ?? null;
  if (pick === null) return JSON.stringify({ action: "ask_shopper", note: "the request names nothing on the shelf" });
  return JSON.stringify({ action: "propose", listing_url: pick.url, items: [{ title: pick.title, qty: 1 }], note: "the request names it" });
}

let llama: MockLlama;
let laya: MockLaya;
const booths: Booth[] = [];
beforeAll(async () => {
  llama = await startMockLlama({ answer: model });
  laya = await startMockLaya();
});
afterAll(async () => {
  await llama.close();
  await laya.close();
});
afterEach(async () => {
  llama.reset();
  llama.set({ answer: model });
  laya.reset();
  for (const b of booths.splice(0)) await b.close();
});

async function boot(env: Readonly<Record<string, string>>): Promise<Booth> {
  const booth = await bootReal(env);
  booths.push(booth);
  return booth;
}
const withQwen = (): Promise<Booth> => boot({ PLANNER_PROVIDER: "local", PLANNER_BASE_URL: llama.url });
const withLaya = (): Promise<Booth> => boot({ PLANNER_PROVIDER: "rule", LAYA_BASE_URL: laya.url });

async function post(booth: Booth, path: string, body: unknown): Promise<RunSummary> {
  const res = await booth.app.request(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  expect(res.status, await res.clone().text()).toBe(200);
  return (await res.json()) as RunSummary;
}
const ask = (booth: Booth, requestText: string): Promise<RunSummary> => post(booth, "/api/ask", { requestText });

const decisions = async (booth: Booth): Promise<readonly Decision[]> => (await booth.backend.getLog()).entries.flatMap((e) => (e.kind === "DECISION" ? [e.payload] : []));

/** Nothing was decided: no decision, no card, nothing spent, and the signed log still verifies. */
async function expectNothingDecided(booth: Booth): Promise<void> {
  expect(await decisions(booth)).toEqual([]);
  const snap = await booth.backend.snapshot();
  expect(snap.cards).toEqual([]);
  expect(snap.packet).toMatchObject({ spent_minor: 0 });
  expect((await booth.backend.verify()).result.ok).toBe(true);
}

describe.skipIf(!REAL)("a price limit in a typed Ask, local planner on a mock model", () => {
  it("'a cotton tee under HK$50' is no proposal: the HK$259 tee is dropped, nothing is decided, no card is made", async () => {
    const booth = await withQwen();
    const ran = await ask(booth, "a cotton tee under HK$50");
    expect(ran).toMatchObject({ scenario: "custom", outcome: "INFO", code: "NO_PROPOSAL:planner_null" });
    expect(llama.requests().length).toBeGreaterThan(0); // the model was asked as always; only its pick was checked
    await expectNothingDecided(booth);
  });

  it("a limit the tee fits under is bought as before, and so is a request with no limit", async () => {
    const booth = await withQwen();
    expect(await ask(booth, "a cotton tee under HK$300")).toMatchObject({ outcome: "APPROVE" });
    expect((await booth.backend.snapshot()).cards.map((c) => c.limit_minor)).toEqual([25_900]);
    const other = await withQwen();
    expect(await ask(other, "a cotton tee")).toMatchObject({ outcome: "APPROVE" });
  });

  it("reads the Chinese limits too: 一百蚊以下 drops the HK$259 tee, 三百蚊以下 keeps it", async () => {
    const booth = await withQwen();
    expect(await ask(booth, "cotton tee 一百蚊以下")).toMatchObject({ outcome: "INFO", code: "NO_PROPOSAL:planner_null" });
    await expectNothingDecided(booth);
    expect(await ask(booth, "cotton tee 三百蚊以下")).toMatchObject({ outcome: "APPROVE" });
  });

  it("counts shipping: the jacket is HK$520 plus HK$30, so HK$540 drops it and HK$550 does not", async () => {
    const booth = await withQwen();
    expect(await ask(booth, "a denim jacket under 540")).toMatchObject({ outcome: "INFO", code: "NO_PROPOSAL:planner_null" });
    await expectNothingDecided(booth);
    const bought = await ask(booth, "a denim jacket under 550");
    expect(bought.outcome).not.toBe("INFO");
    expect(bought.decisionId).toBeDefined();
  });

  it("the booth works after a limit stop, and the fixed Demo scenarios run unchanged", async () => {
    const booth = await withQwen();
    await ask(booth, "a cotton tee under HK$50");
    expect(await post(booth, "/api/scenario/normal", {})).toMatchObject({ scenario: "normal", outcome: "APPROVE" });
    expect(await post(booth, "/api/scenario/flagged", {})).toMatchObject({ scenario: "flagged", outcome: "DENY" });
    expect(await post(booth, "/api/scenario/overflow", {})).toMatchObject({ scenario: "overflow", outcome: "DENY" });
    expect((await booth.backend.verify()).result.ok).toBe(true);
  });
});

describe.skipIf(!REAL)("a price limit in a typed Ask, rule planner (Laya decision loop) on a mock server", () => {
  it("'a cotton tee' is bought, and 'a cotton tee under HK$50' is no proposal", async () => {
    const booth = await withLaya();
    expect(await ask(booth, "a cotton tee under HK$50")).toMatchObject({ scenario: "custom", outcome: "INFO", code: "NO_PROPOSAL:planner_null" });
    expect(laya.requests().length).toBeGreaterThan(0); // Laya was asked as always
    await expectNothingDecided(booth);
    expect(await ask(booth, "a cotton tee under HK$300")).toMatchObject({ outcome: "APPROVE" });
  });

  it("reads 三百蚊以下 and 一百蚊以下 the same way", async () => {
    const booth = await withLaya();
    expect(await ask(booth, "cotton tee 一百蚊以下")).toMatchObject({ outcome: "INFO", code: "NO_PROPOSAL:planner_null" });
    expect(await ask(booth, "cotton tee 三百蚊以下")).toMatchObject({ outcome: "APPROVE" });
  });
});
