// No false rejections: logs the real engine produces, with an orchestrator-like loop that mints each APPROVE at
// its limit and settles it, must pass every verifier step including the semantics pass (step 9), whatever the
// sealed per-purchase terms and cart totals. Rail and merchant are SIMULATED; keys are test-only.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { engine } from "../src/engine";
import type { Cart, MandateCredential } from "../src/generated";
import { appendEntry } from "../src/log";
import { foldPacket } from "../src/packet";
import { FakeClock, MemoryLogStore } from "../src/testing";
import { mandateFromCredential, signMandateCredential } from "../src/vc";
import { verifyChain } from "../src/verify";
import { CART_A1, JUDGE_TEE, PROOF_OK, cartWithTotal } from "./engine-helpers";
import { cardFor, demoCredential, demoKeys, LOG_ID } from "./log-helpers";

type Rules = MandateCredential["credentialSubject"]["rules"];
const keys = demoKeys();
const MINUTE_MS = 60_000;
const CARD_TTL_MS = 30 * MINUTE_MS; // the demo TTL [F30]

function sealedWith(perPurchase: Rules["per_purchase"]): MandateCredential {
  const { proof: _proof, ...base } = demoCredential(keys);
  const rules: Rules = perPurchase === undefined ? base.credentialSubject.rules : { ...base.credentialSubject.rules, per_purchase: perPurchase };
  return signMandateCredential({ ...base, credentialSubject: { ...base.credentialSubject, rules } }, keys.delegator, { created: new Date("2026-10-03T02:00:00Z") });
}

/** Decide each cart with the real engine on the folded packet; mint every APPROVE, then charge it in full. */
async function engineLog(vc: MandateCredential, totals: readonly number[]) {
  const store = new MemoryLogStore();
  const clock = new FakeClock("2026-10-03T02:05:00Z");
  const mandate = mandateFromCredential(vc);
  const log = <K extends Parameters<typeof appendEntry>[3]>(kind: K, payload: Parameters<typeof appendEntry<K>>[4]) =>
    appendEntry(store, keys.engine, LOG_ID, kind, payload, clock.now());
  await log("MANDATE_SEALED", vc);
  for (const [i, total] of totals.entries()) {
    clock.advance(4 * MINUTE_MS); // spaced past the velocity window [F32]
    const cart: Cart = { ...cartWithTotal(CART_A1, total), id: `crt_engine${i}x`, agent: mandate.agent, mandate_id: mandate.id };
    const decision = engine.decide(mandate, foldPacket(await store.read(LOG_ID), clock.now()), cart, JUDGE_TEE, clock.now(), undefined, PROOF_OK);
    await log("DECISION", decision);
    if (decision.outcome !== "APPROVE") continue;
    const now = clock.now();
    const card = { ...cardFor(decision, `crd_engine${i}x`), minted_at: now.toISOString(), expires_at: new Date(now.getTime() + CARD_TTL_MS).toISOString() };
    await log("CARD_MINTED", card);
    const charge = { card_id: card.id, event: "AUTHORISED" as const, at: now.toISOString(), amount_minor: total, merchant_domain: cart.merchant.domain, idempotency_key: `chk_${i}x`, simulated: true as const };
    await log("CARD_EVENT", charge);
  }
  return store.read(LOG_ID);
}

describe("engine-produced logs pass the semantics pass", () => {
  it("under share-of-remaining, hard cap and ask-above terms: approvals, R4 stops and escalations all verify", async () => {
    const terms: Rules["per_purchase"][] = [undefined, { share_of_remaining_bp: 4000 }, { hard_cap_minor: 30000 }, { ask_above_minor: 20000 }];
    for (const perPurchase of terms) {
      const entries = await engineLog(sealedWith(perPurchase), [25900, 25900, 31000, 9900]);
      expect(entries.some((e) => e.kind === "DECISION" && e.payload.outcome === "APPROVE") || perPurchase?.ask_above_minor !== undefined).toBe(true);
      expect(verifyChain(entries, keys.publicKeys), JSON.stringify(perPurchase)).toMatchObject({ ok: true });
    }
  }, 60_000);

  it("for random terms and cart totals (property)", async () => {
    const perPurchase = fc.option(
      fc.record(
        { hard_cap_minor: fc.integer({ min: 1000, max: 90000 }), share_of_remaining_bp: fc.integer({ min: 1, max: 10000 }), ask_above_minor: fc.integer({ min: 1000, max: 90000 }) },
        { requiredKeys: [] },
      ).filter((pp) => Object.keys(pp).length > 0),
      { nil: undefined },
    );
    await fc.assert(
      fc.asyncProperty(perPurchase, fc.array(fc.integer({ min: 100, max: 60000 }), { maxLength: 5 }), async (pp, totals) => {
        const entries = await engineLog(sealedWith(pp), totals);
        return verifyChain(entries, keys.publicKeys).ok;
      }),
      { numRuns: 25 },
    );
  }, 120_000);
});
