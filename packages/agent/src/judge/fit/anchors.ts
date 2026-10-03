// The six SIMULATED demo listings in data/fixtures, as the orchestrator would pass them to the judge, with the
// recorded (replay) answers beside them. Read-only: nothing under data/fixtures is written.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import type { Cart, JudgeAnswers, ListingRecord, Mandate } from "@wally/core/generated";
import type { JudgeInput } from "@wally/core/ports";
import { formatIssues, validateCart, validateListingRecord } from "@wally/core/schema";
import { isRecord } from "../guards";
import { DEFAULT_FIXTURES_DIR, loadReplayRecordings } from "../replay-recordings";
import { cartFromListing, sha256Hex } from "./inputs";

export interface Anchor {
  readonly name: string;
  readonly note: string;
  readonly input: JudgeInput;
  /** Answers from data/fixtures/judge (placeholders, not measurements [F59]); null if none. */
  readonly recorded: JudgeAnswers | null;
}

const NOTES: Readonly<Record<string, string>> = {
  "apparel-tee": "attempt 1 (DM2): should pass",
  "flagged-seller-hoodie": "attempt 2 (S2): R9 stops it; the judge seller score should agree",
  "streetwear-jacket": "attempt 3 (S1): R3 stops it; the judge should pass",
  "injected-tee": "attempt 3b (S3): R10 must DENY",
  "apparel-socks": "attempt 4 (DM6): should pass",
  "off-category-earbuds": "off-category: R6 stops it; the judge scope should ESCALATE",
};

function readData(path: string): unknown {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!isRecord(raw) || !("data" in raw)) throw new Error(`${path}: not a fixture envelope`);
  return raw["data"];
}

function readList<T>(dir: string, sub: string, check: (d: unknown) => { ok: true; value: T } | { ok: false; errors: Parameters<typeof formatIssues>[0] }): readonly T[] {
  const folder = join(dir, sub);
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const result = check(readData(join(folder, f)));
      if (!result.ok) throw new Error(`${sub}/${f}: ${formatIssues(result.errors)}`);
      return result.value;
    });
}

export function loadAnchors(mandate: Mandate, dir: string = DEFAULT_FIXTURES_DIR): readonly Anchor[] {
  const listings = readList<ListingRecord>(dir, "listings", validateListingRecord);
  const carts = readList<Cart>(dir, "carts", validateCart);
  const recordings = loadReplayRecordings(dir);
  const files = readdirSync(join(dir, "listings")).filter((f) => f.endsWith(".json")).sort();
  return listings.map((listing, i) => {
    const cart = carts.find((c) => c.listing.url === listing.url) ?? cartFromListing(listing, "NO_RECORD");
    const name = basename(files[i] ?? `listing-${i}`, ".json");
    const recorded = recordings.find((r) => r.fingerprint === sha256Hex(listing.text))?.record.answers ?? null;
    return {
      name,
      note: NOTES[name] ?? "",
      input: { intentText: mandate.intent_text, rules: mandate.rules, cart, listingText: listing.text, scameter: cart.scameter },
      recorded,
    };
  });
}
