// Audit (lane s-audit): I1/I2/I6 at the rail and executor, the components the orchestrator will sit on.
// Every hostile run is computed at module level, so a setup error turns the file red instead of passing
// as an expected failure. Rail and merchant are SIMULATED.
import { engine } from "@laisee/core/engine";
import { createExecutor } from "@laisee/core/executor";
import type { Cart, LogEntry } from "@laisee/core/generated";
import { foldPacket } from "@laisee/core/packet";
import type { AppendEntry, MerchantPort, Signer } from "@laisee/core/ports";
import { FakeClock, MemoryLogStore, PLACEHOLDER_ENGINE_DID, placeholderEntry } from "@laisee/core/testing";
import { loadFixture } from "@laisee/core/testing/fixtures";
import { describe, expect, it } from "vitest";
import { MerchantStub, RailSim, seededRandom } from "../src";
import { cartWithTotal } from "./helpers";

const CRED = loadFixture("mandate/m0.credential.json", "mandate-credential");
const M0 = loadFixture("mandate/m0.json", "mandate");
const CART = loadFixture("carts/attempt-1.json", "cart");
const JUDGE = loadFixture("judge/apparel-tee.json", "judge-record");
const LOG_ID = "log_demoM0";
const TTL = 30 * 60 * 1000;
const PROOF = { mandateProofValid: true } as const;
const signer: Signer = { did: PLACEHOLDER_ENGINE_DID, sign: () => new Uint8Array(64) };

const appendEntry: AppendEntry = async (store, _signer, logId, kind, payload, now) => {
  const head = await store.head(logId);
  const entry = placeholderEntry({ logId, seq: head === null ? 0 : head.seq + 1, kind, payload, ts: now }) as LogEntry;
  await store.append(entry);
  return entry;
};

async function setup(seed: number, merchant?: (rail: RailSim) => MerchantPort) {
  const clock = new FakeClock("2026-10-03T02:05:00Z");
  const store = new MemoryLogStore();
  await appendEntry(store, signer, LOG_ID, "MANDATE_SEALED", CRED, clock.now());
  const rail = new RailSim({ random: seededRandom(seed) });
  const executor = createExecutor({ merchant: merchant?.(rail) ?? new MerchantStub({ rail }), rail, store, signer, appendEntry, clock });
  const fold = async () => foldPacket(await store.read(LOG_ID), clock.now());
  const log = (kind: LogEntry["kind"], payload: unknown) => appendEntry(store, signer, LOG_ID, kind, payload as never, clock.now());
  const mintFor = (decision: ReturnType<typeof engine.decide>, cart: Cart) =>
    rail.mint({ decision, ttlMs: TTL, now: clock.now(), merchantLock: cart.merchant.domain, purpose: cart.id });
  return { clock, store, rail, executor, fold, log, mintFor };
}

const cart = (total: number, id: string): Cart => ({ ...cartWithTotal(total, id), mandate_id: M0.id });

// A2-03 (I6): revoke logged after the APPROVE, before the mint.
const REVOKED_RUN = await (async () => {
  const s = await setup(1);
  const d = engine.decide(M0, await s.fold(), CART, JUDGE, s.clock.now(), undefined, PROOF);
  if (d.outcome !== "APPROVE") throw new Error("setup: expected APPROVE");
  await s.log("DECISION", d);
  await s.log("MANDATE_REVOKED", { mandate_id: M0.id, revoked_at: s.clock.now().toISOString(), signer: M0.delegator, signature: "A".repeat(86) });
  s.clock.advance(1_000);
  const card = await s.mintFor(d, CART);
  await s.log("CARD_MINTED", card);
  const out = await s.executor.checkout({ logId: LOG_ID, decision: d, card });
  return { status: (await s.fold()).status, checkout: out.status };
})();

// A2-04 (I2): an APPROVE that is not minted yet reserves nothing; a later decision sees the full budget.
const OVERCOMMIT_RUN = await (async () => {
  const s = await setup(2);
  const x = cart(50_000, "crt_seqX000001");
  const y = cart(50_000, "crt_seqY000001");
  const dx = engine.decide(M0, await s.fold(), x, JUDGE, s.clock.now(), undefined, PROOF);
  await s.log("DECISION", dx);
  s.clock.advance(1_000);
  const dy = engine.decide(M0, await s.fold(), y, JUDGE, s.clock.now(), undefined, PROOF);
  await s.log("DECISION", dy);
  await s.log("CARD_MINTED", await s.mintFor(dy, y));
  s.clock.advance(1_000);
  await s.log("CARD_MINTED", await s.mintFor(dx, x)); // the delayed or retried first mint
  const p = await s.fold();
  return { outcomes: [dx.outcome, dy.outcome], budget: p.budget_minor, committed: p.committed_minor, spent: p.spent_minor };
})();

// A2-05 (I2): the executor logs the merchant's copy of the charge; a merchant that under-reports frees budget.
const LYING_MERCHANT_RUN = await (async () => {
  let lie = true;
  const s = await setup(9, (rail) => {
    const honest = new MerchantStub({ rail });
    return {
      quote: (i) => honest.quote(i),
      async checkout(i) {
        const real = await honest.checkout(i);
        return lie && real.event === "AUTHORISED" ? { ...real, amount_minor: 1 } : real;
      },
    };
  });
  const buy = async (c: Cart) => {
    const d = engine.decide(M0, await s.fold(), c, JUDGE, s.clock.now(), undefined, PROOF);
    await s.log("DECISION", d);
    const card = await s.mintFor(d, c);
    await s.log("CARD_MINTED", card);
    const out = await s.executor.checkout({ logId: LOG_ID, decision: d, card });
    s.clock.advance(1_000);
    return out.status;
  };
  const first = await buy(cart(60_000, "crt_lieA000001"));
  lie = false;
  const second = await buy(cart(70_000, "crt_lieB000001"));
  const railSpent = s.rail.authorisations().reduce((n, e) => n + (e.amount_minor ?? 0), 0);
  return { first, second, railSpent, budget: (await s.fold()).budget_minor };
})();

// A2-06: the merchant lock is caller-supplied and never compared with the approved merchant.
const LOCK_RUN = await (async () => {
  const s = await setup(4);
  const d = engine.decide(M0, await s.fold(), CART, JUDGE, s.clock.now(), undefined, PROOF);
  try {
    const card = await s.rail.mint({ decision: d, ttlMs: TTL, now: s.clock.now(), merchantLock: "evil-shop.example", purpose: CART.id });
    const ev = await s.rail.authorise({ handle: card.handle, amountMinor: CART.total_minor, merchantDomain: "evil-shop.example", now: s.clock.now(), idempotencyKey: "chk_lock000001" });
    return { minted: true, evil: ev.event };
  } catch {
    return { minted: false, evil: "REFUSED" };
  }
})();

describe("setup reached the intended states", () => {
  it("records what each hostile run did", () => {
    expect(REVOKED_RUN.status).toBe("REVOKED");
    expect(OVERCOMMIT_RUN.outcomes).toEqual(["APPROVE", "APPROVE"]);
    expect([LYING_MERCHANT_RUN.first, LYING_MERCHANT_RUN.second]).toEqual(["AUTHORISED", "AUTHORISED"]);
    expect(LOCK_RUN.minted === true || LOCK_RUN.minted === false).toBe(true);
  });
});

describe("KNOWN DEFECT S-RAIL-1 (I6): an approval is minted and charged after the packet was revoked", () => {
  it.fails("checkout refuses an approval once MANDATE_REVOKED is logged", () => {
    expect(REVOKED_RUN.checkout).not.toBe("AUTHORISED");
  });
});

describe("KNOWN DEFECT S-RAIL-2 (I2): unminted approvals reserve nothing, so the packet over-commits", () => {
  it.fails("committed + spent never exceeds the budget", () => {
    expect(OVERCOMMIT_RUN.committed + OVERCOMMIT_RUN.spent).toBeLessThanOrEqual(OVERCOMMIT_RUN.budget);
  });
});

describe("KNOWN DEFECT S-RAIL-3 (I2): the logged charge is the merchant's claim, not the rail's record", () => {
  it.fails("the rail never charges more than the sealed budget across purchases", () => {
    expect(LYING_MERCHANT_RUN.railSpent).toBeLessThanOrEqual(LYING_MERCHANT_RUN.budget);
  });
});

describe("KNOWN DEFECT S-RAIL-4: the merchant lock is not bound to the approved merchant", () => {
  it.fails("mint refuses a lock other than decision.cart.merchant.domain", () => {
    expect(LOCK_RUN.minted).toBe(false);
  });
});
