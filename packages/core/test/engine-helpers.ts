// Shared builders for rules-*, engine-* and packet-* tests. SIMULATED storyline data from data/fixtures [F20-F23].
import type { Cart, JudgeRecord, Mandate, PacketState } from "../src/generated";
import { CLEAN_ANSWERS } from "../src/testing";
import { loadFixture } from "../src/testing/fixtures";

export const M0: Mandate = loadFixture("mandate/m0.json", "mandate");
export const PACKET_INITIAL: PacketState = loadFixture("packet/initial.json", "packet-state");
export const PACKET_AFTER_A1: PacketState = loadFixture("packet/after-attempt-1.json", "packet-state");
export const CART_A1: Cart = loadFixture("carts/attempt-1.json", "cart");
export const CART_A2: Cart = loadFixture("carts/attempt-2.json", "cart");
export const CART_A3: Cart = loadFixture("carts/attempt-3.json", "cart");
export const CART_A3B: Cart = loadFixture("carts/attempt-3b.json", "cart");
export const CART_A4: Cart = loadFixture("carts/attempt-4.json", "cart");
export const JUDGE_TEE: JudgeRecord = loadFixture("judge/apparel-tee.json", "judge-record");
export const JUDGE_SOCKS: JudgeRecord = loadFixture("judge/apparel-socks.json", "judge-record");
export const JUDGE_JACKET: JudgeRecord = loadFixture("judge/streetwear-jacket.json", "judge-record");
export const JUDGE_INJECTED: JudgeRecord = loadFixture("judge/injected-tee.json", "judge-record");
export const JUDGE_FLAGGED: JudgeRecord = loadFixture("judge/flagged-seller-hoodie.json", "judge-record");
export const JUDGE_EARBUDS: JudgeRecord = loadFixture("judge/off-category-earbuds.json", "judge-record");

/** Proof verified by the caller (R1 input). */
export const PROOF_OK = { mandateProofValid: true } as const;

export const CLEAN_JUDGE: JudgeRecord = {
  provider: "laya",
  model: "typed-decisions",
  version: "test",
  status: "OK",
  latency_ms: 10,
  shadow: false,
  answers: CLEAN_ANSWERS,
};

export const at = (iso: string): Date => new Date(iso);

export function withRules(mandate: Mandate, rules: Partial<Mandate["rules"]>): Mandate {
  return { ...mandate, rules: { ...mandate.rules, ...rules } };
}

/** Cart repriced so total_minor = total (one item, shipping kept), consistent with its parts. */
export function cartWithTotal(base: Cart, total: number): Cart {
  const shipping = Math.min(base.shipping_minor, total);
  const unit = total - shipping - base.fees_minor;
  const item = { ...base.items[0], qty: 1, unit_price_minor: unit };
  return { ...base, items: [item], subtotal_minor: unit, shipping_minor: shipping, fx: null, total_minor: total };
}

export function packetWith(base: PacketState, patch: Partial<PacketState>): PacketState {
  return { ...base, ...patch };
}

/** Packet with remaining_minor = remaining (the rest spent), everything else as base. */
export function packetWithRemaining(base: PacketState, remaining: number): PacketState {
  return { ...base, committed_minor: 0, spent_minor: base.budget_minor - remaining, remaining_minor: remaining };
}

export function judgeWith(answers: Partial<NonNullable<JudgeRecord["answers"]>>, patch: Partial<JudgeRecord> = {}): JudgeRecord {
  return { ...CLEAN_JUDGE, ...patch, answers: { ...CLEAN_ANSWERS, ...answers } };
}
