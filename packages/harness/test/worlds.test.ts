// The two worlds the baselines pay in, tested without a baseline on top: the governed world (RailSim, MerchantStub, core's
// executor, a signed log that verifyChain checks) and the ungoverned world (B0's card on file).
import { describe, expect, it } from "vitest";
import { engine } from "@laisee/core/engine";
import type { Decision } from "@laisee/core/generated";
import { MintError } from "@laisee/core/ports";
import { CLEAN_ANSWERS } from "@laisee/core/testing";
import { createComponents } from "../src/factory";
import { AGENT_DID, DELEGATOR_DID } from "../src/keys";
import { generateScenarios } from "../src/scenario/generate";
import type { World } from "../src/systems/types";
import { delegatorSigner } from "../src/keys";
import type { Scenario } from "../src/types";
import { sealMandate } from "../src/worlds/seal";
import { NO_LIMIT_MINOR, UnlimitedCardRail } from "../src/worlds/unlimited-rail";

const scenarios = [7, 11, 2026].flatMap((seed) => generateScenarios({ seed, n: 150 }));
const pick = (category: string, variant: string): Scenario => {
  const s = scenarios.find((x) => x.category === category && x.variant === variant);
  if (s === undefined) throw new Error(`no ${category}/${variant} scenario in the fixed seed set`);
  return s;
};
const CLEAN = { provider: "laya", model: "typed-decisions", version: "test", status: "OK", latency_ms: 5, shadow: false, answers: CLEAN_ANSWERS } as const;
const decide = (s: Scenario, proof: boolean): Decision => engine.decide(s.mandate, s.packet, s.cart, CLEAN, new Date(s.now), undefined, { mandateProofValid: proof });
const PAY_AT = (s: Scenario): Date => new Date(new Date(s.now).getTime() + 60_000);

describe("the identities are throwaway, derived from labels, and distinct", () => {
  it("are did:key values, stable across calls, and the delegator differs from the agent", () => {
    expect(DELEGATOR_DID).toMatch(/^did:key:z/);
    expect(AGENT_DID).toMatch(/^did:key:z/);
    expect(DELEGATOR_DID).not.toBe(AGENT_DID);
    expect(delegatorSigner().did).toBe(DELEGATOR_DID);
  });
});

describe("sealing a mandate", () => {
  const s = pick("within_budget", "plain");

  it("signs the credential with the delegator's key and the proof verifies, so R1 gets a real result", () => {
    const sealed = sealMandate(s, delegatorSigner());
    expect(sealed.proofValid).toBe(true);
    expect(sealed.credential.issuer).toBe(s.mandate.delegator);
  });

  it("is deterministic: the same scenario seals to the same credential, byte for byte", () => {
    expect(JSON.stringify(sealMandate(s, delegatorSigner()).credential)).toBe(JSON.stringify(sealMandate(s, delegatorSigner()).credential));
  });
});

describe("the governed world", () => {
  const s = pick("within_budget", "plain");
  const open = (scenario: Scenario): Promise<World> => createComponents().governed(scenario);

  it("runs decide, log, mint, pay and leaves a log that verifies offline with exactly one DECISION (I7)", async () => {
    const world = await open(s);
    const decision = decide(s, world.mandateProofValid === true);
    expect(decision.outcome).toBe("APPROVE");
    expect(await world.recordDecision(decision)).toBeNull();
    const card = await world.mint(decision, s.cart.merchant.domain, s.cart.id);
    expect(card.limit_minor).toBe(s.cart.total_minor); // I2
    expect(await world.recordMint(card)).toBeNull();
    world.setTime(PAY_AT(s));
    const paid = await world.checkout(decision, card);
    expect(paid).toMatchObject({ status: "SETTLED", event: { event: "AUTHORISED", amount_minor: s.cart.total_minor } });
    const audit = await world.audit();
    const before = s.packet.folded_through_seq + 1; // the sealed credential and the scenario's history
    expect(audit).toEqual({ entries: before + 3, decisions: 1, chainOk: true, failure: null }); // then the decision, the card, the charge
  });

  it("folds the packet from its log: the scenario's packet at the start, and the card this decision minted after", async () => {
    const world = await open(s);
    const start = await world.packet();
    expect(start).toEqual(s.packet);
    const decision = decide(s, true);
    await world.recordDecision(decision);
    const card = await world.mint(decision, s.cart.merchant.domain, s.cart.id);
    await world.recordMint(card);
    const after = await world.packet();
    expect(after?.committed_minor).toBe((start?.committed_minor ?? 0) + card.limit_minor);
    expect(after?.remaining_minor).toBe((start?.remaining_minor ?? 0) - card.limit_minor);
    expect(after?.active_cards.map((c) => c.id)).toContain(card.id);
    expect(after?.mint_times).toHaveLength((start?.mint_times.length ?? 0) + 1);
  });

  it("the rail will not mint for a decision that is not an APPROVE (I1)", async () => {
    const stop = pick("shipping_overflow", "over_remaining_boundary");
    const world = await open(stop);
    const denied = decide(stop, world.mandateProofValid === true);
    expect(denied.outcome).toBe("DENY");
    await expect(world.mint(denied, stop.cart.merchant.domain, stop.cart.id)).rejects.toBeInstanceOf(MintError);
  });

  it("an unverified proof is a DENY from the engine, so no mint follows (I1, I5)", async () => {
    const world = await open(s);
    expect(decide(s, false).outcome).toBe("DENY");
    expect(world.mandateProofValid).toBe(true);
  });

  it("each scenario gets a fresh world: a card minted in one is not in the next", async () => {
    const first = await open(s);
    const decision = decide(s, true);
    await first.recordDecision(decision);
    await first.mint(decision, s.cart.merchant.domain, s.cart.id);
    const second = await open(s);
    expect(await second.audit()).toMatchObject({ entries: s.packet.folded_through_seq + 1, decisions: 0, chainOk: true }); // only the credential and the history
  });

  it("a wrong-merchant payment declines MERCHANT_MISMATCH and moves no money", async () => {
    const wrong = pick("wrong_merchant", "wrong_domain");
    const world = await open(wrong);
    const decision = decide(wrong, true);
    await world.recordDecision(decision);
    const card = await world.mint(decision, wrong.cart.merchant.domain, wrong.cart.id);
    await world.recordMint(card);
    world.setTime(PAY_AT(wrong));
    const paid = await world.checkout(decision, card);
    expect(paid).toMatchObject({ status: "SETTLED", event: { event: "DECLINED", decline_code: "MERCHANT_MISMATCH" } });
  });

  it("a price drift is reported as DRIFT with the new quote, for the engine to rule on (R12)", async () => {
    const drift = pick("price_drift", "drift_up");
    const world = await open(drift);
    const decision = decide(drift, true);
    await world.recordDecision(decision);
    const card = await world.mint(decision, drift.cart.merchant.domain, drift.cart.id);
    await world.recordMint(card);
    world.setTime(PAY_AT(drift));
    const report = await world.checkout(decision, card);
    expect(report.status).toBe("DRIFT");
    if (report.status !== "DRIFT") return;
    expect(report.quote.total_minor).not.toBe(drift.cart.total_minor);
    const verdict = engine.decideCheckout({ mandate: drift.mandate, packet: drift.packet, approved: decision, quote: report.quote, now: PAY_AT(drift), ctx: { mandateProofValid: true } });
    expect(verdict?.outcome).toBe("DENY");
    expect(verdict?.explanation?.template_id).toBe("R12.price_drift");
  });
});

describe("the ungoverned world (B0's card on file)", () => {
  const s = pick("within_budget", "plain");
  const open = (): Promise<World> => createComponents().ungoverned(s);

  it("keeps no log and no proof: nothing was sealed, nothing can be audited, no packet is folded", async () => {
    const world = await open();
    expect(world.mandateProofValid).toBeUndefined();
    expect(await world.packet()).toBeNull();
    expect(await world.audit()).toBeNull();
    expect(await world.recordDecision(decide(s, true))).toBeNull();
  });

  it("pays whatever it is told: the card has no limit", async () => {
    const world = await open();
    const decision = decide(s, true);
    const card = await world.mint(decision, s.cart.merchant.domain, s.cart.id);
    expect(card.limit_minor).toBe(NO_LIMIT_MINOR);
    const paid = await world.checkout({ ...decision, cart: { ...decision.cart, total_minor: s.cart.total_minor + 500_000 } }, card);
    expect(paid).toMatchObject({ status: "SETTLED", event: { event: "AUTHORISED" } });
  });

  it("cannot void a card: it has no orchestrator", async () => {
    const world = await open();
    const card = await world.mint(decide(s, true), s.cart.merchant.domain, s.cart.id);
    expect(await world.voidCard(card)).toBeNull();
  });
});

describe("UnlimitedCardRail", () => {
  const s = pick("within_budget", "plain");
  const mint = (rail: UnlimitedCardRail) => rail.mint({ decision: decide(s, true), ttlMs: 0, now: new Date(s.now) });
  const request = (handle: string, key: string, amountMinor = 1_000) => ({ handle, amountMinor, merchantDomain: "anywhere.example", now: new Date(s.now), idempotencyKey: key });

  it("answers a retry with the same key from the first answer and charges once", async () => {
    const rail = new UnlimitedCardRail();
    const card = await mint(rail);
    const first = await rail.authorise(request(card.handle, "k1"));
    expect(await rail.authorise(request(card.handle, "k1"))).toBe(first);
  });

  it("has no single-use rule and no merchant lock, which is what a card on file is", async () => {
    const rail = new UnlimitedCardRail();
    const card = await mint(rail);
    const a = await rail.authorise(request(card.handle, "a"));
    const b = await rail.authorise(request(card.handle, "b", 9_999_999));
    expect([a.event, b.event]).toEqual(["AUTHORISED", "AUTHORISED"]);
  });

  it("declines an unknown handle", async () => {
    const out = await new UnlimitedCardRail().authorise(request("hdl_nothere", "k"));
    expect(out).toMatchObject({ event: "DECLINED", decline_code: "UNKNOWN_HANDLE" });
  });

  it("refuses to void", async () => {
    await expect(new UnlimitedCardRail().void()).rejects.toThrow(/no orchestrator/);
  });
});
