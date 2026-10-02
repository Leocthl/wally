// Ask Wally on the device (lane e-ask): the real stack runs in this process with recorded planner and judge answers, so a
// typed request is run only when it has a recording; anything else is an INFO run with a plain note and no verdict. "See
// cheaper options" works where a recorded cheaper pick exists. The sentence reader is the fixed rules parser.
import type { Decision } from "@laisee/core/generated";
import { seededRandom } from "@laisee/rail-sim";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LOCAL_UNKNOWN_REQUEST_NOTE } from "../src/api/local/info";
import { LocalApiClient } from "../src/api/local/LocalApiClient";
import { loadBundle } from "../src/api/local/bundle";
import { m0SealRequest } from "../src/api/mock/presets";
import type { TraceEvent } from "../src/api/types";
import { askShelf, recordedRequests, requestKey } from "../src/booth/backend/ask";
import { BoothError } from "../src/booth/backend/errors";

const BUNDLE = loadBundle();
const open: LocalApiClient[] = [];

afterEach(() => {
  for (const client of open.splice(0)) client.dispose();
  vi.unstubAllGlobals();
});

async function sealed(): Promise<{ client: LocalApiClient; events: TraceEvent[] }> {
  const client = new LocalApiClient({ railRandom: () => seededRandom(7), tickMs: null });
  open.push(client);
  const events: TraceEvent[] = [];
  client.subscribe((e) => events.push(e));
  await client.seal(m0SealRequest(new Date()));
  return { client, events };
}

const decisionsOf = async (client: LocalApiClient): Promise<readonly Decision[]> =>
  (await client.getLog()).entries.flatMap((e) => (e.kind === "DECISION" ? [e.payload] : []));

describe("what the device says about itself", () => {
  it("offers ask and cheaper options (a recorded one exists) and reads sentences with the fixed rules", async () => {
    const { client } = await sealed();
    expect(await client.info()).toMatchObject({ kind: "local", features: { ask: true, alternatives: true, compile: "rules" }, planner: { provider: "replay" } });
  });
});

describe("ask on the device", () => {
  it("runs a request that has a recording through the real stack: 'a cotton tee' buys the tee for HK$259", async () => {
    const { client, events } = await sealed();
    const run = await client.ask({ requestText: "a cotton tee" });
    expect(run).toMatchObject({ scenario: "custom", outcome: "APPROVE" });
    expect(run.duplicate).toBeUndefined();
    const mine = events.filter((e) => "runId" in e && e.runId === run.runId).map((e) => e.type);
    expect(mine[0]).toBe("run.started");
    expect(mine.at(-1)).toBe("run.finished");
    expect(mine.indexOf("decision")).toBeLessThan(mine.indexOf("card.minted"));
    expect(mine).toContain("card.event"); // paid inside the same call, under the honest merchant
    const snap = await client.snapshot();
    expect(snap.cards).toHaveLength(1);
    expect(snap.cards[0]).toMatchObject({ limit_minor: 25_900, state: "USED" });
    expect(snap.packet).toMatchObject({ spent_minor: 25_900, remaining_minor: 54_100 });
  });

  it("matches the recorded words however they are spaced, cased or punctuated", async () => {
    const { client } = await sealed();
    expect((await client.ask({ requestText: "  I WANT   a cotton tee. " })).outcome).toBe("APPROVE");
  });

  it("says plainly that it only knows the samples, makes no verdict, and leaves no decision or card", async () => {
    const { client, events } = await sealed();
    const run = await client.ask({ requestText: "a red scarf for my mum, under HK$100" });
    expect(run).toMatchObject({ scenario: "custom", outcome: "INFO", code: "UNKNOWN_REQUEST", note: "On-device mode only knows the sample requests; open the live booth for free-form asks." });
    expect(run.note).toBe(LOCAL_UNKNOWN_REQUEST_NOTE);
    expect(run.decisionId).toBeUndefined();
    expect(await decisionsOf(client)).toHaveLength(0);
    expect((await client.snapshot()).cards).toHaveLength(0);
    const mine = events.filter((e) => "runId" in e && e.runId === run.runId).map((e) => e.type);
    expect(mine).toEqual(["run.started", "run.finished"]);
  });

  it("a request the planner recorded as unclear is a run that asks the shopper (NO_PROPOSAL), not a made-up pick", async () => {
    const { client } = await sealed();
    const run = await client.ask({ requestText: "something to wear" });
    expect(run).toMatchObject({ outcome: "INFO", code: "NO_PROPOSAL:planner_null" });
    expect(await decisionsOf(client)).toHaveLength(0);
  });

  it("the same ask twice is one purchase: the second run returns the first decision and card", async () => {
    const { client } = await sealed();
    const first = await client.ask({ requestText: "a cotton tee" });
    const again = await client.ask({ requestText: "a cotton tee" });
    expect(again).toMatchObject({ outcome: "APPROVE", duplicate: true, code: "DUPLICATE", decisionId: first.decisionId });
    expect(again.runId).not.toBe(first.runId);
    expect(await decisionsOf(client)).toHaveLength(1);
    expect((await client.snapshot()).cards).toHaveLength(1);
  });

  it("refuses a bad body before any run: too long after NFKC, empty, unknown field, wrong locale", async () => {
    const { client } = await sealed();
    await expect(client.ask({ requestText: "x".repeat(1_001) })).rejects.toMatchObject({ code: "TEXT_TOO_LONG" });
    await expect(client.ask({ requestText: "   " })).rejects.toMatchObject({ code: "INVALID_FIELD" });
    await expect(client.ask({ requestText: "a tee", extra: 1 } as never)).rejects.toMatchObject({ code: "UNKNOWN_FIELD" });
    await expect(client.ask({ requestText: "a tee", locale: "fr" as never })).rejects.toMatchObject({ code: "INVALID_FIELD" });
    expect(await decisionsOf(client)).toHaveLength(0);
  });

  it("opens no connection", async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error("no network on the device")));
    vi.stubGlobal("fetch", fetchSpy);
    const { client } = await sealed();
    await client.ask({ requestText: "a cotton tee" });
    await client.ask({ requestText: "nothing recorded" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("cheaper options on the device", () => {
  it("after the jacket is stopped by R3 the recorded cheaper pick (ankle socks) is bought", async () => {
    const { client, events } = await sealed();
    await client.ask({ requestText: "a cotton tee" }); // HK$541 left
    const stopped = await client.ask({ requestText: "a denim jacket" });
    expect(stopped).toMatchObject({ outcome: "DENY" });
    const decision = (await decisionsOf(client)).find((d) => d.id === stopped.decisionId);
    expect(decision?.explanation?.template_id).toBe("R3.over_remaining");

    const cheaper = await client.suggestAlternatives({ decisionId: stopped.decisionId ?? "" });
    expect(cheaper).toMatchObject({ scenario: "custom", outcome: "APPROVE", alternativeTo: stopped.decisionId });
    expect((await client.snapshot()).cards.map((c) => c.limit_minor)).toEqual([25_900, 12_000]);
    const mine = events.filter((e) => "runId" in e && e.runId === cheaper.runId).map((e) => e.type);
    expect(mine[0]).toBe("run.started");
    expect(mine.at(-1)).toBe("run.finished");
  });

  it("a stop with no recorded cheaper pick is an INFO run: no_alternative, nothing decided", async () => {
    const { client } = await sealed();
    await client.runScenario("normal");
    const overflow = await client.runScenario("overflow"); // the jacket alone: no record for that listing set
    expect(overflow.outcome).toBe("DENY");
    const before = (await decisionsOf(client)).length;
    const run = await client.suggestAlternatives({ decisionId: overflow.decisionId ?? "" });
    expect(run).toMatchObject({ outcome: "INFO", code: "NO_PROPOSAL:no_alternative", alternativeTo: overflow.decisionId });
    expect(await decisionsOf(client)).toHaveLength(before);
  });

  it("is refused (409) for an approval, a stop by another rule and an unknown id", async () => {
    const { client } = await sealed();
    const bought = await client.ask({ requestText: "a cotton tee" });
    const flagged = await client.runScenario("flagged");
    for (const decisionId of [bought.decisionId ?? "", flagged.decisionId ?? "", "dec_doesNotExist01"]) {
      await expect(client.suggestAlternatives({ decisionId })).rejects.toMatchObject({ status: 409, code: "NOT_APPLICABLE" });
    }
    await expect(client.suggestAlternatives({ decisionId: "nope" })).rejects.toBeInstanceOf(BoothError);
  });
});

describe("the sentence reader on the device", () => {
  it("is the fixed rules parser: a suggestion with labels, never sealed", async () => {
    const { client } = await sealed();
    const before = (await client.getLog()).entries.length;
    const result = await client.compileRules({ text: "HK$500 this month for clothes, verified sellers only", locale: "en" });
    expect(result).toMatchObject({ source: "rules", confirmRequired: true, clamped: [], rules: { budget: { amount_minor: 50_000, currency: "HKD" }, categories: ["apparel"], seller_check: { require_capture: true } } });
    expect(result.labels.map((l) => l.kind)).toEqual(["budget", "expiry", "category", "sellers"]);
    expect(result.labels[0]).toMatchObject({ en: "HK$500 budget", zhHK: "預算 HK$500", rule: "R3" });
    expect(result.notes).toEqual(["Read by the fixed rules parser, not a model."]);
    expect(Date.parse(result.validUntil)).toBeGreaterThan(Date.now());
    expect((await client.getLog()).entries).toHaveLength(before); // nothing sealed
  });

  it("says in Cantonese-script notes when asked in zh-HK, and refuses a sentence with no amount (422)", async () => {
    const { client } = await sealed();
    expect((await client.compileRules({ text: "HK$300 for clothes", locale: "zh-HK" })).notes).toEqual(["由固定規則解析，不是模型。"]);
    await expect(client.compileRules({ text: "something nice for clothes", locale: "en" })).rejects.toMatchObject({ status: 422, code: "CANNOT_COMPILE" });
    await expect(client.compileRules({ text: "x".repeat(281), locale: "en" })).rejects.toMatchObject({ code: "TEXT_TOO_LONG" });
    await expect(client.compileRules({ text: "HK$300 for clothes" } as never)).rejects.toMatchObject({ code: "INVALID_FIELD" });
  });
});

describe("the sample requests and the shelf", () => {
  it("every sample request has a complete recording over listings the device has, and fixtures win over buttons for the same words", () => {
    const requests = recordedRequests(BUNDLE.plannerTexts, BUNDLE.catalogue, BUNDLE.table);
    expect(requests.get(requestKey("a denim jacket"))).toEqual(["lst_demoJacket", "lst_demoTee", "lst_demoSocks"]); // the set the cheaper pick was recorded over
    expect(requests.get(requestKey("a cotton tee"))).toEqual(["lst_demoTee"]); // the empty-candidates fixture names a shop the device does not have
    expect(requests.get(requestKey("I want 2 packs of ankle socks"))).toEqual(["lst_demoSocks", "lst_flaggedHoodie"]);
    expect(requests.has(requestKey("a red cotton tee in size M"))).toBe(false); // recorded over an unknown listing
    for (const ids of requests.values()) for (const id of ids) expect(BUNDLE.catalogue.listings.has(id), id).toBe(true);
  });

  it("the live shelf is the six demo shops: a derived copy of an item already on the shelf would tie every tee ask", () => {
    const shelf = askShelf(BUNDLE.catalogue, BUNDLE.table);
    expect(shelf.map((l) => l.id).sort()).toEqual(["lst_demoJacket", "lst_demoSocks", "lst_demoTee", "lst_flaggedHoodie", "lst_injectedTee", "lst_offCatEarbuds"]);
    expect(new Set(shelf.flatMap((l) => l.items.map((i) => i.title))).size).toBe(shelf.flatMap((l) => l.items).length);
  });
});
