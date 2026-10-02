import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CORPUS_CATEGORIES,
  CorpusError,
  DEFAULT_CORPUS_DIR,
  deriveEscalateLabel,
  loadCorpus,
  parseCorpusFile,
} from "../src/judge/fit/corpus";

const corpus = loadCorpus();
const byCategory = (c: string) => corpus.filter((x) => x.category === c);

describe("data/judge-corpus", () => {
  it("has at least 60 SIMULATED labelled cases", () => {
    expect(corpus.length).toBeGreaterThanOrEqual(60);
  });

  it("covers every required family", () => {
    for (const category of CORPUS_CATEGORIES) expect(byCategory(category).length, category).toBeGreaterThan(0);
    expect(byCategory("clean_apparel").length).toBeGreaterThanOrEqual(10);
    expect(byCategory("unusual_shipping").length).toBeGreaterThanOrEqual(4);
    expect(byCategory("injected_description").length).toBeGreaterThanOrEqual(6);
    expect(byCategory("injected_review").length).toBeGreaterThanOrEqual(3);
    expect(byCategory("injected_polite").length).toBeGreaterThanOrEqual(3);
    expect(byCategory("injected_obfuscated").length).toBeGreaterThanOrEqual(5);
    expect(byCategory("negation_trap").length).toBeGreaterThanOrEqual(5);
    expect(byCategory("padding_attack").length).toBeGreaterThanOrEqual(3);
    expect(byCategory("off_category").length).toBeGreaterThanOrEqual(6);
    expect(byCategory("risky_seller").length).toBeGreaterThanOrEqual(6);
  });

  it("negation traps include both benign text that sounds like an attack and attacks that use negation", () => {
    const labels = new Set(byCategory("negation_trap").map((c) => c.labels.injection_risk));
    expect(labels.has("clean")).toBe(true);
    expect(labels.has("injection")).toBe(true);
  });

  it("has unique case ids and unique listing ids", () => {
    expect(new Set(corpus.map((c) => c.id)).size).toBe(corpus.length);
    expect(new Set(corpus.map((c) => c.listing.id)).size).toBe(corpus.length);
  });

  it("keeps every escalate_or_proceed label consistent with the other three", () => {
    for (const c of corpus) expect(c.labels.escalate_or_proceed, c.id).toBe(deriveEscalateLabel(c.labels));
  });

  it("uses only invented merchants on .example domains and marks every listing SIMULATED", () => {
    for (const c of corpus) {
      expect(c.listing.merchant.domain.endsWith(".example"), c.id).toBe(true);
      expect(c.listing.provenance).toBe("SIMULATED");
      expect(c.listing.merchant.name).toContain("(SIMULATED)");
    }
  });

  it("keeps padding attacks past the 1,024-token row: long text, attack in the last sentence", () => {
    const attacks = byCategory("padding_attack").filter((c) => c.labels.injection_risk === "injection" || c.labels.seller_risk === "high_risk");
    expect(attacks.length).toBeGreaterThanOrEqual(3);
    for (const c of attacks) {
      const text = c.listing.text;
      expect(text.length, c.id).toBeGreaterThanOrEqual(3_700);
      expect(text.length, c.id).toBeLessThanOrEqual(4_000);
      const cut = text.search(/SYSTEM NOTE|Dear AI shopping|Payment by bank transfer/);
      expect(cut, c.id).toBeGreaterThanOrEqual(3_500);
    }
  });

  it("contains no card-number-like digit runs, CVV mentions or real-looking contact data (I8)", () => {
    for (const file of readdirSync(DEFAULT_CORPUS_DIR)) {
      const text = readFileSync(join(DEFAULT_CORPUS_DIR, file), "utf8");
      expect(text, file).not.toMatch(/(?:\d[ -]?){13,19}/);
      expect(text.toLowerCase(), file).not.toMatch(/cvv/);
      for (const email of text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)*/g) ?? []) expect(email, file).toMatch(/\.(invalid|example)$/);
    }
  });
});

describe("parseCorpusFile", () => {
  const good = JSON.parse(readFileSync(join(DEFAULT_CORPUS_DIR, "mixed.json"), "utf8")) as Record<string, unknown>;
  const first = (good["cases"] as Record<string, unknown>[])[0] as Record<string, unknown>;
  const withCase = (patch: Record<string, unknown>) => ({ ...good, cases: [{ ...first, ...patch }] });

  it("accepts a good file", () => {
    expect(parseCorpusFile(good, "mixed.json")).toHaveLength(3);
  });

  it.each([
    ["not an object", 5],
    ["no cases", { ...good, cases: [] }],
    ["wrong provenance", { ...good, provenance: "OBSERVED" }],
    ["unknown category", withCase({ category: "nope" })],
    ["unknown label", withCase({ labels: { scope_fit: "maybe", injection_risk: "clean", seller_risk: "low_risk", escalate_or_proceed: "proceed" } })],
    ["bad Scameter state", withCase({ scameter_state: "UNKNOWN" })],
    ["listing that breaks the listing-record schema", withCase({ listing: { id: "x" } })],
    ["inconsistent escalate label", withCase({ labels: { scope_fit: "in_scope", injection_risk: "clean", seller_risk: "low_risk", escalate_or_proceed: "escalate" } })],
  ])("rejects %s", (_name, doc) => {
    expect(() => parseCorpusFile(doc, "x.json")).toThrow(CorpusError);
  });
});
