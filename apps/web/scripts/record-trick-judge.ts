// Records data/trick-examples/judge.json: the judge's answer for each recorded "Try to trick Wally" example
// (src/booth/trickExamples.ts), from the running local Laya server, so a host with no live judge can show a real stop for
// them. Same call the booth makes for a visitor's listing: the real cart the cart builder makes for it, the demo mandate
// M0, option-order rotations averaged. Raw probabilities only (R10 applies the thresholds). An example the rules would let
// through is an error: it is there to be stopped. Any failed call writes nothing.
//
//   pnpm --filter @wally/web exec tsx scripts/record-trick-judge.ts [--base-url http://127.0.0.1:8808] [--date 2026-10-03]
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createJudgeFromEnv } from "@wally/agent/judge";
import { buildCart } from "@wally/core/cart";
import { ENGINE_CONFIG } from "@wally/core/config";
import { FakeClock } from "@wally/core/testing";
import { formatIssues, validateMandate } from "@wally/core/schema";
import { scameterLookup, visitorListing } from "../src/booth/backend/catalogue";
import { TRICK_EXAMPLES } from "../src/booth/trickExamples";
import { listingsFor } from "../server/booth/catalogue";
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
const [base] = listingsFor(catalogue, table.custom.listings);
if (base === undefined) throw new Error("the visitor listing is missing from the catalogue");

const records: unknown[] = [];
for (const example of TRICK_EXAMPLES) {
  const listing = visitorListing(base, example.text, clock.now());
  const title = listing.items[0]?.title ?? "";
  const built = buildCart({ proposal: { listing_url: listing.url, items: [{ title, qty: 1 }] }, listings: [listing], mandate: mandate.value, now: clock.now(), ids: { cartId: () => "crt_trickRecord1", runId: () => "run_x" }, scameterByRef: scameter });
  if (!built.ok) throw new Error(`${example.id}: cart ${built.code}`);
  const record = await judge.assess({ intentText: mandate.value.intent_text, rules: mandate.value.rules, cart: built.cart, listingText: listing.text, scameter: built.cart.scameter }, { timeoutMs: 60_000 });
  if (record.status !== "OK" || record.answers === undefined) throw new Error(`${example.id}: ${record.status}; nothing written`);
  const a = record.answers;
  const cfg = ENGINE_CONFIG.judge;
  const stops = {
    injection: a.injection_risk.suspicious + a.injection_risk.injection >= cfg.t_inj,
    scope: a.scope_fit.in_scope < cfg.t_scope,
    escalate: a.escalate_or_proceed.proceed < 1 - cfg.t_esc,
    seller: a.seller_risk.high_risk >= cfg.t_sell_esc,
  };
  process.stdout.write(`${example.id.padEnd(14)} ${String(listing.text.length).padStart(5)} chars  injection ${(a.injection_risk.suspicious + a.injection_risk.injection).toFixed(3)} (limit ${cfg.t_inj}) scope ${a.scope_fit.in_scope.toFixed(3)} proceed ${a.escalate_or_proceed.proceed.toFixed(3)}  stops: ${Object.entries(stops).filter(([, on]) => on).map(([name]) => name).join(", ") || "NONE"}\n`);
  if (!Object.values(stops).some(Boolean)) throw new Error(`${example.id}: the rules would let this example through; reword it; nothing written`);
  records.push({
    example: example.id,
    text_sha256: sha256(listing.text),
    record: { provider: "replay", model: record.model, version: `recorded@${record.version}`, status: "OK", latency_ms: Math.round(record.latency_ms), shadow: false, answers: record.answers },
  });
}
const envelope = {
  fixture: "trick-examples/judge",
  provenance: "SIMULATED",
  schema: "trick-examples-judge",
  note: `Recorded from live Laya on ${values.date} (model typed-decisions, option-order rotations averaged) for the three SIMULATED "Try to trick Wally" examples in src/booth/trickExamples.ts, with the real cart the cart builder makes for each and the demo mandate M0. MEASURED(1) raw probabilities on SIMULATED listings; R10 applies the thresholds. Served by the replay judges (the on-device page and a booth running JUDGE_PROVIDER=replay), keyed by the SHA-256 of the listing text.`,
  data: { records },
};
writeFileSync(join(DATA, "trick-examples/judge.json"), `${JSON.stringify(envelope, null, 2)}\n`);
process.stdout.write(`wrote ${records.length} records\n`);
