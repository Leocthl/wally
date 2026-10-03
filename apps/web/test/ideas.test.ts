// "Ideas for you" (screens/home/ideas.ts): three or four real shelf items, picked from the profile's taste. Every idea is an item
// the booth's shelf has, asked in the words its own recordings use; nothing is invented and nothing is hidden from the shelf.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { IDEAS, IDEAS_SHOWN, ideasFor } from "../src/screens/home/ideas";
import { TRY_ITEMS } from "../src/screens/home/tryCatalog";
import { mergeProfile, type Profile } from "../src/state/profile";
import { STYLE_IDS, type StyleId } from "../src/state/taste";

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), "../../../data");
const booth = JSON.parse(readFileSync(resolve(DATA, "scenarios/booth.json"), "utf8")) as { scenarios: Record<string, { request: string; run: string }> };
const shelf = readdirSync(resolve(DATA, "fixtures/listings"))
  .filter((f) => f.endsWith(".json"))
  .map((f) => (JSON.parse(readFileSync(resolve(DATA, "fixtures/listings", f), "utf8")) as { data: { items: { title: string }[] } }).data.items[0]?.title ?? "");

const withStyles = (...styles: StyleId[]): Profile => mergeProfile(null, { styles });
const idsOf = (profile: Profile | null) => ideasFor(profile).map((s) => s.idea.id);

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
  it("shows four, the booth's everyday picks, when Wally knows nothing about the person", () => {
    expect(IDEAS_SHOWN).toBe(4);
    expect(idsOf(null)).toEqual(["tee", "socks", "jacket", "hoodie"]);
    expect(idsOf(mergeProfile(null, { nickname: "Mei", colours: ["black"], sizes: { top: "M", bottom: null, shoe: null } }))).toEqual(["tee", "socks", "jacket", "hoodie"]);
  });

  it("leads with what fits the style, and fills the rest from the everyday picks", () => {
    expect(idsOf(withStyles("streetwear"))).toEqual(["jacket", "graphic", "tee", "socks"]);
    expect(idsOf(withStyles("cozy"))[0]).toBe("hoodie");
    expect(idsOf(withStyles("sporty"))[0]).toBe("socks");
  });

  it("leads with the earbuds for someone who shops for electronics", () => {
    expect(idsOf(mergeProfile(null, { shopFor: ["electronics"] }))[0]).toBe("earbuds");
  });

  it("always shows four, whatever the taste, with no repeats", () => {
    for (const profile of [...STYLE_IDS.map((s) => withStyles(s)), withStyles(...STYLE_IDS)]) {
      const ids = idsOf(profile);
      expect(ids).toHaveLength(4);
      expect(new Set(ids).size).toBe(4);
    }
  });

  it("says why an idea is there: the style it fits, or the shelf category, and nothing for a plain pick", () => {
    const shown = ideasFor(mergeProfile(null, { styles: ["streetwear"], shopFor: ["electronics"] }));
    const why = Object.fromEntries(shown.map((s) => [s.idea.id, s.reason]));
    expect(why["jacket"]).toBe("streetwear");
    expect(why["earbuds"]).toBe("electronics");
    expect(ideasFor(null).every((s) => s.reason === null)).toBe(true);
  });

  it("does not change the catalogue", () => {
    const before = IDEAS.map((i) => i.id);
    ideasFor(withStyles("streetwear"));
    expect(IDEAS.map((i) => i.id)).toEqual(before);
  });
});
