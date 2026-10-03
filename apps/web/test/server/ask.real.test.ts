// @vitest-environment node
// Ask Wally on the composed booth, real stack: real orchestrator, engine, cart builder, executor, signed log, replay judge
// and seeded RailSim, with the local planner talking to a mock llama-server (packages/agent test support) on loopback. The
// mock plays the model, so these runs are deterministic. Hard rules hold whatever the model says: an off-mandate pick is
// stopped by R6, a repeat is not bought twice, a model that fails leaves the booth working, and the sentence reader falls
// back to the fixed rules and says so.
import type { Decision } from "@wally/core/generated";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { startMockLlama, type ChatBody, type MockLlama } from "../../../../packages/agent/test/support/qwen/mock-llama";
import type { Booth } from "../../server/compose";
import type { RunSummary, TraceEvent } from "../../src/api/types";
import { bootReal, orchestratorIsReal } from "./support/realStack";

const REAL = await orchestratorIsReal();
const BASE = "http://127.0.0.1:8787";

const SHELF = {
  tee: { url: "https://demo-apparel.example/p/tee", title: "Cotton tee (SIMULATED)" },
  socks: { url: "https://demo-apparel.example/p/socks", title: "Ankle socks, 3 pairs (SIMULATED)" },
  jacket: { url: "https://demo-streetwear.example/p/jacket", title: "Denim jacket (SIMULATED)" },
  earbuds: { url: "https://demo-gadgets.example/p/earbuds", title: "Wireless earbuds (SIMULATED)" },
  hoodie: { url: "https://demo-flashdeals.example/p/hoodie", title: "Fleece hoodie (SIMULATED)" },
} as const;

const RULES_ANSWER = { budget_hkd: 500, categories: ["apparel"], period: "this_month", period_count: null, sellers: "verified_only", cap_hkd: null, ask_above_hkd: null, share_percent: null, max_purchases: null, per: "not_stated" };

/** The model: names the shelf item the request mentions; after a budget stop, the socks; a sentence becomes HK$500 rules. */
function model(body: ChatBody): string {
  if (body.response_format.json_schema.name === "wally_rules") return JSON.stringify(RULES_ANSWER);
  const user = body.messages.find((m) => m.role === "user")?.content ?? "";
  const request = /<<<REQUEST\n([\s\S]*?)\nREQUEST>>>/.exec(user)?.[1]?.toLowerCase() ?? "";
  const pick = user.includes("stopped because it cost more") ? SHELF.socks : (Object.entries(SHELF).find(([word]) => request.includes(word))?.[1] ?? null);
  if (pick === null) return JSON.stringify({ action: "ask_shopper", note: "the request names nothing on the shelf" });
  return JSON.stringify({ action: "propose", listing_url: pick.url, items: [{ title: pick.title, qty: 1 }], note: "the request names it" });
}

let llama: MockLlama;
const booths: Booth[] = [];
beforeAll(async () => {
  llama = await startMockLlama({ answer: model });
});
afterAll(async () => llama.close());
afterEach(async () => {
  llama.reset();
  llama.set({ answer: model });
  for (const b of booths.splice(0)) await b.close();
});

async function boot(env: Readonly<Record<string, string>> = {}): Promise<{ booth: Booth; events: TraceEvent[] }> {
  const booth = await bootReal({ PLANNER_PROVIDER: "local", PLANNER_BASE_URL: llama.url, ...env });
  booths.push(booth);
  const events: TraceEvent[] = [];
  booth.backend.subscribe((e) => events.push(e));
  return { booth, events };
}

const post = (booth: Booth, path: string, body: unknown) =>
  booth.app.request(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function run(booth: Booth, path: string, body: unknown): Promise<RunSummary> {
  const res = await post(booth, path, body);
  expect(res.status, await res.clone().text()).toBe(200);
  return (await res.json()) as RunSummary;
}

async function decisions(booth: Booth): Promise<readonly Decision[]> {
  return (await booth.backend.getLog()).entries.flatMap((e) => (e.kind === "DECISION" ? [e.payload] : []));
}

describe.skipIf(!REAL)("Ask Wally on the real stack, local planner on a mock model", () => {
  it("/api/info says which planner runs, who chose it, and what this booth can do", async () => {
    const { booth } = await boot();
    const info = (await (await booth.app.request(`${BASE}/api/info`)).json()) as { planner: { provider: string; note: string }; features: unknown; replayed: boolean };
    expect(info.planner.provider).toBe("local");
    expect(info.planner.note).toContain("Chosen by the operator (PLANNER_PROVIDER=local)");
    expect(info.features).toEqual({ ask: true, alternatives: true, compile: "model", family: true, see: "palette" });
    expect(booth.planner).toMatchObject({ provider: "local", chosenBy: "env" });
  });

  it("a typed request becomes a purchase: planner, cart, judge, engine, a one-off card, paid under the honest merchant", async () => {
    const { booth, events } = await boot();
    const ran = await run(booth, "/api/ask", { requestText: "I want a cotton tee", locale: "en" });
    expect(ran).toMatchObject({ scenario: "custom", outcome: "APPROVE" });
    const mine = events.filter((e) => "runId" in e && e.runId === ran.runId);
    expect(mine[0]).toMatchObject({ type: "run.started", scenario: "custom" });
    expect(mine.at(-1)).toMatchObject({ type: "run.finished", outcome: "APPROVE" });
    const types = mine.map((e) => e.type);
    expect(types.indexOf("decision")).toBeLessThan(types.indexOf("card.minted"));
    expect(types.indexOf("card.minted")).toBeLessThan(types.indexOf("card.event"));
    expect(mine.find((e) => e.type === "card.event")).toMatchObject({ beat: "exact", event: { event: "AUTHORISED", amount_minor: 25_900 } });
    expect(mine.find((e) => e.type === "cart")).toMatchObject({ planner: { provider: "local" } });
    const snap = await booth.backend.snapshot();
    expect(snap.cards).toMatchObject([{ limit_minor: 25_900, state: "USED", simulated: true }]);
    expect(snap.packet).toMatchObject({ spent_minor: 25_900, remaining_minor: 54_100 });
  });

  it("asking again is not buying again: the earlier decision comes back as a duplicate", async () => {
    const { booth } = await boot();
    const first = await run(booth, "/api/ask", { requestText: "a cotton tee" });
    const again = await run(booth, "/api/ask", { requestText: "a cotton tee please" });
    expect(again).toMatchObject({ outcome: "APPROVE", duplicate: true, code: "DUPLICATE", decisionId: first.decisionId });
    expect(await decisions(booth)).toHaveLength(1);
    expect((await booth.backend.snapshot()).cards).toHaveLength(1);
  });

  it("HK$550 stopped by R3 at HK$541 left, then 'See cheaper options' buys the pick that fits", async () => {
    const { booth } = await boot();
    await run(booth, "/api/ask", { requestText: "a cotton tee" });
    const stopped = await run(booth, "/api/ask", { requestText: "a denim jacket" });
    expect(stopped.outcome).toBe("DENY");
    expect((await decisions(booth)).find((d) => d.id === stopped.decisionId)?.explanation?.template_id).toBe("R3.over_remaining");
    const cheaper = await run(booth, "/api/alternatives", { decisionId: stopped.decisionId });
    expect(cheaper).toMatchObject({ outcome: "APPROVE", alternativeTo: stopped.decisionId });
    expect((await booth.backend.snapshot()).cards.map((c) => c.limit_minor)).toEqual([25_900, 12_000]);
    const asked = llama.requests().filter((r) => r.body?.messages.some((m) => m.content.includes("stopped because it cost more")));
    expect(asked).toHaveLength(1); // one replan call, and the over-budget jacket was not offered to the model
    expect(asked[0]?.rawBody).not.toContain(SHELF.jacket.url);
  });

  it("cheaper options after an approval or a stop by another rule are a 409", async () => {
    const { booth } = await boot();
    const bought = await run(booth, "/api/ask", { requestText: "a cotton tee" });
    const flagged = await run(booth, "/api/scenario/flagged", {});
    for (const decisionId of [bought.decisionId, flagged.decisionId]) {
      const res = await post(booth, "/api/alternatives", { decisionId });
      expect(res.status, await res.clone().text()).toBe(409);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("NOT_APPLICABLE");
    }
  });

  it("the model cannot widen the mandate: an off-category pick is stopped by R6 and no card is made", async () => {
    const { booth } = await boot();
    const ran = await run(booth, "/api/ask", { requestText: "wireless earbuds" });
    expect(ran.outcome).toBe("DENY");
    expect((await decisions(booth)).find((d) => d.id === ran.decisionId)?.explanation?.template_id).toBe("R6.off_mandate");
    expect((await booth.backend.snapshot()).cards).toEqual([]);
  });

  it("a model that asks the shopper, answers garbage, errors or is down is an INFO run: nothing decided, the booth still works", async () => {
    const { booth } = await boot();
    for (const patch of [{ answer: () => JSON.stringify({ action: "ask_shopper", note: "which one?" }) }, { answer: () => "not json at all" }, { status: 500 }, { rawResponse: "{}" }]) {
      llama.set({ answer: model, status: 200, rawResponse: null, ...patch });
      const ran = await run(booth, "/api/ask", { requestText: "a cotton tee" });
      expect(ran, JSON.stringify(patch)).toMatchObject({ outcome: "INFO", code: expect.stringMatching(/^NO_PROPOSAL:/) as unknown });
    }
    expect(await decisions(booth)).toEqual([]);
    llama.set({ answer: model, status: 200, rawResponse: null });
    expect((await run(booth, "/api/ask", { requestText: "a cotton tee" })).outcome).toBe("APPROVE");
  });

  it("sentence to rules: the model reads it, code builds the chips; nothing is sealed", async () => {
    const { booth } = await boot();
    const before = (await booth.backend.getLog()).entries.length;
    const res = await post(booth, "/api/compile", { text: "HK$500 this month for clothes, verified sellers only", locale: "en" });
    expect(res.status).toBe(200);
    const result = (await res.json()) as { source: string; rules: { budget: { amount_minor: number } }; labels: { kind: string }[]; confirmRequired: boolean; notes: string[] };
    expect(result).toMatchObject({ source: "model", confirmRequired: true, rules: { budget: { amount_minor: 50_000 } } });
    expect(result.labels.map((l) => l.kind)).toEqual(["budget", "expiry", "category", "sellers"]);
    expect((await booth.backend.getLog()).entries).toHaveLength(before);
  });

  it("sentence to rules with the model down: the fixed rules answer, source says rules, and the notes say why", async () => {
    const { booth } = await boot();
    llama.set({ status: 500 });
    const result = (await (await post(booth, "/api/compile", { text: "HK$500 this month for clothes, verified sellers only", locale: "en" })).json()) as { source: string; rules: { budget: { amount_minor: number } }; notes: string[] };
    expect(result).toMatchObject({ source: "rules", rules: { budget: { amount_minor: 50_000 } } });
    expect(result.notes).toEqual(["The local model could not read this sentence (model_unavailable), so the fixed rules parser read it instead.", "Read by the fixed rules parser, not a model."]);
    const zh = (await (await post(booth, "/api/compile", { text: "HK$500 clothes", locale: "zh-HK" })).json()) as { notes: string[] };
    expect(zh.notes[0]).toContain("本機模型未能讀取這句話");
  });

  it("sentence to rules when the model server is not running at all: the same fallback, and the booth still starts", async () => {
    const { booth } = await boot({ PLANNER_BASE_URL: "http://127.0.0.1:9" }); // nothing listens on the discard port
    const result = (await (await post(booth, "/api/compile", { text: "HK$300 for clothes", locale: "en" })).json()) as { source: string; notes: string[] };
    expect(result.source).toBe("rules");
    expect(result.notes[0]).toContain("could not read this sentence (model_unavailable)");
    expect((await run(booth, "/api/ask", { requestText: "a cotton tee" })).outcome).toBe("INFO"); // no planner answer: nothing decided, no switch to another planner
  });

  it("sentence to rules when the model answers with something unusable: the same fallback, and a sentence with no amount is a 422", async () => {
    const { booth } = await boot();
    llama.set({ answer: () => JSON.stringify({ budget_hkd: null, categories: [], period: "not_stated", period_count: null, sellers: "not_stated", cap_hkd: null, ask_above_hkd: null, share_percent: null, max_purchases: null, per: "not_stated" }) });
    const fallback = (await (await post(booth, "/api/compile", { text: "HK$300 for clothes", locale: "en" })).json()) as { source: string; notes: string[] };
    expect(fallback.source).toBe("rules");
    expect(fallback.notes[0]).toContain("could not read this sentence");
    const none = await post(booth, "/api/compile", { text: "something nice for clothes", locale: "en" });
    expect(none.status).toBe(422);
    expect(((await none.json()) as { error: { code: string } }).error.code).toBe("CANNOT_COMPILE");
  });

  it("with the rule planner or the replay planner the sentence reader is the fixed rules parser and /api/info says so", async () => {
    const { booth } = await boot({ PLANNER_PROVIDER: "replay" });
    const info = (await (await booth.app.request(`${BASE}/api/info`)).json()) as { planner: { provider: string }; features: { ask: boolean; alternatives: boolean; compile: string } };
    expect(info.planner.provider).toBe("replay");
    expect(info.features).toEqual({ ask: true, alternatives: true, compile: "rules", family: true, see: "palette" }); // a recorded cheaper pick exists
    const result = (await (await post(booth, "/api/compile", { text: "HK$800 this month for clothes, verified sellers only", locale: "en" })).json()) as { source: string };
    expect(result.source).toBe("rules");
    expect(llama.requests()).toEqual([]); // the mock model was never called
  });

  it("in replay mode a request with no recording is an INFO run that says so; a recorded one is replayed", async () => {
    const { booth } = await boot({ PLANNER_PROVIDER: "replay" });
    const unknown = await run(booth, "/api/ask", { requestText: "a red scarf for my mum" });
    expect(unknown).toMatchObject({ outcome: "INFO", code: "UNKNOWN_REQUEST", note: expect.stringContaining("Replay mode only knows the sample requests") as unknown });
    expect(await decisions(booth)).toEqual([]);
    expect((await run(booth, "/api/ask", { requestText: "I want a cotton tee" })).outcome).toBe("APPROVE");
  });
});
