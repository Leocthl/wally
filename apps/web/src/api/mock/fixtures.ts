// SIMULATED fixtures bundled into the offline booth (data/fixtures, read only). Each envelope is validated against its
// schema when this module loads, so a bad fixture fails loudly instead of rendering a wrong demo (CLAUDE.md, ADR-0006).
import { formatIssues, VALIDATORS, type SchemaName, type SchemaTypes } from "@laisee/core/schema";
import sockListing from "@fixtures/listings/apparel-socks.json";
import teeListing from "@fixtures/listings/apparel-tee.json";
import earbudsListing from "@fixtures/listings/off-category-earbuds.json";
import hoodieListing from "@fixtures/listings/flagged-seller-hoodie.json";
import injectedListing from "@fixtures/listings/injected-tee.json";
import jacketListing from "@fixtures/listings/streetwear-jacket.json";
import socksJudge from "@fixtures/judge/apparel-socks.json";
import teeJudge from "@fixtures/judge/apparel-tee.json";
import earbudsJudge from "@fixtures/judge/off-category-earbuds.json";
import hoodieJudge from "@fixtures/judge/flagged-seller-hoodie.json";
import injectedJudge from "@fixtures/judge/injected-tee.json";
import jacketJudge from "@fixtures/judge/streetwear-jacket.json";
import cart1 from "@fixtures/carts/attempt-1.json";
import credentialM0 from "@fixtures/mandate/m0.credential.json";
import plannerAttempt1 from "@fixtures/planner/attempt-1.json";
import plannerAttempt2 from "@fixtures/planner/attempt-2.json";
import plannerAttempt3 from "@fixtures/planner/attempt-3.json";
import plannerAttempt3b from "@fixtures/planner/attempt-3b.json";
import plannerAttempt4 from "@fixtures/planner/attempt-4.json";
import scameterApparel from "@fixtures/scameter/demo-apparel.json";
import scameterFlagged from "@fixtures/scameter/flagged-seller.json";
import scameterGadgets from "@fixtures/scameter/demo-gadgets.json";
import scameterOutlet from "@fixtures/scameter/demo-outlet.json";
import scameterStale from "@fixtures/scameter/stale.json";
import scameterStreetwear from "@fixtures/scameter/demo-streetwear.json";

interface Envelope {
  readonly provenance: string;
  readonly schema: string;
  readonly data: unknown;
}

function load<N extends SchemaName>(name: N, envelope: Envelope): SchemaTypes[N] {
  if (envelope.provenance !== "SIMULATED" || envelope.schema !== name) throw new Error(`fixture is not a SIMULATED ${name}`);
  const result = VALIDATORS[name](envelope.data);
  if (!result.ok) throw new Error(`fixture invalid (${name}): ${formatIssues(result.errors)}`);
  return result.value as SchemaTypes[N];
}

export const LISTINGS = {
  tee: load("listing-record", teeListing),
  socks: load("listing-record", sockListing),
  hoodie: load("listing-record", hoodieListing),
  jacket: load("listing-record", jacketListing),
  injected: load("listing-record", injectedListing),
  earbuds: load("listing-record", earbudsListing),
} as const;

export const JUDGE_RECORDS = {
  tee: load("judge-record", teeJudge),
  socks: load("judge-record", socksJudge),
  hoodie: load("judge-record", hoodieJudge),
  jacket: load("judge-record", jacketJudge),
  injected: load("judge-record", injectedJudge),
  earbuds: load("judge-record", earbudsJudge),
} as const;

export const PLANNER_REPLAYS = {
  tee: load("planner-replay", plannerAttempt1),
  hoodie: load("planner-replay", plannerAttempt2),
  jacket: load("planner-replay", plannerAttempt3),
  injected: load("planner-replay", plannerAttempt3b),
  socks: load("planner-replay", plannerAttempt4),
} as const;

export const SCAMETER = {
  apparel: load("scameter-capture", scameterApparel),
  streetwear: load("scameter-capture", scameterStreetwear),
  outlet: load("scameter-capture", scameterOutlet),
  flagged: load("scameter-capture", scameterFlagged),
  stale: load("scameter-capture", scameterStale),
  gadgets: load("scameter-capture", scameterGadgets),
} as const;

/** Reference cart: its proposed_at minus scameter.captured_at is the usual capture age, reused to restamp captures. */
export const REFERENCE_CART = load("cart", cart1);
export const M0_CREDENTIAL = load("mandate-credential", credentialM0);
