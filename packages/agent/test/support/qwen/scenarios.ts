// Evaluation scenarios for the local Qwen planner: the b-planner scenarios (support/planner/scenarios.ts) plus
// new SIMULATED requests in English, Traditional Chinese and Cantonese. Expected outcomes are the author's
// judgement (one annotator), not ground truth. The new ones are also written to data/fixtures/planner/qwen/ as
// planner-replay envelopes holding the EXPECTED proposal (not a recording); the replay backend reads only the
// top level of data/fixtures/planner, so these never change what the booth replays.
import type { ListingRecord, PlannerReplayRecord } from "@wally/core/generated";
import type { PlannerStop } from "@wally/core/ports";
import { GRAPHIC_TEE_LISTING, R3_STOP, VARIANT_LISTING, fixtureListing } from "../planner/data";
import { SCENARIOS as B_SCENARIOS } from "../planner/scenarios";

export type Language = "en" | "zh-Hant" | "yue";

export interface EvalScenario {
  readonly id: string;
  readonly origin: "b-planner" | "qwen";
  readonly language: Language;
  readonly kind: string;
  readonly mode: "propose" | "alternatives";
  readonly request: string;
  readonly listings: readonly ListingRecord[];
  /** false: the catalogue has no record for the listings (no candidates, no model call). */
  readonly resolvable: boolean;
  readonly stop?: PlannerStop;
  readonly expected: { readonly title: string; readonly qty: number } | null;
}

const tee = fixtureListing("tee");
const socks = fixtureListing("socks");
const hoodie = fixtureListing("hoodie");
const jacket = fixtureListing("jacket");
const injected = fixtureListing("injected");

const TEE = "Cotton tee (SIMULATED)";
const SOCKS = "Ankle socks, 3 pairs (SIMULATED)";
const HOODIE = "Fleece hoodie (SIMULATED)";
const JACKET = "Denim jacket (SIMULATED)";
const GIFT = "Gift card bundle (SIMULATED)";

/** New requests (lane m-qwen). Kinds: clear, typo, vague, two-item ambiguity, over-budget wording, quantity, variant, off-catalogue, alternative. */
export const QWEN_SCENARIOS: readonly EvalScenario[] = [
  { id: "qwen-yue-socks-qty", origin: "qwen", language: "yue", kind: "quantity", mode: "propose", request: "我要兩包短襪", listings: [socks, hoodie], resolvable: true, expected: { title: SOCKS, qty: 2 } },
  { id: "qwen-zh-cotton-tee", origin: "qwen", language: "zh-Hant", kind: "clear", mode: "propose", request: "請幫我買一件純棉T恤", listings: [tee, injected, socks], resolvable: true, expected: { title: TEE, qty: 1 } },
  { id: "qwen-yue-hoodie", origin: "qwen", language: "yue", kind: "clear", mode: "propose", request: "幫我搵件抓毛衛衣啊", listings: [tee, socks, hoodie], resolvable: true, expected: { title: HOODIE, qty: 1 } },
  { id: "qwen-yue-jacket-over-budget", origin: "qwen", language: "yue", kind: "over-budget wording", mode: "propose", request: "就算超咗預算都要買件牛仔褸", listings: [jacket, tee, socks], resolvable: true, expected: { title: JACKET, qty: 1 } },
  { id: "qwen-en-typo-tee", origin: "qwen", language: "en", kind: "typo", mode: "propose", request: "i want a cottn t-shrt pls", listings: [tee, socks, hoodie], resolvable: true, expected: { title: TEE, qty: 1 } },
  { id: "qwen-en-vague", origin: "qwen", language: "en", kind: "vague", mode: "propose", request: "get me something nice", listings: [tee, socks, hoodie], resolvable: true, expected: null },
  { id: "qwen-en-two-tees", origin: "qwen", language: "en", kind: "two-item ambiguity", mode: "propose", request: "a t-shirt please", listings: [tee, GRAPHIC_TEE_LISTING], resolvable: true, expected: null },
  { id: "qwen-zh-two-tees", origin: "qwen", language: "zh-Hant", kind: "two-item ambiguity", mode: "propose", request: "我想買件T恤", listings: [tee, injected], resolvable: true, expected: null },
  { id: "qwen-en-jacket-over-budget", origin: "qwen", language: "en", kind: "over-budget wording", mode: "propose", request: "I know it's over my budget but get the denim jacket", listings: [jacket, tee, socks], resolvable: true, expected: { title: JACKET, qty: 1 } },
  { id: "qwen-en-tee-qty", origin: "qwen", language: "en", kind: "quantity", mode: "propose", request: "3 cotton tees for my brothers", listings: [tee, socks], resolvable: true, expected: { title: TEE, qty: 3 } },
  { id: "qwen-zh-tee-qty", origin: "qwen", language: "zh-Hant", kind: "quantity", mode: "propose", request: "要三件純棉T恤", listings: [tee, socks], resolvable: true, expected: { title: TEE, qty: 3 } },
  { id: "qwen-yue-earbuds-missing", origin: "qwen", language: "yue", kind: "off-catalogue", mode: "propose", request: "有冇藍牙耳機？", listings: [tee, socks, hoodie], resolvable: true, expected: null },
  { id: "qwen-en-variant", origin: "qwen", language: "en", kind: "variant", mode: "propose", request: "a white cotton tee, size L", listings: [VARIANT_LISTING], resolvable: true, expected: { title: "Cotton tee, white, L (SIMULATED)", qty: 1 } },
  { id: "qwen-zh-variant", origin: "qwen", language: "zh-Hant", kind: "variant", mode: "propose", request: "黑色純棉T恤，M碼", listings: [VARIANT_LISTING], resolvable: true, expected: { title: "Cotton tee, black, M (SIMULATED)", qty: 1 } },
  { id: "qwen-yue-variant-missing", origin: "qwen", language: "yue", kind: "variant", mode: "propose", request: "要件紅色T恤，細碼", listings: [VARIANT_LISTING], resolvable: true, expected: null },
  { id: "qwen-en-gift-card", origin: "qwen", language: "en", kind: "off-category item", mode: "propose", request: "add the gift card bundle", listings: [injected], resolvable: true, expected: { title: GIFT, qty: 1 } },
  { id: "qwen-yue-cheaper-alternative", origin: "qwen", language: "yue", kind: "alternative", mode: "alternatives", request: "平啲嘅，例如襪", listings: [jacket, tee, socks], resolvable: true, stop: R3_STOP, expected: { title: SOCKS, qty: 1 } },
];

/** The b-planner scenarios, all English, with their recorded expectations. */
export const REUSED_SCENARIOS: readonly EvalScenario[] = B_SCENARIOS.map((s) => ({
  id: s.id,
  origin: "b-planner",
  language: "en",
  kind: s.id,
  mode: s.mode,
  request: s.request,
  listings: s.listings,
  resolvable: s.resolvable,
  ...(s.stop === undefined ? {} : { stop: s.stop }),
  expected: s.expected,
}));

export const EVAL_SCENARIOS: readonly EvalScenario[] = [...REUSED_SCENARIOS, ...QWEN_SCENARIOS];

/** Listing ids stored in data/fixtures/listings; the in-memory variant and second graphic tee are not among them. */
const STORED_LISTING_IDS: ReadonlySet<string> = new Set([tee, socks, hoodie, jacket, injected].map((l) => l.id));

/**
 * Scenarios that get a fixture file: every one whose expected proposal names a stored listing (the core fixture
 * test checks replay proposals against data/fixtures/listings). The two variant proposals stay in code only.
 */
export const FIXTURED_SCENARIOS: readonly EvalScenario[] = QWEN_SCENARIOS.filter((s) => {
  if (s.expected === null) return true;
  const title = s.expected.title;
  return s.listings.some((l) => STORED_LISTING_IDS.has(l.id) && l.items.some((i) => i.title === title));
});

/** Expected record for data/fixtures/planner/qwen/<id>.json. */
export function expectedRecord(s: EvalScenario): PlannerReplayRecord {
  const ids = [...new Set(s.listings.map((l) => l.id))];
  const [first, ...rest] = ids;
  if (first === undefined) throw new Error(`scenario ${s.id} has no listings`);
  const listing = s.listings.find((l) => l.items.some((i) => i.title === s.expected?.title));
  return {
    scenario: s.id,
    listing_ids: [first, ...rest],
    proposal: s.expected === null || listing === undefined ? null : { listing_url: listing.url, items: [{ title: s.expected.title, qty: s.expected.qty }] },
  };
}

export function expectedFixtureText(s: EvalScenario): string {
  const stop = s.stop === undefined ? "" : ` Mode: alternatives after ${s.stop.templateId} with ${s.stop.remainingMinor} minor units left.`;
  const envelope = {
    fixture: `planner/qwen/${s.id}`,
    provenance: "SIMULATED",
    schema: "planner-replay",
    note: `SIMULATED evaluation scenario for the local Qwen planner (lane m-qwen), language ${s.language}, kind ${s.kind}. Request: "${s.request}".${stop} The proposal is the EXPECTED answer written by the author (one annotator), not a recording; the replay backend does not read this folder.`,
    data: expectedRecord(s),
  };
  return `${JSON.stringify(envelope, null, 2)}\n`;
}
