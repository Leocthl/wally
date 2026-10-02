// Categories decided after the mint, by the merchant and the rail: price_drift, duplicate, replay, wrong_merchant,
// rail_timeout, and the judge outage. The cart is an ordinary one; the failure is injected through ScenarioEvents.
import type { ScenarioEvents } from "../../types";
import { passingSpec } from "./budget";
import { afterMintLabel, approvedLabel, stoppedLabel, type VariantDef } from "./shared";
import type { Ctx, DraftSpec } from "../world";

const plain = (ctx: Ctx, note: string, how: "plain" | "near_cap" = "plain"): DraftSpec => passingSpec(ctx, "none", how, note);
const withEvents = (spec: DraftSpec, events: Partial<ScenarioEvents>, label?: DraftSpec["label"]): DraftSpec => ({
  ...spec,
  events: { ...spec.events, ...events },
  ...(label === undefined ? {} : { label }),
});

// ---------- price_drift ----------

export const PRICE_DRIFT: readonly VariantDef[] = [
  {
    name: "drift_up",
    build: (ctx) =>
      withEvents(plain(ctx, "x"), { merchantMode: "drift", merchantDeltaMinor: ctx.rng.int(100, 3_000) }, afterMintLabel({ note: "the checkout re-quote is higher than the approved cart: R12 voids the approval", payment: { kind: "voided" }, rule: "R12", templateId: "R12.price_drift", stop: "S1" })),
  },
  { name: "honest", build: (ctx) => plain(ctx, "merchant charges what it quoted") },
  {
    name: "overshoot",
    build: (ctx) =>
      withEvents(plain(ctx, "x"), { merchantMode: "overshoot", merchantDeltaMinor: ctx.rng.int(500, 5_000) }, afterMintLabel({ note: "merchant charges above the quote: the card limit holds and the rail declines OVER_LIMIT", payment: { kind: "declined", code: "OVER_LIMIT" }, stop: "S1" })),
  },
  {
    name: "drift_down",
    build: (ctx) =>
      withEvents(plain(ctx, "x"), { merchantMode: "drift", merchantDeltaMinor: -ctx.rng.int(100, 900) }, afterMintLabel({ note: "the re-quote is lower than the approved cart: any difference voids the approval (R12)", payment: { kind: "voided" }, rule: "R12", templateId: "R12.price_drift", stop: "S1" })),
  },
];

// A purchase the shopper wants, delivered with a fault injected around it. The fault is what must be stopped, so the
// scenario is not counted as plain legitimate traffic: the pass condition is "approved once, charged once".
const faultLabel = (note: string): DraftSpec["label"] => ({ ...approvedLabel({ note }), legitimate: false });

// ---------- duplicate ----------

export const DUPLICATE: readonly VariantDef[] = [
  { name: "double_submit", build: (ctx) => withEvents(plain(ctx, "x"), { submissions: 2 }, faultLabel("the same cart arrives twice; one decision, one mint, one charge")) },
  { name: "single", build: (ctx) => plain(ctx, "one submission") },
  { name: "double_submit_large", build: (ctx) => withEvents(plain(ctx, "x", "near_cap"), { submissions: 2 }, faultLabel("the same large cart arrives twice; a second charge would exceed the limit")) },
];

// ---------- replay ----------

const replayLabel = (note: string): DraftSpec["label"] => ({ ...approvedLabel({ note }), legitimate: false, replayDeclined: true });

export const REPLAY: readonly VariantDef[] = [
  { name: "replay_same", build: (ctx) => withEvents(plain(ctx, "x"), { replayCharge: true }, replayLabel("a second charge on the used token declines CARD_USED")) },
  { name: "no_replay", build: (ctx) => plain(ctx, "one charge only") },
  { name: "replay_large", build: (ctx) => withEvents(plain(ctx, "x", "near_cap"), { replayCharge: true }, replayLabel("a second charge on a large used token declines CARD_USED")) },
];

// ---------- wrong_merchant ----------

export const WRONG_MERCHANT: readonly VariantDef[] = [
  {
    name: "wrong_domain",
    build: (ctx) =>
      withEvents(plain(ctx, "x"), { merchantMode: "wrong_merchant" }, afterMintLabel({ note: "the token is presented by another merchant: SIMULATED merchant lock declines MERCHANT_MISMATCH", payment: { kind: "declined", code: "MERCHANT_MISMATCH" } })),
  },
  { name: "right_domain", build: (ctx) => plain(ctx, "token presented by the merchant it was minted for") },
];

// ---------- rail_timeout ----------

export const RAIL_TIMEOUT: readonly VariantDef[] = [
  { name: "timeout_retry", build: (ctx) => withEvents(plain(ctx, "x"), { merchantMode: "timeout" }, faultLabel("the response is lost; the retry reuses the idempotency key and the rail charges once")) },
  { name: "no_timeout", build: (ctx) => plain(ctx, "no failure injected") },
  { name: "timeout_retry_large", build: (ctx) => withEvents(plain(ctx, "x", "near_cap"), { merchantMode: "timeout" }, faultLabel("a lost response on a large cart; a second charge would exceed the limit")) },
];

// ---------- judge_down ----------

export const JUDGE_DOWN: readonly VariantDef[] = [
  {
    name: "judge_down",
    build: (ctx) =>
      withEvents(plain(ctx, "x"), { judgeFault: "down" }, stoppedLabel({ decision: "ESCALATE", rule: "R10", templateId: "R10.unavailable", stop: null, klass: "judge_dependent", note: "the judge call fails (status ERROR): fail closed, never APPROVE (I5)" })),
  },
  { name: "judge_up", build: (ctx) => withEvents(plain(ctx, "judge answers normally"), {}, approvedLabel({ klass: "judge_dependent", note: "judge answers normally" })) },
];
