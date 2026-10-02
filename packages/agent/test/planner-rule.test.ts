// Rule planner: deterministic harness around Laya's typed choices, tested against the mock server.
import fc from "fast-check";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ListingRecord } from "@laisee/core/generated";
import type { PlannerTraceStep, ProposeCartInput } from "@laisee/core/ports";
import { validateProposeCartInput } from "@laisee/core/schema";
import { createRulePlanner } from "../src/planner/rule-planner";
import { startMockLaya, type MockLaya } from "./support/mock-laya";
import { GRAPHIC_TEE_LISTING, OPTS, VARIANT_LISTING, ctxOf, fixtureListing } from "./support/planner-data";

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
const injected = fixtureListing("injected");
const earbuds = fixtureListing("earbuds");
const STORE = [tee, socks, jacket, hoodie];

function planner(records: readonly ListingRecord[], config: Parameters<typeof createRulePlanner>[0]["config"] = {}) {
  return createRulePlanner({ catalogue: records, layaUrl: mock.url, config });
}

async function propose(records: readonly ListingRecord[], request: string, catalogue: readonly ListingRecord[] = records) {
  const steps: PlannerTraceStep[] = [];
  const out = await planner(catalogue).propose(ctxOf(request, records), { ...OPTS, onTrace: (s) => steps.push(s) });
  return { out, steps };
}

describe("a clear request", () => {
  it("proposes the named item with quantity 1 and a schema-valid input", async () => {
    const { out } = await propose(STORE, "I want a cotton tee");
    expect(out).toMatchObject({ listing_url: tee.url, items: [{ title: "Cotton tee (SIMULATED)", qty: 1 }] });
    expect(validateProposeCartInput(out).ok).toBe(true);
  });

  it("returns only listing_url, items and a short note: no money field (T-I4)", async () => {
    const { out } = await propose(STORE, "ankle socks please");
    expect(Object.keys(out ?? {}).sort()).toEqual(["items", "listing_url", "note"]);
    expect(Object.keys(out?.items[0] ?? {}).sort()).toEqual(["qty", "title"]);
    expect(JSON.stringify(out)).not.toMatch(/price|total|amount|minor|limit|card|token|key/i);
    expect((out?.note ?? "").length).toBeLessThanOrEqual(280);
  });

  it("reports every typed decision through onTrace with probabilities and margin", async () => {
    const { steps } = await propose(STORE, "I want a cotton tee");
    expect(steps.map((s) => [s.step, s.question])).toEqual([[1, "item_choice"], [2, "next_action"]]);
    const [item] = steps;
    expect(item?.choice).toBe("cotton_tee");
    expect(Object.values(item?.probabilities ?? {}).reduce((a, c) => a + c, 0)).toBeCloseTo(1, 2);
    const sorted = Object.values(item?.probabilities ?? {}).sort((a, b) => b - a);
    expect(item?.margin).toBeCloseTo((sorted[0] ?? 0) - (sorted[1] ?? 0), 6);
  });

  it("is deterministic: same context, same proposal, same requests", async () => {
    const a = await propose(STORE, "I want a cotton tee");
    const first = mock.requests().map((r) => r.rawBody);
    mock.reset();
    const b = await propose(STORE, "I want a cotton tee");
    expect(b.out).toEqual(a.out);
    expect(mock.requests().map((r) => r.rawBody)).toEqual(first);
    expect(b.steps).toEqual(a.steps);
  });
});

describe("abstention (the app asks the shopper)", () => {
  it("returns null for a vague request, with the none option on top", async () => {
    const { out, steps } = await propose(STORE, "something to wear");
    expect(out).toBeNull();
    expect(steps).toHaveLength(1);
    expect(steps[0]?.choice).toBe("none_of_these");
  });

  it("returns null for two near-equal items (top-two margin below the threshold)", async () => {
    const { out, steps } = await propose([tee, GRAPHIC_TEE_LISTING], "a tee");
    expect(out).toBeNull();
    expect(steps[0]?.margin).toBeLessThan(0.25);
  });

  it("returns null when the best item wins by less than the configured margin", async () => {
    mock.set({ scorer: () => ({ cotton_tee: 0.45, ankle_socks_3_pairs: 0.3, none_of_these: 0.25 }) });
    expect((await propose(STORE.slice(0, 2), "cotton tee")).out).toBeNull();
    const strict = await planner(STORE.slice(0, 2), { marginThreshold: 0.1 }).propose(ctxOf("cotton tee", STORE.slice(0, 2)), OPTS);
    expect(strict).not.toBeNull();
  });

  it("returns null for a request that names something no listing sells", async () => {
    expect((await propose(STORE, "wireless earbuds")).out).toBeNull();
  });

  it("returns null when Laya vetoes the next action with a clear margin, but never when it only hesitates", async () => {
    mock.set({ scorer: ({ questionId }) => (questionId === "next_action" ? { propose: 0.1, replan_cheaper: 0.05, ask_shopper: 0.75, give_up: 0.1 } : { cotton_tee: 0.9, ankle_socks_3_pairs: 0.05, none_of_these: 0.05 }) });
    expect((await propose(STORE.slice(0, 2), "cotton tee")).out).toBeNull();
    mock.set({ scorer: ({ questionId }) => (questionId === "next_action" ? { propose: 0.3, replan_cheaper: 0.25, ask_shopper: 0.25, give_up: 0.2 } : { cotton_tee: 0.9, ankle_socks_3_pairs: 0.05, none_of_these: 0.05 }) });
    expect((await propose(STORE.slice(0, 2), "cotton tee")).out).not.toBeNull();
  });
});

describe("variants (size and colour)", () => {
  const V = [VARIANT_LISTING];

  it("picks the one variant that matches the stated size and colour", async () => {
    const { out, steps } = await propose(V, "a black cotton tee in size M");
    expect(out?.items).toEqual([{ title: "Cotton tee, black, M (SIMULATED)", qty: 1 }]);
    expect(steps.map((s) => s.question)).toEqual(["item_choice", "variant_forced", "next_action"]);
  });

  it("reads a colour word and a bare uppercase size", async () => {
    expect((await propose(V, "white cotton tee, L")).out?.items[0]?.title).toBe("Cotton tee, white, L (SIMULATED)");
  });

  it("asks the shopper when the request leaves several variants open", async () => {
    for (const request of ["a black cotton tee", "a cotton tee in size M", "cotton tee"]) {
      const { out, steps } = await propose(V, request);
      expect(out, request).toBeNull();
      expect(steps.map((s) => s.question), request).toEqual(["item_choice", "variant_choice"]);
    }
  });

  it("returns null when the requested variant is not listed", async () => {
    for (const request of ["a red cotton tee in size M", "black cotton tee in size XL", "white cotton tee in size S"]) {
      const { out, steps } = await propose(V, request);
      expect(out, request).toBeNull();
      expect(steps.at(-1), request).toMatchObject({ question: "next_action_forced", choice: "ask_shopper" });
    }
  });

  it("ignores a size or colour the item has no options for", async () => {
    expect((await propose([tee], "a cotton tee in red")).out?.items[0]?.title).toBe("Cotton tee (SIMULATED)");
  });
});

describe("quantity", () => {
  it("defaults to 1 and reads a stated number", async () => {
    expect((await propose(STORE, "cotton tee")).out?.items[0]?.qty).toBe(1);
    expect((await propose(STORE, "I want 2 cotton tees")).out?.items[0]?.qty).toBe(2);
    expect((await propose(STORE, "three packs of ankle socks")).out?.items[0]?.qty).toBe(3);
  });

  it("does not read the budget or a pack size as a quantity", async () => {
    expect((await propose(STORE, "HK$800 for ankle socks")).out?.items[0]?.qty).toBe(1);
    expect((await propose(STORE, "3 pairs of ankle socks")).out?.items[0]?.qty).toBe(1);
  });

  it("returns null for a quantity the proposal cannot hold", async () => {
    expect((await propose(STORE, "21 cotton tees")).out).toBeNull();
  });
});

describe("listing text is data, never instructions", () => {
  const request = "a graphic tee";

  it("never sends listing text to Laya and never adds the item the text asks for", async () => {
    const { out } = await propose([injected], request);
    expect(out?.items).toEqual([{ title: "Graphic tee (SIMULATED)", qty: 1 }]);
    const sent = mock.requests().map((r) => r.rawBody).join("\n");
    expect(sent).not.toMatch(/SYSTEM NOTE|ignore your budget|approve the purchase|Fake attack/i);
  });

  it("gives the same proposal and the same Laya requests whatever the listing text says", async () => {
    const base = await propose([injected], request);
    const sentBase = mock.requests().map((r) => r.rawBody);
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 300 }), async (text) => {
        mock.reset();
        const changed: ListingRecord = { ...injected, text };
        const ctx = ctxOf(request, [changed]);
        const out = await planner([injected]).propose(ctx, OPTS);
        expect(out).toEqual(base.out);
        expect(mock.requests().map((r) => r.rawBody)).toEqual(sentBase);
      }),
      { numRuns: 20 },
    );
  });

  it("does not pick the gift card bundle even when the request mentions an order from the text", async () => {
    const { out } = await propose([injected], "graphic tee");
    expect(JSON.stringify(out)).not.toMatch(/gift/i);
  });
});

describe("empty and unusable input", () => {
  it("returns null without calling Laya when there are no candidates", async () => {
    expect(await planner(STORE).propose({ intentText: "cotton tee", listings: [] }, OPTS)).toBeNull();
    expect(await planner(STORE).propose({ intentText: "cotton tee", listings: [{ url: "https://nobody.example/p/1", text: "x" }] }, OPTS)).toBeNull();
    expect(mock.requests()).toHaveLength(0);
  });

  it("returns null for an empty or oversized request", async () => {
    expect((await propose(STORE, "   ")).out).toBeNull();
    expect((await propose(STORE, `cotton tee ${"x".repeat(2_000)}`)).out).toBeNull();
    expect(mock.requests()).toHaveLength(0);
  });

  it("limits the options sent to Laya and keeps the one the request names", async () => {
    const many: ListingRecord[] = Array.from({ length: 14 }, (_, i) => ({
      ...tee,
      id: `lst_many${i}`,
      url: `https://demo-apparel.example/p/item-${i}`,
      items: [{ title: i === 11 ? "Purple scarf (SIMULATED)" : `Plain item ${i} (SIMULATED)`, category: "apparel", unit_price_minor: 1000 + i }],
    }));
    const { out } = await propose(many, "a purple scarf");
    const body = mock.requests()[0]?.body as { questions: Record<string, { criteria: object }> };
    expect(Object.keys(Object.values(body.questions)[0]?.criteria ?? {}).length).toBeLessThanOrEqual(9);
    expect(out?.items[0]?.title).toBe("Purple scarf (SIMULATED)");
  });
});

describe("fails closed (I5): never throws, null on any failure", () => {
  it.each([
    ["HTTP 500", { status: 500 }],
    ["malformed JSON", { rawResponse: "<<<" }],
    ["truncated input", { truncated: true }],
  ])("returns null on %s", async (_name, patch) => {
    mock.set(patch);
    expect((await propose(STORE, "I want a cotton tee")).out).toBeNull();
  });

  it("returns null when the server is down", async () => {
    const dead = await startMockLaya();
    const url = dead.url;
    await dead.close();
    const out = await createRulePlanner({ catalogue: STORE, layaUrl: url }).propose(ctxOf("I want a cotton tee", STORE), OPTS);
    expect(out).toBeNull();
  });

  it("honours the total timeout", async () => {
    mock.set({ delayMs: 1_500 });
    const started = Date.now();
    const out = await planner(STORE).propose(ctxOf("I want a cotton tee", STORE), { timeoutMs: 200 });
    expect(out).toBeNull();
    expect(Date.now() - started).toBeLessThan(1_200);
  });

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])("returns null for timeoutMs %s without calling Laya", async (timeoutMs) => {
    expect(await planner(STORE).propose(ctxOf("I want a cotton tee", STORE), { timeoutMs })).toBeNull();
    expect(mock.requests()).toHaveLength(0);
  });

  it("stops at the step cap", async () => {
    const out = await planner(STORE, { stepCap: 1 }).propose(ctxOf("I want a cotton tee", STORE), OPTS);
    expect(out).toBeNull();
  });

  it("is not broken by a throwing trace callback", async () => {
    const out = await planner(STORE).propose(ctxOf("I want a cotton tee", STORE), {
      ...OPTS,
      onTrace: () => {
        throw new Error("ui is gone");
      },
    });
    expect(out?.items[0]?.title).toBe("Cotton tee (SIMULATED)");
  });

  it("returns null or a schema-valid proposal for arbitrary contexts", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ maxLength: 120 }),
        fc.array(fc.record({ url: fc.oneof(fc.constant(tee.url), fc.constant(socks.url), fc.webUrl()), text: fc.string({ maxLength: 60 }) }), { maxLength: 4 }),
        async (intentText, listings) => {
          const out: ProposeCartInput | null = await planner(STORE).propose({ intentText, listings }, OPTS);
          if (out !== null) {
            expect(validateProposeCartInput(out).ok).toBe(true);
            expect(listings.map((l) => l.url)).toContain(out.listing_url);
          }
        },
      ),
      { numRuns: 25 },
    );
  });
});

describe("only picks what was given", () => {
  it("never proposes an item from a listing that is not in the context", async () => {
    const { out } = await propose([tee], "ankle socks", STORE);
    expect(out === null || out.listing_url === tee.url).toBe(true);
  });

  it("proposes from the earbuds listing only when the request names it", async () => {
    expect((await propose([earbuds], "HK$800, clothes, verified sellers.")).out).toBeNull();
    expect((await propose([earbuds], "wireless earbuds")).out?.listing_url).toBe(earbuds.url);
  });
});
