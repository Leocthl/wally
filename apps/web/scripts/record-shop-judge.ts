// Records data/photo-shelf/judge.json: one judge answer per photo-shelf item, from the running local Laya server, so the
// on-device build (which has no judge model) can approve a picked item the way the booth does. Same call the booth makes:
// the real cart the cart builder makes for the item, the demo mandate M0, option-order rotations averaged. Raw
// probabilities only (R10 applies the thresholds). Any failed call writes nothing.
//
//   pnpm --filter @wally/web exec tsx scripts/record-shop-judge.ts [--base-url http://127.0.0.1:8808] [--date 2026-10-03]
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createJudgeFromEnv } from "@wally/agent/judge";
import { buildCart } from "@wally/core/cart";
import { ENGINE_CONFIG } from "@wally/core/config";
import { FakeClock } from "@wally/core/testing";
import { formatIssues, validateMandate } from "@wally/core/schema";
import { scameterLookup } from "../src/booth/backend/catalogue";
import { loadCatalogue } from "../server/booth/catalogue";
import { loadScenarioTable } from "../server/booth/scenarioTable";

const DATA = join(import.meta.dirname, "../../../data");
const { values } = parseArgs({ options: { "base-url": { type: "string", default: "http://127.0.0.1:8808" }, date: { type: "string", default: new Date().toISOString().slice(0, 10) } } });

const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
const mandateRaw = JSON.parse(readFileSync(join(DATA, "fixtures/mandate/m0.json"), "utf8")) as { data: unknown };
const mandate = validateMandate(mandateRaw.data);
if (!mandate.ok) throw new Error(`mandate/m0.json: ${formatIssues(mandate.errors)}`);

const table = loadScenarioTable(join(DATA, "scenarios/booth.json"));
const catalogue = loadCatalogue(join(DATA, "fixtures"), table);
const clock = new FakeClock(new Date("2026-10-03T02:30:00Z"));
const scameter = scameterLookup(catalogue, clock);
const judge = createJudgeFromEnv({ JUDGE_PROVIDER: "laya", JUDGE_MODE: "enforce", LAYA_BASE_URL: values["base-url"], LAYA_MODEL: "typed-decisions" });

const MIN_MARGIN = 0.03;
const tooClose: string[] = [];
const records: unknown[] = [];
for (const { listing } of catalogue.shop.values()) {
  const title = listing.items[0]?.title ?? "";
  const built = buildCart({ proposal: { listing_url: listing.url, items: [{ title, qty: 1 }] }, listings: [listing], mandate: mandate.value, now: clock.now(), ids: { cartId: () => "crt_shopRecord1", runId: () => "run_x" }, scameterByRef: scameter });
  if (!built.ok) throw new Error(`${listing.id}: cart ${built.code}`);
  const record = await judge.assess({ intentText: mandate.value.intent_text, rules: mandate.value.rules, cart: built.cart, listingText: listing.text, scameter: built.cart.scameter }, { timeoutMs: 30_000 });
  if (record.status !== "OK" || record.answers === undefined) throw new Error(`${listing.id}: ${record.status}; nothing written`);
  records.push({
    listing: listing.id,
    text_sha256: sha256(listing.text),
    record: { provider: "replay", model: record.model, version: `recorded@${record.version}`, status: "OK", latency_ms: Math.round(record.latency_ms), shadow: false, answers: record.answers },
  });
  // R10 margins [F36, F50]: the injection sum must stay under t_inj, scope and proceed above their limits, with room to spare.
  const a = record.answers;
  const margins = {
    injection: ENGINE_CONFIG.judge.t_inj - (a.injection_risk.suspicious + a.injection_risk.injection),
    scope: a.scope_fit.in_scope - ENGINE_CONFIG.judge.t_scope,
    proceed: a.escalate_or_proceed.proceed - (1 - ENGINE_CONFIG.judge.t_esc),
    seller: ENGINE_CONFIG.judge.t_sell_esc - a.seller_risk.high_risk,
  };
  const worst = Math.min(...Object.values(margins));
  process.stdout.write(`${listing.id.padEnd(26)} margins injection ${margins.injection.toFixed(3)} scope ${margins.scope.toFixed(3)} proceed ${margins.proceed.toFixed(3)} seller ${margins.seller.toFixed(3)}${worst < MIN_MARGIN ? "  <-- TOO CLOSE" : ""}\n`);
  if (worst < MIN_MARGIN) tooClose.push(listing.id);
}
if (tooClose.length > 0) throw new Error(`these items are within ${MIN_MARGIN} of an R10 limit; reword their text: ${tooClose.join(", ")}; nothing written`);
const envelope = {
  fixture: "shop/judge",
  provenance: "SIMULATED",
  schema: "photo-shelf-judge",
  note: `Recorded from live Laya on ${values.date} (model typed-decisions, option-order rotations averaged) for the SIMULATED photo-shelf listings, with the real cart the cart builder makes for each and the demo mandate M0. MEASURED(1) raw probabilities on SIMULATED listings; R10 applies the thresholds. Served by the on-device replay judge, keyed by the SHA-256 of the listing text.`,
  data: { records },
};
writeFileSync(join(DATA, "photo-shelf/judge.json"), `${JSON.stringify(envelope, null, 2)}\n`);
process.stdout.write(`wrote ${records.length} records\n`);
