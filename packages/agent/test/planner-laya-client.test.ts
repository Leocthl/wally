// Local Laya client: option-order rotation averaging and fail-closed handling, against the mock server.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createLayaClient, type ChoiceSpec } from "../src/planner/laya-client";
import { startMockLaya, type MockLaya } from "./support/planner/mock-laya";

let mock: MockLaya;
beforeAll(async () => {
  mock = await startMockLaya();
});
afterAll(async () => {
  await mock.close();
});
beforeEach(() => mock.reset());

const SPEC: ChoiceSpec = {
  id: "item_choice",
  instructions: "Which item is the shopper asking for?",
  criteria: { cotton_tee: "Cotton tee", ankle_socks: "Ankle socks", none_of_these: "unclear or no listed item matches" },
  state: { request: "I want a cotton tee" },
};
const T = 5_000;

describe("request shape", () => {
  it("pins the model, sends the state and one rotation of every option order", async () => {
    const out = await createLayaClient({ baseUrl: mock.url }).choose(SPEC, T);
    expect(out.ok).toBe(true);
    const [req] = mock.requests();
    const body = req?.body as { model: string; state: unknown; questions: Record<string, { option_order: number[]; criteria: object }> };
    expect(req?.path).toBe("/v1/systemone");
    expect(body.model).toBe("typed-decisions");
    expect(body.state).toEqual({ request: "I want a cotton tee" });
    expect(Object.keys(body.questions)).toEqual(["item_choice__r0", "item_choice__r1", "item_choice__r2"]);
    expect(Object.values(body.questions).map((q) => q.option_order)).toEqual([[0, 1, 2], [1, 2, 0], [2, 0, 1]]);
  });

  it("sends exactly one HTTP request per decision", async () => {
    await createLayaClient({ baseUrl: mock.url }).choose(SPEC, T);
    expect(mock.requests()).toHaveLength(1);
  });
});

describe("result", () => {
  it("returns averaged probabilities that sum to one, the argmax and the top-two margin", async () => {
    const out = await createLayaClient({ baseUrl: mock.url }).choose(SPEC, T);
    if (!out.ok) throw new Error(out.reason);
    const { probabilities, choice, margin } = out.value;
    expect(choice).toBe("cotton_tee");
    expect(Object.keys(probabilities).sort()).toEqual(["ankle_socks", "cotton_tee", "none_of_these"]);
    expect(Object.values(probabilities).reduce((a, c) => a + c, 0)).toBeCloseTo(1, 2);
    const sorted = Object.values(probabilities).sort((a, b) => b - a);
    expect(margin).toBeCloseTo((sorted[0] ?? 0) - (sorted[1] ?? 0), 6);
  });

  it("cancels a position bias with the rotation average", async () => {
    // Weights: A 0.5, B 0.4, none 0.1. With +120% weight on the first-shown option the canonical order
    // alone picks B only when B is first; the rotation average must still prefer A.
    const scorer = () => ({ a: 0.5, b: 0.4, none_of_these: 0.1 });
    mock.set({ scorer, firstPositionBias: 1.2 });
    const spec: ChoiceSpec = { ...SPEC, criteria: { b: "B", a: "A", none_of_these: "none" } };
    const out = await createLayaClient({ baseUrl: mock.url }).choose(spec, T);
    if (!out.ok) throw new Error(out.reason);
    expect(out.value.choice).toBe("a");
    expect(out.value.probabilities["a"]).toBeGreaterThan(out.value.probabilities["b"] ?? 1);
  });

  it("is deterministic for the same input", async () => {
    const client = createLayaClient({ baseUrl: mock.url });
    const a = await client.choose(SPEC, T);
    const b = await client.choose(SPEC, T);
    expect(a.ok && b.ok && a.value.probabilities).toEqual(b.ok && b.value.probabilities);
  });
});

describe("fails closed (I5)", () => {
  const reason = async (patch: Parameters<MockLaya["set"]>[0], spec: ChoiceSpec = SPEC) => {
    mock.set(patch);
    const out = await createLayaClient({ baseUrl: mock.url }).choose(spec, 400);
    expect(out.ok).toBe(false);
    return out.ok ? "" : out.reason;
  };

  it("on HTTP 500", async () => expect(await reason({ status: 500 })).toMatch(/500/));
  it("on malformed JSON", async () => expect(await reason({ rawResponse: "{not json" })).toMatch(/json/i));
  it("on an unexpected response shape", async () => expect(await reason({ rawResponse: '{"answers":{}}' })).toMatch(/answer/i));
  it("when a label is missing from the probabilities", async () => expect(await reason({ dropLabel: "ankle_socks" })).toMatch(/label/i));
  it("when the server reports truncated input", async () => expect(await reason({ truncated: true })).toMatch(/truncat/i));
  it("on probabilities that do not sum to one", async () => {
    const raw = JSON.stringify({
      answers: Object.fromEntries(["item_choice__r0", "item_choice__r1", "item_choice__r2"].map((id) => [id, { choice: "cotton_tee", probabilities: { cotton_tee: 0.9, ankle_socks: 0.9, none_of_these: 0.9 } }])),
      usage: { truncated: false, truncated_questions: [] },
    });
    expect(await reason({ rawResponse: raw })).toMatch(/sum/i);
  });
  it("on a timeout", async () => expect(await reason({ delayMs: 1_000 })).toMatch(/timeout|abort/i));

  it("when the server is not there", async () => {
    const dead = await startMockLaya();
    const url = dead.url;
    await dead.close();
    const out = await createLayaClient({ baseUrl: url }).choose(SPEC, 400);
    expect(out.ok).toBe(false);
  });

  it("without sending anything when the deadline has already passed", async () => {
    const out = await createLayaClient({ baseUrl: mock.url }).choose(SPEC, 0);
    expect(out.ok).toBe(false);
    expect(mock.requests()).toHaveLength(0);
  });

  it("for fewer than two options", async () => {
    const out = await createLayaClient({ baseUrl: mock.url }).choose({ ...SPEC, criteria: { only: "one" } }, T);
    expect(out.ok).toBe(false);
    expect(mock.requests()).toHaveLength(0);
  });
});

describe("only talks to the local server", () => {
  it.each(["https://api.example.com", "http://10.0.0.5:8808", "http://laya.example"])("refuses %s", (baseUrl) => {
    expect(() => createLayaClient({ baseUrl })).toThrow(/loopback/i);
  });
  it.each(["http://127.0.0.1:8808", "http://localhost:8808", "http://[::1]:8808"])("accepts %s", (baseUrl) => {
    expect(() => createLayaClient({ baseUrl })).not.toThrow();
  });
});
