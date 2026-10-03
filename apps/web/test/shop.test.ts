// @vitest-environment node
// The photo shelf: 33 SIMULATED items in four shops, kept apart from every list that existing flows are built from. The
// Ask shelf, the scenario listing sets and the derived listings must be exactly what they were before the shelf existed.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SHOP_KINDS } from "@wally/agent/vision";
import { askShelf } from "../src/booth/backend/ask";
import { buildCatalogue, CatalogueError } from "../src/booth/backend/catalogue";
import { buildShop, categoryOf, ShopError } from "../src/booth/backend/shop";
import { loadCatalogue } from "../server/booth/catalogue";
import { loadScenarioTable } from "../server/booth/scenarioTable";

const ROOT = join(import.meta.dirname, "../../..", "data");
const table = loadScenarioTable(join(ROOT, "scenarios/booth.json"));
const catalogue = loadCatalogue(join(ROOT, "fixtures"), table);
const entries = [...catalogue.shop.values()];

/** The Ask shelf, the listing records and the captures as they were on main before the photo shelf was added. */
const ASK_SHELF_BEFORE = ["lst_demoSocks", "lst_demoTee", "lst_flaggedHoodie", "lst_injectedTee", "lst_offCatEarbuds", "lst_demoJacket"];
const LISTINGS_BEFORE = [...ASK_SHELF_BEFORE, "lst_vintageTee", "lst_visitorText"];
const CAPTURES_BEFORE = ["SIM-scameter-demo-apparel", "SIM-scameter-demo-gadgets", "SIM-scameter-demo-outlet", "SIM-scameter-demo-streetwear", "SIM-scameter-flagged-seller", "SIM-scameter-stale"];

describe("the photo shelf stays off every existing list", () => {
  it("leaves the Ask shelf exactly as it was", () => {
    expect(askShelf(catalogue, table).map((l) => l.id)).toEqual(ASK_SHELF_BEFORE);
  });

  it("keeps photo items out of the catalogue listings, so no scenario or recorded set can name one", () => {
    expect([...catalogue.listings.keys()]).toEqual(LISTINGS_BEFORE);
    const wanted = new Set([...Object.values(table.scenarios).flatMap((s) => s.listings), ...table.custom.listings]);
    for (const entry of entries) expect(wanted.has(entry.item.id), entry.item.id).toBe(false);
  });

  it("only adds the Demo Shoes capture to the Scameter captures", () => {
    expect([...catalogue.captures.keys()].filter((ref) => !CAPTURES_BEFORE.includes(ref))).toEqual(["SIM-scameter-demo-shoes"]);
    for (const ref of CAPTURES_BEFORE) expect(catalogue.captures.has(ref), ref).toBe(true);
  });

  it("gives no photo item the url, title or id of an existing listing", () => {
    const urls = new Set([...catalogue.listings.values()].map((l) => l.url));
    for (const entry of entries) {
      expect(urls.has(entry.listing.url), entry.listing.url).toBe(false);
      expect(catalogue.listings.has(entry.item.id)).toBe(false);
    }
  });
});

describe("the shelf files stay out of the core fixtures tree, with the same card-number guard (I8)", () => {
  const SHELF_DIR = join(ROOT, "photo-shelf");
  const files = ["items.json", "judge.json", "scameter/demo-shoes.json"];

  it("sits next to data/fixtures, not inside it (its envelope names schemas the core fixture checks do not know)", () => {
    expect(existsSync(join(ROOT, "fixtures", "shop"))).toBe(false);
    for (const file of files) expect(existsSync(join(SHELF_DIR, file)), file).toBe(true);
  });

  it("holds no card-number-like digit run and no CVV", () => {
    for (const file of files) {
      // A SHA-256 digest is 64 hex characters and can hold a long run of decimal digits by chance; it is not a card number.
      const text = readFileSync(join(SHELF_DIR, file), "utf8").replace(/\b[0-9a-f]{64}\b/g, "");
      expect(text, file).not.toMatch(/(?:\d[ -]?){13,19}/);
      expect(text.toLowerCase(), file).not.toMatch(/cvv/);
    }
  });
});

describe("the 33 items", () => {
  it("has 33 of them (30 clothes and shoes, and 3 socks the typed reader can find), priced from HK$99 to HK$699, in four shops", () => {
    expect(entries.length).toBe(33);
    const prices = entries.map((e) => e.item.priceMinor);
    expect(Math.min(...prices)).toBe(9_900);
    expect(Math.max(...prices)).toBe(69_900);
    expect(new Set(entries.map((e) => e.merchantName))).toEqual(new Set(["Demo Apparel (SIMULATED)", "Demo Outlet (SIMULATED)", "Demo Vintage (SIMULATED)", "Demo Shoes (SIMULATED)"]));
  });

  it("is SIMULATED everywhere, with unique ids, urls and titles, and only words the matcher knows", () => {
    for (const { item, listing } of entries) {
      expect(listing.provenance).toBe("SIMULATED");
      expect(listing.currency).toBe("HKD");
      expect(listing.items[0]?.title).toMatch(/\(SIMULATED\)$/);
      expect(SHOP_KINDS).toContain(item.kind);
      expect(item.colors.length).toBeGreaterThanOrEqual(1);
      expect(item.fit).not.toBe("unknown");
    }
    expect(new Set(entries.map((e) => e.listing.url)).size).toBe(entries.length);
    expect(new Set(entries.map((e) => e.listing.items[0]?.title)).size).toBe(entries.length);
  });

  it("covers every kind the shop sells, with at least one item each", () => {
    for (const kind of SHOP_KINDS) expect(entries.some((e) => e.item.kind === kind), kind).toBe(true);
  });

  it("puts shoes in the footwear category and everything else in apparel", () => {
    for (const { item, listing } of entries) expect(listing.items[0]?.category).toBe(item.kind === "sneakers" || item.kind === "boots" ? "footwear" : "apparel");
    expect(categoryOf("hoodie")).toBe("apparel");
    expect(categoryOf("boots")).toBe("footwear");
  });

  it("gives Demo Vintage the old seller record, so its items ask the person (R9), and every other shop a current capture", () => {
    for (const { listing, merchantName } of entries) {
      const capture = catalogue.captures.get(listing.scameter_ref ?? "");
      expect(capture, listing.id).toBeDefined();
      expect(capture?.capture.subject_domain).toBe(listing.merchant.domain);
      expect(listing.scameter_ref === "SIM-scameter-stale", merchantName).toBe(merchantName.startsWith("Demo Vintage"));
    }
  });

  it("describes each item in plain listing text with no instruction in it", () => {
    for (const { listing } of entries) {
      expect(listing.text.length).toBeLessThan(220);
      expect(listing.text).toContain(listing.items[0]?.title ?? "never");
      expect(listing.text).not.toMatch(/ignore|instruction|approve|gift card|bank transfer|override/i);
    }
  });
});

describe("buildShop refuses a bad shelf (start-up error, never a silent default)", () => {
  const good = JSON.parse(JSON.stringify({
    provenance: "SIMULATED",
    schema: "photo-shelf",
    data: {
      observed_at: "2026-10-03T02:30:00Z",
      merchants: { m: { name: "Demo Apparel (SIMULATED)", domain: "demo-apparel.example", seller: "s", scameter_ref: "SIM-scameter-demo-apparel", shipping_minor: 0 } },
      items: [{ id: "lst_photoOne", merchant: "m", kind: "tee", colors: ["navy"], pattern: "plain", fit: "regular", style: ["basics"], price_minor: 9_900, title: "Navy tee (SIMULATED)", text: "Navy tee (SIMULATED). Cotton." }],
    },
  })) as { provenance: string; schema: string; data: { items: Record<string, unknown>[]; merchants: Record<string, Record<string, unknown>> } };
  const refs = new Set(["SIM-scameter-demo-apparel"]);
  const build = (mutate: (copy: typeof good) => void) => {
    const copy = JSON.parse(JSON.stringify(good)) as typeof good;
    mutate(copy);
    return () => buildShop({ name: "items.json", raw: copy }, refs);
  };

  it("accepts the minimal good shelf", () => {
    expect(build(() => undefined)()).toHaveProperty("size", 1);
  });

  it.each([
    ["a shelf that is not SIMULATED", (c: typeof good) => void (c.provenance = "OBSERVED")],
    ["the wrong schema", (c: typeof good) => void (c.schema = "listing-record")],
    ["a kind the shop does not sell", (c: typeof good) => void (c.data.items[0]!["kind"] = "bag")],
    ["an unknown colour", (c: typeof good) => void (c.data.items[0]!["colors"] = ["mauve"])],
    ["no colour", (c: typeof good) => void (c.data.items[0]!["colors"] = [])],
    ["an unknown fit", (c: typeof good) => void (c.data.items[0]!["fit"] = "unknown")],
    ["a price that is not a whole number", (c: typeof good) => void (c.data.items[0]!["price_minor"] = 99.5)],
    ["an id that is not a listing id", (c: typeof good) => void (c.data.items[0]!["id"] = "photo_one")],
    ["a shop that is not defined", (c: typeof good) => void (c.data.items[0]!["merchant"] = "nobody")],
    ["a capture that does not exist", (c: typeof good) => void (c.data.merchants["m"]!["scameter_ref"] = "SIM-scameter-missing")],
    ["a repeated id", (c: typeof good) => void c.data.items.push({ ...c.data.items[0]! })],
    ["no items", (c: typeof good) => void (c.data.items = [])],
  ])("%s", (_name, mutate) => {
    expect(build(mutate)).toThrow(ShopError);
  });
});

describe("buildCatalogue refuses a shelf that touches the scenario listings", () => {
  const files = (name: string) => JSON.parse(readFileSync(join(ROOT, "photo-shelf", name), "utf8")) as { data: { items: { id: string }[] } };
  const sources = (mutate: (items: { id: string; title?: string }[]) => void) => {
    const items = files("items.json");
    mutate(items.data.items);
    return {
      listings: readdirSync(join(ROOT, "fixtures/listings")).sort().map((f) => ({ name: f, raw: JSON.parse(readFileSync(join(ROOT, "fixtures/listings", f), "utf8")) as unknown })),
      referenceCart: { name: "attempt-1.json", raw: JSON.parse(readFileSync(join(ROOT, "fixtures/carts/attempt-1.json"), "utf8")) as unknown },
      captures: readdirSync(join(ROOT, "fixtures/scameter")).sort().map((f) => ({ name: f, raw: JSON.parse(readFileSync(join(ROOT, "fixtures/scameter", f), "utf8")) as unknown })),
      shop: {
        items: { name: "items.json", raw: items },
        captures: readdirSync(join(ROOT, "photo-shelf/scameter")).sort().map((f) => ({ name: f, raw: JSON.parse(readFileSync(join(ROOT, "photo-shelf/scameter", f), "utf8")) as unknown })),
      },
    };
  };

  it("builds with the shelf as it is", () => {
    expect(buildCatalogue(sources(() => undefined), table).shop.size).toBe(33);
  });

  it("refuses a shelf item that has the id of a scenario listing", () => {
    expect(() => buildCatalogue(sources((items) => void (items[0]!.id = "lst_demoTee")), table)).toThrow(CatalogueError);
  });
});
