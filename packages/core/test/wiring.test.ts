// End-to-end type and wiring check: replay planner -> judge -> stub engine -> log -> rail, all fakes.
import { describe, expect, it } from "vitest";
import { engine } from "../src/engine";
import type { Decision } from "../src/generated";
import { MintError } from "../src/ports";
import { validateDecision } from "../src/schema";
import { FakeClock, FakeJudge, FakeMerchant, FakePlanner, FakeRail, MemoryLogStore, placeholderEntry } from "../src/testing";
import { loadFixture } from "../src/testing/fixtures";
import { mandateFromCredential } from "../src/vc";

const LOG_ID = "log_demoM0";

describe("wiring with fakes (A-01 stub engine)", () => {
  it("runs one attempt end to end and fails closed: DENY citing a rule, logged, no card (I1, I5)", async () => {
    const clock = new FakeClock("2026-10-03T02:00:00Z");
    const store = new MemoryLogStore();
    const credential = loadFixture("mandate/m0.credential.json", "mandate-credential");
    await store.append(placeholderEntry({ logId: LOG_ID, seq: 0, kind: "MANDATE_SEALED", payload: credential, ts: clock.now() }));

    const replay = loadFixture("planner/attempt-3.json", "planner-replay");
    const planner = new FakePlanner([replay.proposal]);
    const listing = loadFixture("listings/streetwear-jacket.json", "listing-record");
    const proposal = await planner.propose(
      { intentText: credential.credentialSubject.intent_text, listings: [{ url: listing.url, text: listing.text }] },
      { timeoutMs: 20_000 },
    );
    const cart = loadFixture("carts/attempt-3.json", "cart");
    expect(proposal?.listing_url).toBe(cart.listing.url);

    const mandate = mandateFromCredential(credential);
    const judge = new FakeJudge({ answers: loadFixture("judge/streetwear-jacket.json", "judge-record").answers ?? {} });
    const judgeRecord = await judge.assess(
      { intentText: mandate.intent_text, rules: mandate.rules, cart, listingText: listing.text, scameter: cart.scameter },
      { timeoutMs: 1_500 },
    );
    clock.advance(12 * 60 * 1000);
    const packet = loadFixture("packet/after-attempt-1.json", "packet-state");
    const decision = engine.decide(mandate, packet, cart, judgeRecord, clock.now());

    expect(validateDecision(decision).ok).toBe(true);
    expect(decision.outcome).toBe("DENY");
    expect(decision.rules.some((r) => r.result === "FAIL" && r.template_id !== undefined)).toBe(true);
    await store.append(placeholderEntry({ logId: LOG_ID, seq: 1, kind: "DECISION", payload: decision, ts: clock.now() }));
    expect(await store.head(LOG_ID)).toMatchObject({ seq: 1 });

    const rail = new FakeRail();
    await expect(rail.mint({ decision, ttlMs: 60_000, now: clock.now() })).rejects.toBeInstanceOf(MintError);
    expect(rail.cards).toHaveLength(0);
  });
});

function approved(decision: Decision): Decision {
  const { explanation: _explanation, ...rest } = decision;
  return { ...rest, outcome: "APPROVE", approved_limit_minor: decision.cart.total_minor };
}

describe("FakeRail (SIMULATED) semantics used by DM2 and booth scenarios", () => {
  async function mintedCard() {
    const now = new Date("2026-10-03T02:05:02Z");
    const cart = loadFixture("carts/attempt-1.json", "cart");
    const packet = loadFixture("packet/initial.json", "packet-state");
    const mandate = loadFixture("mandate/m0.json", "mandate");
    const judge = loadFixture("judge/apparel-tee.json", "judge-record");
    const decision = approved(engine.decide(mandate, packet, cart, judge, now));
    const rail = new FakeRail();
    const req = { decision, ttlMs: 30 * 60 * 1000, now, merchantLock: cart.merchant.domain, purpose: cart.id };
    const card = await rail.mint(req);
    return { rail, card, req, now, domain: cart.merchant.domain };
  }

  it("mints once per decision (idempotent) with limit = approved total (I2)", async () => {
    const { rail, card, req } = await mintedCard();
    expect(card.limit_minor).toBe(25900);
    expect(await rail.mint(req)).toEqual(card);
    expect(rail.cards).toHaveLength(1);
    await expect(rail.mint({ ...req, purpose: "other" })).rejects.toMatchObject({ code: "ALREADY_MINTED" });
  });

  it("declines overshoot, authorises the exact charge, blocks replay, never double-charges a retried key", async () => {
    const { rail, card, now, domain } = await mintedCard();
    const pay = (amountMinor: number, idempotencyKey: string, merchantDomain = domain) =>
      rail.authorise({ handle: card.handle, amountMinor, merchantDomain, now, idempotencyKey });
    expect(await pay(25901, "k1")).toMatchObject({ event: "DECLINED", decline_code: "OVER_LIMIT" });
    expect(await pay(25900, "k2", "other-shop.example")).toMatchObject({ decline_code: "MERCHANT_MISMATCH" });
    const ok = await pay(25900, "k3");
    expect(ok).toMatchObject({ event: "AUTHORISED", amount_minor: 25900 });
    expect(await pay(25900, "k3")).toEqual(ok);
    expect(await pay(25900, "k4")).toMatchObject({ event: "DECLINED", decline_code: "CARD_USED" });
    expect(await pay(100, "k5", domain)).toMatchObject({ decline_code: "CARD_USED" });
  });

  it("checks out through the honest FakeMerchant once per idempotency key", async () => {
    const { rail, card, now } = await mintedCard();
    const cart = loadFixture("carts/attempt-1.json", "cart");
    const merchant = new FakeMerchant(rail);
    expect((await merchant.quote({ cart, now })).total_minor).toBe(cart.total_minor);
    const first = await merchant.checkout({ cart, handle: card.handle, idempotencyKey: "chk_a1", now });
    expect(first).toMatchObject({ event: "AUTHORISED", amount_minor: 25900 });
    expect(await merchant.checkout({ cart, handle: card.handle, idempotencyKey: "chk_a1", now })).toEqual(first);
  });

  it("voids and expires ACTIVE cards only", async () => {
    const { rail, card, now } = await mintedCard();
    expect(await rail.expireDue(now)).toEqual([]);
    expect(await rail.void(card.id, now)).toMatchObject({ event: "VOIDED" });
    await expect(rail.void(card.id, now)).rejects.toThrow();
  });
});
