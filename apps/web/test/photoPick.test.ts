// Show Wally a photo, end to end on the device: the real orchestrator, engine, cart builder, executor, signed log and
// SIMULATED rail run in this process, the judge replays recorded answers, and nothing leaves the page. The shopper's pick
// goes through the normal pipeline: a planner proposal fixed by code, the judge, rules R1 to R12, a one-off card.
import type { Decision } from "@wally/core/generated";
import { seededRandom } from "@wally/rail-sim";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalApiClient } from "../src/api/local/LocalApiClient";
import { loadBundle } from "../src/api/local/bundle";
import { m0SealRequest } from "../src/api/mock/presets";
import type { RunSummary, TraceEvent } from "../src/api/types";
import { BoothError } from "../src/booth/backend/errors";

const BUNDLE = loadBundle();
const SHOP = [...BUNDLE.catalogue.shop.values()];
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

const decisionsOf = async (client: LocalApiClient): Promise<readonly Decision[]> => (await client.getLog()).entries.flatMap((e) => (e.kind === "DECISION" ? [e.payload] : []));
const pick = (client: LocalApiClient, listingId: string): Promise<RunSummary> => client.ask({ requestText: `Picked from a photo: ${listingId}`, listingId });

describe("what the device says about the photo entry", () => {
  it("offers see() and says the colour plates and chips do the work (no model on the device)", async () => {
    const { client } = await sealed();
    expect(typeof client.see).toBe("function");
    expect((await client.info()).features.see).toBe("palette");
  });

  it("reads the colour plates and the chips with no network call at all", async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error("no network on the device")));
    vi.stubGlobal("fetch", fetchSpy);
    const { client } = await sealed();
    const plates = await client.see({ palette: [{ color: "navy", share: 0.7 }] });
    expect(plates).toMatchObject({ source: "palette", matches: [], attributes: { kind: null, colors: ["navy"] } });
    const chips = await client.see({ attributes: { kind: "hoodie", colors: ["navy"], fit: "relaxed" }, palette: [{ color: "navy", share: 0.7 }] });
    expect(chips.matches[0]?.listingId).toBe("lst_photoHoodieNavy");
    await pick(client, "lst_photoHoodieNavy");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses a picture and chips together, and a bad picture, like the server does", async () => {
    const { client } = await sealed();
    await expect(client.see({ attributes: { kind: "tee" }, image: { mime: "image/jpeg", data: "AAAA" } })).rejects.toBeInstanceOf(BoothError);
    await expect(client.see({ image: { mime: "image/jpeg", data: "not base64!" } })).rejects.toMatchObject({ status: 400 });
    await expect(client.see({} as never)).rejects.toMatchObject({ status: 400 });
  });
});

describe("a pick goes through the normal pipeline", () => {
  it("buys the tee at its shop: planner proposal fixed, judge answered, rules passed, a one-off card for the exact total, paid", async () => {
    const { client, events } = await sealed();
    const run = await pick(client, "lst_photoHoodieNavy");
    expect(run).toMatchObject({ scenario: "custom", outcome: "APPROVE" });
    const mine = events.filter((e) => "runId" in e && e.runId === run.runId);
    const types = mine.map((e) => e.type);
    expect(types[0]).toBe("run.started");
    expect(types.at(-1)).toBe("run.finished");
    expect(types.indexOf("cart")).toBeLessThan(types.indexOf("judge"));
    expect(types.indexOf("decision")).toBeLessThan(types.indexOf("card.minted"));
    expect(mine.find((e) => e.type === "cart")).toMatchObject({ cart: { merchant: { domain: "demo-outlet.example" }, items: [{ title: "Navy relaxed hoodie (SIMULATED)", qty: 1, unit_price_minor: 34_900 }], total_minor: 37_900 } });
    expect(mine.find((e) => e.type === "judge")).toMatchObject({ judge: { provider: "replay", status: "OK" } });
    const snap = await client.snapshot();
    expect(snap.cards).toMatchObject([{ limit_minor: 37_900, state: "USED", simulated: true }]);
    expect(snap.packet).toMatchObject({ spent_minor: 37_900, remaining_minor: 42_100 });
    expect(await decisionsOf(client)).toHaveLength(1);
  });

  it("a shop with an old seller record asks the shopper (R9) and mints nothing", async () => {
    const { client } = await sealed();
    const run = await pick(client, "lst_photoShirtBlueCheck");
    expect(run.outcome).toBe("ESCALATE");
    expect((await decisionsOf(client)).at(-1)?.explanation?.template_id).toBe("R9.unverified");
    expect((await client.snapshot()).cards).toHaveLength(0);
  });

  it("shoes are footwear, and the budget is for clothes: stopped before paying (R6), nothing minted", async () => {
    const { client } = await sealed();
    const run = await pick(client, "lst_photoSneakersWhite");
    expect(run.outcome).toBe("DENY");
    expect((await decisionsOf(client)).at(-1)?.explanation?.template_id).toBe("R6.off_mandate");
    expect((await client.snapshot()).cards).toHaveLength(0);
  });

  it("an item that no longer fits what is left is stopped by the budget (R3), and there is no cheaper pick to offer", async () => {
    const { client } = await sealed();
    expect((await pick(client, "lst_photoJacketDenim")).outcome).toBe("APPROVE");
    const stopped = await pick(client, "lst_photoJacketNavy");
    expect(stopped.outcome).toBe("DENY");
    expect((await decisionsOf(client)).at(-1)?.explanation?.template_id).toBe("R3.over_remaining");
    const cheaper = await client.suggestAlternatives({ decisionId: stopped.decisionId ?? "" });
    expect(cheaper).toMatchObject({ outcome: "INFO", code: "NO_PROPOSAL:no_alternative" });
  });

  it("asking for the same item again is not buying it again", async () => {
    const { client } = await sealed();
    const first = await pick(client, "lst_photoTeeNavy");
    const again = await pick(client, "lst_photoTeeNavy");
    expect(again).toMatchObject({ outcome: "APPROVE", duplicate: true, decisionId: first.decisionId });
    expect((await client.snapshot()).cards).toHaveLength(1);
  });

  it("only photo-shelf items can be picked: a scenario listing, an unknown id and a made-up id are refused with a 404", async () => {
    const { client } = await sealed();
    for (const listingId of ["lst_demoTee", "lst_visitorText", "lst_doesNotExist"]) {
      await expect(pick(client, listingId), listingId).rejects.toMatchObject({ status: 404, code: "UNKNOWN_LISTING" });
    }
    expect(await decisionsOf(client)).toHaveLength(0);
  });

  it("does not change an ordinary ask: 'a cotton tee' still buys the tee for HK$259 from the booth shelf", async () => {
    const { client } = await sealed();
    const run = await client.ask({ requestText: "a cotton tee" });
    expect(run.outcome).toBe("APPROVE");
    expect((await client.snapshot()).cards[0]).toMatchObject({ limit_minor: 25_900 });
  });
});

describe("every item on the shelf has a settled outcome on a fresh budget", () => {
  it.each(SHOP.map((e) => [e.item.id, e.merchantName, e.item.kind] as const))("%s from %s (%s)", async (id, merchant, kind) => {
    const { client } = await sealed();
    const run = await pick(client, id);
    const expected = kind === "sneakers" || kind === "boots" ? "DENY" : merchant.startsWith("Demo Vintage") ? "ESCALATE" : "APPROVE";
    expect(run.outcome, run.note).toBe(expected);
  });
});
