import { describe, expect, it } from "vitest";
import { CORPUS_CATEGORIES, loadCorpus, type CorpusCase } from "../src/judge/fit/corpus";
import { NEAR_DUPLICATE_JACCARD, jaccard, nearDuplicatePairs, shingles } from "../src/judge/fit/near-dup";
import { SPLIT_SALT, assignSplit, splitUnit } from "../src/judge/fit/split";

function fake(id: string, category: CorpusCase["category"], text: string, group?: string): CorpusCase {
  return {
    id,
    category,
    labels: { scope_fit: "in_scope", injection_risk: "clean", seller_risk: "low_risk", escalate_or_proceed: "proceed" },
    scameter_state: "NO_RECORD",
    notes: "",
    listing: {
      id: `lst_${id.replace(/[^A-Za-z0-9]/g, "")}`,
      url: `https://shop.example/p/${id}`,
      merchant: { name: "Shop (SIMULATED)", domain: "shop.example" },
      items: [{ title: "Tee", category: "apparel", unit_price_minor: 100 }],
      shipping_minor: 0,
      fees_minor: 0,
      currency: "HKD",
      text,
      observed_at: "2026-10-03T00:00:00Z",
      scameter_ref: null,
      provenance: "SIMULATED",
    },
    ...(group === undefined ? {} : { group }),
  };
}

describe("assignSplit", () => {
  const cases = [
    ...Array.from({ length: 7 }, (_, i) => fake(`clean-${i}`, "clean_apparel", `plain listing number ${i}`)),
    ...Array.from({ length: 4 }, (_, i) => fake(`inj-${i}`, "injected_description", `attack text ${i}`)),
    fake("pad-a", "padding_attack", "filler a", "pad-filler-x"),
    fake("pad-b", "padding_attack", "filler b", "pad-filler-x"),
    fake("pad-c", "padding_attack", "filler c"),
  ];

  it("is deterministic and does not depend on input order", () => {
    const one = assignSplit(cases);
    const two = assignSplit([...cases].reverse());
    expect([...one.byId.entries()].sort()).toEqual([...two.byId.entries()].sort());
  });

  it("puts every case in exactly one split", () => {
    const s = assignSplit(cases);
    expect(s.tuning.length + s.heldout.length).toBe(cases.length);
    const ids = new Set([...s.tuning, ...s.heldout].map((c) => c.id));
    expect(ids.size).toBe(cases.length);
  });

  it("stratifies by family: alternate units by hash rank, tuning takes the odd one out", () => {
    const s = assignSplit(cases);
    const count = (list: readonly CorpusCase[], cat: string) => list.filter((c) => c.category === cat).length;
    expect([count(s.tuning, "clean_apparel"), count(s.heldout, "clean_apparel")]).toEqual([4, 3]);
    expect([count(s.tuning, "injected_description"), count(s.heldout, "injected_description")]).toEqual([2, 2]);
  });

  it("keeps cases that share a group in the same split", () => {
    const s = assignSplit(cases);
    expect(s.byId.get("pad-a")).toBe(s.byId.get("pad-b"));
    expect(s.byId.get("pad-c")).not.toBe(s.byId.get("pad-a"));
    expect(splitUnit(cases.find((c) => c.id === "pad-a")!)).toBe("pad-filler-x");
    expect(splitUnit(cases.find((c) => c.id === "clean-1")!)).toBe("clean-1");
  });

  it("names its salt, so the rule can be rerun by hand", () => {
    expect(SPLIT_SALT).toMatch(/^laisee-judge-split-v\d+$/);
  });
});

describe("near-duplicate check", () => {
  it("shingles words, and single characters for Han script", () => {
    expect([...shingles("Soft cotton tee in white")]).toEqual(["soft cotton tee", "cotton tee in", "tee in white"]);
    expect(shingles("純棉短袖").size).toBe(2);
  });

  it("scores identical texts 1 and unrelated texts near 0", () => {
    expect(jaccard(shingles("a b c d"), shingles("a b c d"))).toBe(1);
    expect(jaccard(shingles("wool scarf in red"), shingles("laptop with a big battery"))).toBe(0);
  });

  it("flags near-duplicates but skips pairs inside one group", () => {
    const list = [
      fake("a", "clean_apparel", "Heavyweight cotton tee in white, boxy fit, sizes S to XL, free shipping."),
      fake("b", "clean_apparel", "Heavyweight cotton tee in white, boxy fit, sizes S to XL, free returns."),
      fake("c", "padding_attack", "same filler same filler same filler text", "g1"),
      fake("d", "padding_attack", "same filler same filler same filler text", "g1"),
    ];
    const pairs = nearDuplicatePairs(list, NEAR_DUPLICATE_JACCARD);
    expect(pairs.map((p) => [p.a, p.b])).toEqual([["a", "b"]]);
  });
});

describe("the real corpus split", () => {
  const corpus = loadCorpus();
  const split = assignSplit(corpus);

  it("has at least 160 cases, roughly half legitimate", () => {
    expect(corpus.length).toBeGreaterThanOrEqual(160);
    const legit = corpus.filter((c) => c.labels.escalate_or_proceed === "proceed").length;
    expect(legit / corpus.length).toBeGreaterThanOrEqual(0.4);
    expect(legit / corpus.length).toBeLessThanOrEqual(0.6);
  });

  it("puts every family in both splits", () => {
    for (const category of CORPUS_CATEGORIES) {
      expect(split.tuning.some((c) => c.category === category), `${category} in tuning`).toBe(true);
      expect(split.heldout.some((c) => c.category === category), `${category} in held-out`).toBe(true);
    }
  });

  it("has no near-duplicate pair across the split", () => {
    const cross = nearDuplicatePairs(corpus, NEAR_DUPLICATE_JACCARD).filter((p) => split.byId.get(p.a) !== split.byId.get(p.b));
    expect(cross).toEqual([]);
  });
});
