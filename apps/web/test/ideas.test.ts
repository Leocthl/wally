// "Ideas for you" (screens/home/ideas.ts): four real shelf items, led by the categories the person narrowed their shopping to.
// Every idea is an item the booth's shelf has, asked in the words its own recordings use; nothing is invented and nothing is
// hidden from the shelf. A style, a colour or a size does not order anything any more.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { IDEAS, IDEAS_SHOWN, ideasFor } from "../src/screens/home/ideas";
import { TRY_ITEMS } from "../src/screens/home/tryCatalog";
import { mergeProfile, type Profile } from "../src/state/profile";
import { SHOP_IDS } from "../src/state/shopping";

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), "../../../data");
const booth = JSON.parse(readFileSync(resolve(DATA, "scenarios/booth.json"), "utf8")) as { scenarios: Record<string, { request: string; run: string }> };
const shelf = readdirSync(resolve(DATA, "fixtures/listings"))
  .filter((f) => f.endsWith(".json"))
  .map((f) => (JSON.parse(readFileSync(resolve(DATA, "fixtures/listings", f), "utf8")) as { data: { items: { title: string }[] } }).data.items[0]?.title ?? "");

const idsOf = (profile: Profile | null) => ideasFor(profile).map((s) => s.idea.id);
const EVERYDAY = ["tee", "socks", "jacket", "hoodie"];

describe("the ideas are real shelf items", () => {
  it("each is an item in data/fixtures/listings, by the name the shelf gives it", () => {
    for (const idea of IDEAS) expect(shelf.some((title) => title.startsWith(idea.title.en)), idea.title.en).toBe(true);
  });

  it("each is asked in the words the booth's own buy button uses, and runs that button's scenario when the booth cannot take a typed ask", () => {
    for (const idea of IDEAS) {
      const entry = booth.scenarios[idea.scenario];
      expect(entry?.run, idea.id).toBe("buy");
      expect(idea.ask, idea.id).toBe(entry?.request);
      expect(TRY_ITEMS.map((i) => i.id), idea.id).toContain(idea.scenario);
    }
  });

  it("has no repeats", () => {
    expect(new Set(IDEAS.map((i) => i.id)).size).toBe(IDEAS.length);
    expect(new Set(IDEAS.map((i) => i.scenario)).size).toBe(IDEAS.length);
  });
});

describe("ideasFor", () => {
  it("shows four, the booth's everyday picks, when the person did not narrow what they shop for", () => {
    expect(IDEAS_SHOWN).toBe(4);
    expect(idsOf(null)).toEqual(EVERYDAY);
    expect(idsOf(mergeProfile(null, { nickname: "Mei" }))).toEqual(EVERYDAY);
    expect(idsOf(mergeProfile(null, { shopFor: [] }))).toEqual(EVERYDAY);
  });

  it("keeps the everyday order for the categories the shelf has no pick in", () => {
    for (const shopFor of [["groceries"], ["footwear"], ["apparel"], ["groceries", "footwear", "apparel"]] as const) {
      expect(idsOf(mergeProfile(null, { shopFor })), shopFor.join(",")).toEqual(EVERYDAY);
    }
  });

  it("leads with the earbuds for someone who shops for electronics", () => {
    expect(idsOf(mergeProfile(null, { shopFor: ["electronics"] }))).toEqual(["earbuds", "tee", "socks", "jacket"]);
  });

  it("always shows four, whatever the person chose, with no repeats", () => {
    for (const profile of [...SHOP_IDS.map((s) => mergeProfile(null, { shopFor: [s] })), mergeProfile(null, { shopFor: [...SHOP_IDS] })]) {
      const ids = idsOf(profile);
      expect(ids).toHaveLength(4);
      expect(new Set(ids).size).toBe(4);
    }
  });

  it("says why an idea is there: the category the person chose, and nothing for a plain pick", () => {
    const shown = ideasFor(mergeProfile(null, { shopFor: ["electronics", "footwear"] }));
    const why = Object.fromEntries(shown.map((s) => [s.idea.id, s.reason]));
    expect(why["earbuds"]).toBe("electronics");
    expect(why["tee"]).toBeNull();
    expect(ideasFor(null).every((s) => s.reason === null)).toBe(true);
  });

  it("does not change the catalogue", () => {
    const before = IDEAS.map((i) => i.id);
    ideasFor(mergeProfile(null, { shopFor: ["electronics"] }));
    expect(IDEAS.map((i) => i.id)).toEqual(before);
  });
});
