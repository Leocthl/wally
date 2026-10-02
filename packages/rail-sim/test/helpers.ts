// Shared builders for rail-sim tests. Everything here is SIMULATED test data.
import type { CardRecord, Cart, Decision } from "@laisee/core/generated";
import type { CardEvent } from "@laisee/core/ports";
import { loadFixture } from "@laisee/core/testing/fixtures";
import { RAIL_SIM_DEFAULTS, RailSim, seededRandom, type RailSimOptions } from "../src";

export const NOW = new Date("2026-10-03T02:05:02Z");
export const MINUTE_MS = 60_000;
/** The rail's own card TTL [F30]. Read from config, never restated, so a re-based row cannot break a test. */
export const CARD_TTL_MS = RAIL_SIM_DEFAULTS.maxTtlMs;
export const MERCHANT = "demo-apparel.example";

const BASE_CART = loadFixture("carts/attempt-1.json", "cart");
const BASE_PACKET = loadFixture("packet/initial.json", "packet-state");
const BASE_JUDGE = loadFixture("judge/apparel-tee.json", "judge-record");

export interface DecisionSpec {
  readonly id?: string;
  readonly totalMinor?: number;
  readonly remainingMinor?: number;
  readonly packetExpiresAt?: string;
  readonly packetStatus?: Decision["packet"]["status"];
  readonly mandateId?: string;
}

export function decisionId(n: number): string {
  return `dec_test${String(n).padStart(6, "0")}`;
}

/** A cart whose lines add up to totalMinor (no shipping, fees or FX). */
export function cartWithTotal(totalMinor: number, id = "crt_test000001"): Cart {
  const [first] = BASE_CART.items;
  return {
    ...BASE_CART,
    id,
    items: [{ ...first, unit_price_minor: totalMinor }],
    subtotal_minor: totalMinor,
    shipping_minor: 0,
    fees_minor: 0,
    fx: null,
    total_minor: totalMinor,
  };
}

function packetFor(spec: DecisionSpec, mandateId: string): Decision["packet"] {
  return {
    ...BASE_PACKET,
    mandate_id: mandateId,
    remaining_minor: spec.remainingMinor ?? BASE_PACKET.remaining_minor,
    budget_minor: Math.max(spec.remainingMinor ?? 0, BASE_PACKET.budget_minor),
    expires_at: spec.packetExpiresAt ?? BASE_PACKET.expires_at,
    status: spec.packetStatus ?? "ACTIVE",
  };
}

const PASS_RULES: Decision["rules"] = [
  { id: "R1", result: "PASS", inputs: { signer: "did:key:z6MkDemoDeLegatorKeyXXXXXXXXXXXXXXXXXXXXXXXXXXXX" }, comparator: "verify" },
  { id: "R2", result: "PASS", inputs: { revoked: false }, comparator: "<", threshold_ref: "mandate.valid_until" },
  { id: "R3", result: "PASS", inputs: {}, comparator: "<=", threshold_ref: "packet.remaining_minor" },
  { id: "R5", result: "PASS", inputs: {}, comparator: "<=", threshold_ref: "F1.ceiling" },
  { id: "R8", result: "PASS", inputs: {}, comparator: "<", threshold_ref: "F1.active" },
];

function baseDecision(spec: DecisionSpec): Omit<Decision, "outcome"> {
  const mandateId = spec.mandateId ?? BASE_CART.mandate_id;
  const totalMinor = spec.totalMinor ?? BASE_CART.total_minor;
  return {
    id: spec.id ?? decisionId(1),
    mandate_id: mandateId,
    cart: { ...cartWithTotal(totalMinor), mandate_id: mandateId },
    decided_at: NOW.toISOString(),
    packet: packetFor(spec, mandateId),
    rules: PASS_RULES,
    judge: BASE_JUDGE,
    engine: { version: "test@SIMULATED", config_sha256: "0".repeat(64) },
  };
}

/** A schema-valid APPROVE: approved_limit_minor == cart.total_minor (I2). */
export function approvedDecision(spec: DecisionSpec = {}): Decision {
  const base = baseDecision(spec);
  return { ...base, outcome: "APPROVE", approved_limit_minor: base.cart.total_minor };
}

/** A schema-valid DENY citing R3. No approved limit. */
export function deniedDecision(spec: DecisionSpec = {}): Decision {
  const base = baseDecision(spec);
  return {
    ...base,
    outcome: "DENY",
    rules: [
      { id: "R3", result: "FAIL", verdict: "DENY", inputs: { total_minor: 1 }, comparator: "<=", threshold_ref: "packet.remaining_minor", template_id: "R3.over_remaining" },
    ],
    explanation: { template_id: "R3.over_remaining", inputs: { total_minor: 1 }, rendered: "Stopped by R3 (SIMULATED test)." },
  };
}

/** A schema-valid ESCALATE with an open escalation. No approved limit. */
export function escalatedDecision(spec: DecisionSpec = {}): Decision {
  const base = baseDecision(spec);
  return {
    ...base,
    outcome: "ESCALATE",
    rules: [
      { id: "R4", result: "FAIL", verdict: "ESCALATE", inputs: { total_minor: 1 }, comparator: "<=", threshold_ref: "mandate.rules.per_purchase.ask_above_minor", template_id: "R4.ask_above" },
    ],
    explanation: { template_id: "R4.ask_above", inputs: { total_minor: 1 }, rendered: "Ask first (SIMULATED test)." },
    escalation: { state: "OPEN", expires_at: new Date(NOW.getTime() + MINUTE_MS).toISOString() },
  };
}

export function makeRail(options: RailSimOptions = {}, seed = 7): RailSim {
  return new RailSim({ random: seededRandom(seed), ...options });
}

export interface MintedCard {
  readonly rail: RailSim;
  readonly decision: Decision;
  readonly card: CardRecord;
}

export async function mintCard(
  options: RailSimOptions = {},
  spec: DecisionSpec = {},
  mint: { merchantLock?: string; purpose?: string; ttlMs?: number } = {},
): Promise<MintedCard> {
  const rail = makeRail(options);
  const decision = approvedDecision(spec);
  const card = await rail.mint({
    decision,
    ttlMs: mint.ttlMs ?? CARD_TTL_MS,
    now: NOW,
    ...(mint.merchantLock === undefined ? {} : { merchantLock: mint.merchantLock }),
    ...(mint.purpose === undefined ? {} : { purpose: mint.purpose }),
  });
  return { rail, decision, card };
}

let keyCounter = 0;
export function freshKey(prefix = "k"): string {
  keyCounter += 1;
  return `${prefix}${keyCounter}`;
}

export function pay(
  rail: RailSim,
  card: Pick<CardRecord, "handle">,
  amountMinor: number,
  extra: { key?: string; domain?: string; now?: Date } = {},
): Promise<CardEvent> {
  return rail.authorise({
    handle: card.handle,
    amountMinor,
    merchantDomain: extra.domain ?? MERCHANT,
    now: extra.now ?? NOW,
    idempotencyKey: extra.key ?? freshKey(),
  });
}

/** PAN-like digit run: 13 to 19 digits, optionally spaced or hyphenated (same shape docs-check scans for). */
export const PAN_LIKE = /(?:\d[ -]?){13,19}/;
