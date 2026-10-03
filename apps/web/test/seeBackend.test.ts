// @vitest-environment node
// see(): a picture (or the chips) in, typed words and the best four simulated shop items out. Every path runs on code except
// the one model call, and a model that fails, declines or says "not clothing" leaves the chips path working.
import { join } from "node:path";
import type { Described } from "@wally/agent/vision";
import { describe, expect, it } from "vitest";
import { localInfo } from "../src/api/local/info";
import { featuresFor } from "../src/booth/backend/info";
import { oneAtATime, see, type PictureReader } from "../src/booth/backend/see";
import { SILENT_BACKEND_LOGGER, type BackendLogger } from "../src/booth/backend/types";
import { parseSeeRequest } from "../src/booth/backend/validate";
import { loadCatalogue } from "../server/booth/catalogue";
import { loadScenarioTable } from "../server/booth/scenarioTable";
import { jpegBase64 } from "./helpers/pictures";

const DATA = join(import.meta.dirname, "../../..", "data");
const shop = loadCatalogue(join(DATA, "fixtures"), loadScenarioTable(join(DATA, "scenarios/booth.json"))).shop;
const PICTURE = { image: { mime: "image/jpeg", data: jpegBase64() } } as const;
const NAVY_PLATES = [{ color: "navy", share: 0.6 }, { color: "white", share: 0.3 }, { color: "grey", share: 0.1 }] as const;

const described = (patch: Partial<Described> = {}): Described => ({
  attributes: { kind: "hoodie", colors: ["navy"], pattern: "plain", fit: "relaxed", style: ["streetwear"] },
  reason: "ok",
  bytes: 3_000,
  width: 768,
  height: 1024,
  latencyMs: 2_100,
  model: "qwen3.5-9b-q4km",
  failure: null,
  ...patch,
});

const reader = (out: Described): PictureReader & { readonly calls: readonly Uint8Array[] } => {
  const calls: Uint8Array[] = [];
  const read = Object.assign(async (bytes: Uint8Array) => (calls.push(bytes), out), { calls });
  return read;
};

const logs: string[] = [];
const logger: BackendLogger = { info: (m) => void logs.push(m), error: (m) => void logs.push(m) };

describe("with the model reading the picture", () => {
  it("returns what it read as chips, the colour plates, and the best four matches, same kind first", async () => {
    const out = await see(parseSeeRequest({ ...PICTURE, palette: NAVY_PLATES }), { shop, reader: reader(described()), logger: SILENT_BACKEND_LOGGER });
    expect(out.source).toBe("model");
    expect(out.attributes).toEqual({ kind: "hoodie", colors: ["navy"], pattern: "plain", fit: "relaxed", style: ["streetwear"] });
    expect(out.palette).toEqual(NAVY_PLATES);
    expect(out.notice).toBeUndefined();
    expect(out.matches).toHaveLength(4);
    expect(out.matches[0]).toMatchObject({ listingId: "lst_photoHoodieNavy", kind: "hoodie", colors: ["navy"], merchantName: "Demo Outlet (SIMULATED)", priceMinor: 34_900, totalMinor: 37_900, score: 100 });
    expect(out.matches[0]?.reasons).toEqual(["same_kind", "same_color", "same_fit", "same_style"]);
    expect(out.matches.map((m) => m.score)).toEqual([...out.matches.map((m) => m.score)].sort((a, b) => b - a));
  });

  it("sends the decoded picture to the reader once and logs only its size, dimensions, time and a reason word", async () => {
    logs.length = 0;
    const read = reader(described());
    await see(parseSeeRequest(PICTURE), { shop, reader: read, logger });
    expect(read.calls).toHaveLength(1);
    expect(read.calls[0]?.[0]).toBe(0xff);
    expect(logs).toEqual(["see: 3000 bytes 768x1024, 2100 ms, ok"]);
    expect(logs.join(" ")).not.toMatch(/\/9j\/|base64|data:image/);
  });

  it("takes the colours from the colour plates when the model named none, and an unknown fit as no preference", async () => {
    const out = await see(parseSeeRequest({ ...PICTURE, palette: NAVY_PLATES }), {
      shop,
      reader: reader(described({ attributes: { kind: "tee", colors: [], pattern: null, fit: "unknown", style: [] } })),
      logger: SILENT_BACKEND_LOGGER,
    });
    expect(out.attributes).toEqual({ kind: "tee", colors: ["navy", "white"], pattern: null, fit: null, style: [] });
    expect(out.matches[0]?.kind).toBe("tee");
  });

  it("says not_clothing and offers no matches", async () => {
    const out = await see(parseSeeRequest(PICTURE), { shop, reader: reader(described({ attributes: { kind: "not_clothing", colors: ["red"], pattern: "plain", fit: "regular", style: [] } })), logger: SILENT_BACKEND_LOGGER });
    expect(out).toMatchObject({ source: "model", notice: "not_clothing", matches: [] });
  });

  it("offers no matches for a kind the shop does not sell (a bag), without an error", async () => {
    const out = await see(parseSeeRequest(PICTURE), { shop, reader: reader(described({ attributes: { kind: "bag", colors: ["black"], pattern: "plain", fit: "regular", style: [] } })), logger: SILENT_BACKEND_LOGGER });
    expect(out).toMatchObject({ source: "model", matches: [] });
    expect(out.notice).toBeUndefined();
    expect(out.attributes.kind).toBe("bag");
  });

  it("falls back to the colour plates and the chips when the model does not answer, and says so", async () => {
    const out = await see(parseSeeRequest({ ...PICTURE, palette: NAVY_PLATES }), {
      shop,
      reader: reader(described({ attributes: null, reason: "model_unavailable", failure: "timeout", latencyMs: 15_000 })),
      logger: SILENT_BACKEND_LOGGER,
    });
    expect(out).toMatchObject({ source: "palette", notice: "model_failed", matches: [], attributes: { kind: null, colors: ["navy", "white"] } });
  });
});

describe("without a model (colour plates and chips)", () => {
  it("a picture with no reader is the colour plates alone: chips ask for the item type, no matches yet", async () => {
    const out = await see(parseSeeRequest({ ...PICTURE, palette: NAVY_PLATES }), { shop, reader: null, logger: SILENT_BACKEND_LOGGER });
    expect(out).toEqual({ source: "palette", attributes: { kind: null, colors: ["navy", "white"], pattern: null, fit: null, style: [] }, palette: NAVY_PLATES, matches: [] });
  });

  it("the colour plates alone (the page sends no picture) give the same", async () => {
    const out = await see(parseSeeRequest({ palette: NAVY_PLATES }), { shop, reader: null, logger: SILENT_BACKEND_LOGGER });
    expect(out.source).toBe("palette");
    expect(out.matches).toEqual([]);
  });

  it("once the shopper picks an item type on the chips, the same matcher runs", async () => {
    const out = await see(parseSeeRequest({ attributes: { kind: "hoodie", colors: ["navy", "white"] }, palette: NAVY_PLATES }), { shop, reader: null, logger: SILENT_BACKEND_LOGGER });
    expect(out.source).toBe("chips");
    expect(out.matches.length).toBeGreaterThan(0);
    expect(out.matches[0]?.listingId).toBe("lst_photoHoodieNavy");
  });

  it("chips that name no colour ask for none (the colour plates are not added behind the shopper's back)", async () => {
    const out = await see(parseSeeRequest({ attributes: { kind: "tee", colors: [] }, palette: NAVY_PLATES }), { shop, reader: null, logger: SILENT_BACKEND_LOGGER });
    expect(out.attributes.colors).toEqual([]);
  });

  it("never calls a reader for chips alone", async () => {
    const read = reader(described());
    await see(parseSeeRequest({ attributes: { kind: "jacket" } }), { shop, reader: read, logger: SILENT_BACKEND_LOGGER });
    expect(read.calls).toHaveLength(0);
  });
});

describe("what the matches carry", () => {
  it("names only SIMULATED shop items with integer minor-unit prices, never a score outside 0 to 100", async () => {
    for (const kind of ["tee", "shirt", "polo", "sweater", "hoodie", "jacket", "jeans", "trousers", "shorts", "dress", "skirt", "sneakers", "boots"] as const) {
      const out = await see(parseSeeRequest({ attributes: { kind } }), { shop, reader: null, logger: SILENT_BACKEND_LOGGER });
      expect(out.matches.length, kind).toBeGreaterThan(0);
      for (const m of out.matches) {
        expect(shop.has(m.listingId)).toBe(true);
        expect(m.merchantName).toMatch(/\(SIMULATED\)$/);
        expect(Number.isInteger(m.priceMinor) && Number.isInteger(m.totalMinor)).toBe(true);
        expect(m.totalMinor).toBeGreaterThanOrEqual(m.priceMinor);
        expect(m.score).toBeGreaterThanOrEqual(0);
        expect(m.score).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe("a reader that breaks", () => {
  it("is the chips path with the model_failed notice, never an error (the booth keeps working)", async () => {
    const breaking: PictureReader = () => Promise.reject(new Error("boom: the picture bytes"));
    const out = await see(parseSeeRequest({ ...PICTURE, palette: NAVY_PLATES }), { shop, reader: breaking, logger: SILENT_BACKEND_LOGGER });
    expect(out).toMatchObject({ source: "palette", notice: "model_failed", matches: [] });
    expect(out.attributes.colors).toEqual(["navy", "white"]);
    expect(JSON.stringify(out)).not.toMatch(/boom|bytes/);
  });

  it("is logged as a reason word and nothing else", async () => {
    const lines: string[] = [];
    const breaking: PictureReader = () => Promise.reject(new Error("boom: secret"));
    await see(parseSeeRequest({ ...PICTURE }), { shop, reader: breaking, logger: { info: (m) => void lines.push(m), error: (m) => void lines.push(m) } });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^see: /);
    expect(lines[0]).not.toMatch(/secret|boom/);
  });
});

describe("oneAtATime (the model server has two slots, and the planner and the judge share them)", () => {
  const gate = () => {
    let open: (d: Described) => void = () => undefined;
    const done = new Promise<Described>((resolve) => (open = resolve));
    return { done, open };
  };

  it("lets one picture be read at a time: a second one while the first is running is not read", async () => {
    const first = gate();
    const calls: Uint8Array[] = [];
    const slow: PictureReader = (bytes) => (calls.push(bytes), first.done);
    const wrapped = oneAtATime(slow);
    const running = wrapped(Uint8Array.of(1, 2, 3));
    const refused = await wrapped(Uint8Array.of(4, 5, 6, 7));
    expect(refused).toMatchObject({ attributes: null, reason: "busy", bytes: 4, failure: null });
    expect(calls).toHaveLength(1);
    first.open(described());
    expect((await running).reason).toBe("ok");
  });

  it("is free again as soon as the read ends, whether it answered or failed", async () => {
    const calls: number[] = [];
    const flaky: PictureReader = async () => {
      calls.push(calls.length);
      if (calls.length === 1) throw new Error("boom");
      return described();
    };
    const wrapped = oneAtATime(flaky);
    await expect(wrapped(Uint8Array.of(1))).rejects.toThrow("boom");
    expect((await wrapped(Uint8Array.of(1))).reason).toBe("ok");
    expect((await wrapped(Uint8Array.of(1))).reason).toBe("ok");
    expect(calls).toHaveLength(3);
  });

  it("turns a busy reader into the chips path with the model_failed notice", async () => {
    const first = gate();
    const wrapped = oneAtATime(() => first.done);
    const running = wrapped(Uint8Array.of(1));
    const out = await see(parseSeeRequest({ ...PICTURE, palette: NAVY_PLATES }), { shop, reader: wrapped, logger: SILENT_BACKEND_LOGGER });
    expect(out).toMatchObject({ source: "palette", notice: "model_failed", matches: [] });
    first.open(described());
    await running;
  });
});

describe("features.see (what the page reads before it offers a picture)", () => {
  it("is left out when there is no photo shelf, so no entry is offered that could find nothing", () => {
    expect(featuresFor("replay", false)).not.toHaveProperty("see");
    expect(localInfo(false, false).features).not.toHaveProperty("see");
  });

  it("says palette on the device, and whatever the start-up probe found on the booth", () => {
    expect(localInfo(false).features.see).toBe("palette");
    expect(featuresFor("local", false, "model").see).toBe("model");
    expect(featuresFor("local", false, "palette").see).toBe("palette");
  });
});
