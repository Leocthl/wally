// @vitest-environment node
// "See cheaper options" after the Demo button "Shipping tips it over", real stack: the button stops on the jacket alone, so a
// planner shown only that listing has nothing cheaper to pick. The table (data/scenarios/booth.json, overflow.cheaper) names the
// listings and the request the replan runs over (the three demo clothes), the pick still goes through the cart builder, the
// judge, the rules and a one-off card as any cart does, and a stop from another button keeps its honest "nothing cheaper".
import type { Decision } from "@wally/core/generated";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { startMockLaya, type MockLaya } from "../../../../packages/agent/test/support/planner/mock-laya";
import { startMockLlama, type ChatBody, type MockLlama } from "../../../../packages/agent/test/support/qwen/mock-llama";
import type { Booth } from "../../server/compose";
import type { RunSummary } from "../../src/api/types";
import { bootReal, orchestratorIsReal } from "./support/realStack";

const REAL = await orchestratorIsReal();
const BASE = "http://127.0.0.1:8787";
const SOCKS = { url: "https://demo-apparel.example/p/socks", title: "Ankle socks, 3 pairs (SIMULATED)" } as const;

/** The model names the socks after a budget stop and says nothing otherwise (the fixed buttons fall back to their recordings). */
function model(body: ChatBody): string {
  const user = body.messages.find((m) => m.role === "user")?.content ?? "";
  if (!user.includes("stopped because it cost more")) return JSON.stringify({ action: "ask_shopper", note: "no pick" });
  return JSON.stringify({ action: "propose", listing_url: SOCKS.url, items: [{ title: SOCKS.title, qty: 1 }], note: "cheaper" });
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

async function post(booth: Booth, path: string, body: unknown = {}): Promise<RunSummary> {
  const res = await booth.app.request(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  expect(res.status, await res.clone().text()).toBe(200);
  return (await res.json()) as RunSummary;
}

const decisions = async (booth: Booth): Promise<readonly Decision[]> => (await booth.backend.getLog()).entries.flatMap((e) => (e.kind === "DECISION" ? [e.payload] : []));

/** Runs the shipping button and asks for cheaper options; the stop must be R3 and the replan must be a normal run. */
async function shippingThenCheaper(booth: Booth): Promise<{ readonly stopped: RunSummary; readonly cheaper: RunSummary }> {
  const stopped = await post(booth, "/api/scenario/overflow");
  expect(stopped.outcome).toBe("DENY");
  expect((await decisions(booth)).find((d) => d.id === stopped.decisionId)?.explanation?.template_id).toBe("R3.over_remaining");
  return { stopped, cheaper: await post(booth, "/api/alternatives", { decisionId: stopped.decisionId }) };
}

describe.skipIf(!REAL)("See cheaper options after Shipping tips it over", () => {
  it("replay planner (the recorded cheaper pick): the ankle socks are bought, checked by the same rules", async () => {
    const booth = await boot({});
    await post(booth, "/api/scenario/normal"); // HK$541 left, the F22 shape
    const { stopped, cheaper } = await shippingThenCheaper(booth);
    expect(cheaper).toMatchObject({ scenario: "custom", outcome: "APPROVE", alternativeTo: stopped.decisionId });
    expect((await booth.backend.snapshot()).cards.map((c) => c.limit_minor)).toEqual([25_900, 12_000]);
    expect((await booth.backend.verify()).result.ok).toBe(true);
  });

  it("rule planner (Laya decision loop): replans over the demo clothes and buys the pick that fits, on a fresh budget too", async () => {
    const booth = await boot({ PLANNER_PROVIDER: "rule", LAYA_BASE_URL: laya.url });
    const { stopped, cheaper } = await shippingThenCheaper(booth);
    expect(cheaper).toMatchObject({ outcome: "APPROVE", alternativeTo: stopped.decisionId });
    const [card] = (await booth.backend.snapshot()).cards;
    expect(card?.limit_minor).toBeLessThanOrEqual(80_000);
    expect(card?.limit_minor).toBeLessThan(55_000); // cheaper than the jacket's HK$550
    expect(laya.requests().length).toBeGreaterThan(0);
    expect((await booth.backend.verify()).result.ok).toBe(true);
  });

  it("local planner (Qwen): the model is asked for a cheaper pick over the demo clothes and the socks are bought", async () => {
    const booth = await boot({ PLANNER_PROVIDER: "local", PLANNER_BASE_URL: llama.url });
    const { stopped, cheaper } = await shippingThenCheaper(booth);
    expect(cheaper).toMatchObject({ outcome: "APPROVE", alternativeTo: stopped.decisionId });
    expect((await booth.backend.snapshot()).cards.map((c) => c.limit_minor)).toEqual([12_000]);
    const asked = llama.requests().filter((r) => r.body?.messages.some((m) => m.content.includes("stopped because it cost more")));
    expect(asked).toHaveLength(1);
  });

  it("a cheaper pick that is stopped again is stopped by the rules (here: nothing left to spend) and nothing is minted", async () => {
    const booth = await boot({ PLANNER_PROVIDER: "local", PLANNER_BASE_URL: llama.url });
    for (let i = 0; i < 3; i += 1) await post(booth, "/api/scenario/normal"); // HK$777 spent, HK$23 left
    const stopped = await post(booth, "/api/scenario/overflow");
    expect(stopped.outcome).toBe("DENY");
    const cheaper = await post(booth, "/api/alternatives", { decisionId: stopped.decisionId });
    expect(cheaper).toMatchObject({ outcome: "INFO", code: "NO_PROPOSAL:no_alternative", alternativeTo: stopped.decisionId }); // the socks (HK$120) do not fit HK$23: the planner is told to give up
    expect((await booth.backend.snapshot()).cards).toHaveLength(3);
  });

  it("a stop from another button has no cheaper set and stays an honest 'nothing cheaper'", async () => {
    const booth = await boot({});
    for (let i = 0; i < 3; i += 1) await post(booth, "/api/scenario/normal");
    const stopped = await post(booth, "/api/scenario/normal"); // a fourth tee: HK$259 against HK$23 left
    expect(stopped.outcome).toBe("DENY");
    const cheaper = await post(booth, "/api/alternatives", { decisionId: stopped.decisionId });
    expect(cheaper).toMatchObject({ outcome: "INFO", code: "NO_PROPOSAL:no_alternative", alternativeTo: stopped.decisionId });
  });
});
