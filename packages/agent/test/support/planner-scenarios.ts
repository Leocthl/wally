// The recorded planner scenarios (data/fixtures/planner): inputs live here, outputs in the fixture files.
// `recordScenario` runs the rule planner against the offline mock of Laya, so fixtures can be regenerated
// (UPDATE_PLANNER_FIXTURES=1) and the golden test notices any drift. All SIMULATED.
import type { ListingRecord, PlannerReplayRecord } from "@laisee/core/generated";
import type { PlannerStop, PlannerTraceStep } from "@laisee/core/ports";
import { createRulePlanner } from "../../src/planner/rule-planner";
import { OPTS, R3_STOP, VARIANT_LISTING, ctxOf, fixtureListing } from "./planner-data";

const tee = fixtureListing("tee");
const socks = fixtureListing("socks");
const jacket = fixtureListing("jacket");
const hoodie = fixtureListing("hoodie");
const injected = fixtureListing("injected");

/** A shop link the catalogue has no record for: the planner has no structured candidates for it. */
const UNKNOWN_SHOP: ListingRecord = { ...tee, id: "lst_unknownShop", url: "https://unknown-shop.example/p/1" };

export interface PlannerScenario {
  readonly id: string;
  readonly mode: "propose" | "alternatives";
  readonly request: string;
  readonly listings: readonly ListingRecord[];
  /** false: the planner's catalogue lacks the listings (empty candidates). */
  readonly resolvable: boolean;
  readonly stop?: PlannerStop;
  readonly what: string;
  /** Expected title and quantity of the recorded proposal, or null for no proposal. */
  readonly expected: { readonly title: string; readonly qty: number } | null;
}

export const SCENARIOS: readonly PlannerScenario[] = [
  { id: "clear-request", mode: "propose", request: "I want a cotton tee", listings: [tee, injected, socks], resolvable: true, what: "clear request: two tees fit the words, Laya picks the cotton tee by a wide margin", expected: { title: "Cotton tee (SIMULATED)", qty: 1 } },
  { id: "ambiguous-request", mode: "propose", request: "something to wear", listings: [tee, socks, hoodie], resolvable: true, what: "ambiguous request, no item stands out so the planner asks the shopper", expected: null },
  { id: "unavailable-variant", mode: "propose", request: "a red cotton tee in size M", listings: [VARIANT_LISTING], resolvable: true, what: "the colour asked for is not among the listed options", expected: null },
  { id: "over-budget", mode: "propose", request: "a denim jacket", listings: [jacket, tee, socks], resolvable: true, what: "the planner proposes the jacket; the engine stops it at HK$550 against HK$541 left (R3)", expected: { title: "Denim jacket (SIMULATED)", qty: 1 } },
  { id: "over-budget-alternative", mode: "alternatives", request: "something cheaper, like ankle socks", listings: [jacket, tee, socks], resolvable: true, stop: R3_STOP, what: "replan after the R3 stop: the cheaper item that fits what is left", expected: { title: "Ankle socks, 3 pairs (SIMULATED)", qty: 1 } },
  { id: "injected-description", mode: "propose", request: "a graphic tee", listings: [injected, socks], resolvable: true, what: "the listing text gives orders; the planner never reads it, so the choice is unchanged", expected: { title: "Graphic tee (SIMULATED)", qty: 1 } },
  { id: "empty-candidates", mode: "propose", request: "a cotton tee", listings: [UNKNOWN_SHOP], resolvable: false, what: "a shop link with no listing record: no candidates, no proposal", expected: null },
  { id: "near-equal-items", mode: "propose", request: "a tee", listings: [tee, injected], resolvable: true, what: "two tees fit the request equally well, so the planner asks the shopper", expected: null },
  { id: "quantity-request", mode: "propose", request: "I want 2 packs of ankle socks", listings: [socks, hoodie], resolvable: true, what: "the request states a quantity", expected: { title: "Ankle socks, 3 pairs (SIMULATED)", qty: 2 } },
];

export function scenarioContext(s: PlannerScenario) {
  return ctxOf(s.request, s.listings);
}

export function scenarioListingIds(s: PlannerScenario): [string, ...string[]] {
  const [first, ...rest] = [...new Set(s.listings.map((l) => l.id))];
  if (first === undefined) throw new Error(`scenario ${s.id} has no listings`);
  return [first, ...rest];
}

/** Runs the rule planner for one scenario against a Laya server (the offline mock in CI). */
export async function recordScenario(s: PlannerScenario, layaUrl: string): Promise<PlannerReplayRecord> {
  const steps: PlannerTraceStep[] = [];
  const planner = createRulePlanner({ catalogue: s.resolvable ? s.listings : [], layaUrl });
  const opts = { ...OPTS, onTrace: (step: PlannerTraceStep) => steps.push(step) };
  const proposal =
    s.mode === "alternatives" && s.stop !== undefined
      ? await planner.alternatives?.(scenarioContext(s), s.stop, opts)
      : await planner.propose(scenarioContext(s), opts);
  const shown = steps.find((x) => x.question === "item_choice") ?? steps[0];
  return {
    scenario: s.id,
    listing_ids: scenarioListingIds(s),
    proposal: proposal ?? null,
    ...(shown === undefined
      ? {}
      : { trace: { provider: "laya" as const, question: shown.question, probabilities: shown.probabilities, choice: shown.choice } }),
  };
}

/** The fixture envelope as written to data/fixtures/planner/<id>.json. */
export function fixtureText(s: PlannerScenario, data: PlannerReplayRecord): string {
  const envelope = {
    fixture: `planner/${s.id}`,
    provenance: "SIMULATED",
    schema: "planner-replay",
    note: `SIMULATED recorded planner output for ${s.id} (replay backend). ${s.what}. Request: "${s.request}". Recorded from the rule planner against the offline test mock of Laya, not the live server; trace probabilities are placeholders [F59].`,
    data,
  };
  return `${JSON.stringify(envelope, null, 2)}\n`;
}
