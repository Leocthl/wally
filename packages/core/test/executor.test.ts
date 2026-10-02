// A-33 executor with the fakes: re-quote (R12), stable idempotency key, bounded same-key retries on a simulated
// timeout, CARD_EVENT appended through the injected AppendEntry, typed outcomes, handle never exposed (I8).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createExecutor, EXECUTOR_DEFAULTS, SimulatedTimeoutError, isSimulatedTimeout, type ExecutorDeps } from "../src/executor";
import type { CardRecord, Cart, Decision, LogEntry } from "../src/generated";
import type { AppendEntry, CardEvent, MerchantPort, MerchantQuote, Signer } from "../src/ports";
import { FakeClock, FakeMerchant, FakeRail, MemoryLogStore, PLACEHOLDER_ENGINE_DID, placeholderEntry } from "../src/testing";
import { loadFixture } from "../src/testing/fixtures";

const LOG_ID = "log_demoM0";
const NOW = "2026-10-03T02:05:02Z";
const TTL_MS = 30 * 60 * 1000;
const PAN_LIKE = /(?:\d[ -]?){13,19}/;

const CART = loadFixture("carts/attempt-1.json", "cart");
const PACKET = loadFixture("packet/initial.json", "packet-state");
const JUDGE = loadFixture("judge/apparel-tee.json", "judge-record");
const CREDENTIAL = loadFixture("mandate/m0.credential.json", "mandate-credential");

const signer: Signer = { did: PLACEHOLDER_ENGINE_DID, sign: () => new Uint8Array(64) };

/** Test double for appendEntry: same signature as the real one, placeholder hashes (the real chain is lane A's log). */
const appendEntry: AppendEntry = async (store, _signer, logId, kind, payload, now) => {
  const head = await store.head(logId);
  const entry = placeholderEntry({ logId, seq: head === null ? 0 : head.seq + 1, kind, payload, ts: now }) as LogEntry;
  await store.append(entry);
  return entry;
};

function approvedDecision(cart: Cart = CART, id = "dec_exec000001"): Decision {
  return {
    id,
    mandate_id: cart.mandate_id,
    cart,
    decided_at: NOW,
    outcome: "APPROVE",
    approved_limit_minor: cart.total_minor,
    packet: PACKET,
    rules: [{ id: "R3", result: "PASS", inputs: {}, comparator: "<=", threshold_ref: "packet.remaining_minor" }],
    judge: JUDGE,
    engine: { version: "test@SIMULATED", config_sha256: "0".repeat(64) },
  };
}

interface Rig {
  readonly clock: FakeClock;
  readonly store: MemoryLogStore;
  readonly rail: FakeRail;
  readonly decision: Decision;
  readonly card: CardRecord;
  readonly merchant: MerchantPort;
  readonly executor: ReturnType<typeof createExecutor>;
  readonly deps: ExecutorDeps;
  cardEvents(): Promise<CardEvent[]>;
}

async function rig(
  options: { merchant?: (rail: FakeRail) => MerchantPort; append?: AppendEntry; maxCheckoutCalls?: number; lock?: boolean } = {},
): Promise<Rig> {
  const clock = new FakeClock(NOW);
  const store = new MemoryLogStore();
  await store.append(placeholderEntry({ logId: LOG_ID, seq: 0, kind: "MANDATE_SEALED", payload: CREDENTIAL, ts: clock.now() }));
  const rail = new FakeRail();
  const decision = approvedDecision();
  const lock = options.lock === false ? {} : { merchantLock: CART.merchant.domain };
  const card = await rail.mint({ decision, ttlMs: TTL_MS, now: clock.now(), purpose: CART.id, ...lock });
  const merchant = options.merchant?.(rail) ?? new FakeMerchant(rail);
  const deps: ExecutorDeps = {
    merchant,
    rail,
    store,
    signer,
    appendEntry: options.append ?? appendEntry,
    clock,
    ...(options.maxCheckoutCalls === undefined ? {} : { maxCheckoutCalls: options.maxCheckoutCalls }),
  };
  const cardEvents = async (): Promise<CardEvent[]> =>
    (await store.read(LOG_ID)).flatMap((e) => (e.kind === "CARD_EVENT" ? [e.payload] : []));
  return { clock, store, rail, decision, card, merchant, executor: createExecutor(deps), deps, cardEvents };
}

function quoteOf(cart: Cart, deltaMinor = 0): MerchantQuote {
  const rise = deltaMinor > 0;
  return {
    total_minor: cart.total_minor + deltaMinor,
    subtotal_minor: cart.subtotal_minor + (rise ? 0 : deltaMinor),
    shipping_minor: cart.shipping_minor + (rise ? deltaMinor : 0),
    fees_minor: cart.fees_minor,
    fx_minor: 0,
  };
}

/** Merchant that delegates to the honest FakeMerchant but lets a test steer quote and checkout. */
function steered(
  rail: FakeRail,
  steer: { quote?: (cart: Cart) => Promise<MerchantQuote>; checkout?: (n: number, input: Parameters<MerchantPort["checkout"]>[0], honest: () => Promise<CardEvent>) => Promise<CardEvent> },
): MerchantPort & { checkoutCalls: { key: string; handle: string }[] } {
  const honest = new FakeMerchant(rail);
  const checkoutCalls: { key: string; handle: string }[] = [];
  return {
    checkoutCalls,
    quote: (input) => (steer.quote ? steer.quote(input.cart) : honest.quote(input)),
    checkout(input) {
      checkoutCalls.push({ key: input.idempotencyKey, handle: input.handle });
      const run = () => honest.checkout(input);
      return steer.checkout ? steer.checkout(checkoutCalls.length, input, run) : run();
    },
  };
}

describe("checkout: happy path", () => {
  it("re-quotes, charges once, logs one CARD_EVENT and exposes last4 only", async () => {
    const r = await rig();
    const outcome = await r.executor.checkout({ logId: LOG_ID, decision: r.decision, card: r.card });
    expect(outcome).toMatchObject({
      status: "AUTHORISED",
      simulated: true,
      last4: r.card.last4,
      attempts: 1,
      idempotency_key: `chk:${r.card.id}:1`,
      log_seq: 1,
      anomalies: [],
      event: { event: "AUTHORISED", amount_minor: CART.total_minor, card_id: r.card.id, simulated: true },
    });
    expect(await r.cardEvents()).toEqual([expect.objectContaining({ event: "AUTHORISED" })]);
    expect(JSON.stringify(outcome)).not.toContain(r.card.handle);
    expect(PAN_LIKE.test(JSON.stringify(outcome))).toBe(false);
  });

  it("the next attempt on the same card gets the next key; a replay is a logged DECLINED CARD_USED", async () => {
    const r = await rig();
    await r.executor.checkout({ logId: LOG_ID, decision: r.decision, card: r.card });
    const replay = await r.executor.checkout({ logId: LOG_ID, decision: r.decision, card: r.card });
    expect(replay).toMatchObject({ status: "DECLINED", idempotency_key: `chk:${r.card.id}:2`, log_seq: 2, event: { decline_code: "CARD_USED" } });
    expect((await r.cardEvents()).map((e) => e.event)).toEqual(["AUTHORISED", "DECLINED"]);
  });

  it("uses an explicit idempotency key when given, and rejects a malformed one", async () => {
    const r = await rig();
    const ok = await r.executor.checkout({ logId: LOG_ID, decision: r.decision, card: r.card, idempotencyKey: "order-7.try:1" });
    expect(ok).toMatchObject({ status: "AUTHORISED", idempotency_key: "order-7.try:1" });
    const bad = await r.executor.checkout({ logId: LOG_ID, decision: r.decision, card: r.card, idempotencyKey: "has space" });
    expect(bad).toMatchObject({ status: "ERROR", reason: "INVALID_INPUT" });
  });
});

describe("checkout: overshoot decline holds the limit (DM2)", () => {
  it("a charge above the quote is declined OVER_LIMIT, logged, and the card stays usable", async () => {
    const r = await rig({
      merchant: (rail) =>
        steered(rail, {
          checkout: (_n, input) =>
            rail.authorise({ handle: input.handle, amountMinor: input.cart.total_minor + 1, merchantDomain: input.cart.merchant.domain, now: input.now, idempotencyKey: input.idempotencyKey }),
        }),
    });
    const over = await r.executor.checkout({ logId: LOG_ID, decision: r.decision, card: r.card });
    expect(over).toMatchObject({ status: "DECLINED", event: { decline_code: "OVER_LIMIT", amount_minor: CART.total_minor + 1 } });
    expect(r.rail.cards[0]?.state).toBe("ACTIVE");
    expect(await r.cardEvents()).toHaveLength(1);
  });
});

describe("checkout: R12 price drift is reported, never decided", () => {
  it.each([
    ["a rise", 3_000],
    ["a drop", -1_000],
    ["one cent", 1],
  ])("re-quote with %s returns DRIFT; nothing is charged or logged and the card stays ACTIVE", async (_name, delta) => {
    const merchant = (rail: FakeRail) => steered(rail, { quote: async (cart) => quoteOf(cart, delta) });
    const r = await rig({ merchant });
    const outcome = await r.executor.checkout({ logId: LOG_ID, decision: r.decision, card: r.card });
    expect(outcome).toMatchObject({
      status: "DRIFT",
      simulated: true,
      last4: r.card.last4,
      approved_total_minor: CART.total_minor,
      quoted_total_minor: CART.total_minor + delta,
      delta_minor: delta,
      quote: { total_minor: CART.total_minor + delta },
    });
    expect((r.merchant as ReturnType<typeof steered>).checkoutCalls).toHaveLength(0);
    expect(await r.cardEvents()).toEqual([]);
    expect(r.rail.cards[0]?.state).toBe("ACTIVE");
  });

  it("an unchanged total is not drift even if components were re-split", async () => {
    const r = await rig({
      merchant: (rail) => steered(rail, { quote: async (cart) => ({ ...quoteOf(cart), shipping_minor: 100, subtotal_minor: cart.subtotal_minor - 100 }) }),
    });
    expect(await r.executor.checkout({ logId: LOG_ID, decision: r.decision, card: r.card })).toMatchObject({ status: "AUTHORISED" });
  });

  it("the orchestrator can then void the card through the executor", async () => {
    const r = await rig({ merchant: (rail) => steered(rail, { quote: async (cart) => quoteOf(cart, 500) }) });
    await r.executor.checkout({ logId: LOG_ID, decision: r.decision, card: r.card });
    const voided = await r.executor.voidCard({ logId: LOG_ID, cardId: r.card.id });
    expect(voided).toMatchObject({ status: "VOIDED", log_seq: 1, event: { event: "VOIDED", card_id: r.card.id } });
    expect(r.rail.cards[0]?.state).toBe("VOIDED");
  });
});

describe("checkout: bounded retries on a simulated timeout, always the SAME key", () => {
  it("retries after timeouts and charges exactly once (the first response was lost after the charge)", async () => {
    const merchant = (rail: FakeRail) =>
      steered(rail, {
        checkout: async (n, _input, honest) => {
          const event = await honest(); // the charge lands at the rail
          if (n <= 2) throw new SimulatedTimeoutError(); // but the answer is lost, twice
          return event;
        },
      });
    const r = await rig({ merchant });
    const outcome = await r.executor.checkout({ logId: LOG_ID, decision: r.decision, card: r.card });
    expect(outcome).toMatchObject({ status: "AUTHORISED", attempts: 3, log_seq: 1 });
    const calls = (r.merchant as ReturnType<typeof steered>).checkoutCalls;
    expect(calls).toHaveLength(3);
    expect(new Set(calls.map((c) => c.key)).size).toBe(1);
    expect(await r.cardEvents()).toHaveLength(1);
    expect(r.rail.cards[0]?.state).toBe("USED");
  });

  it("gives up after maxCheckoutCalls with TIMEOUT, logs nothing, and a re-run reuses the key", async () => {
    let failing = true;
    const merchant = (rail: FakeRail) =>
      steered(rail, {
        checkout: async (_n, _input, honest) => {
          if (failing) throw new SimulatedTimeoutError();
          return honest();
        },
      });
    const r = await rig({ merchant, maxCheckoutCalls: 2 });
    const first = await r.executor.checkout({ logId: LOG_ID, decision: r.decision, card: r.card });
    expect(first).toMatchObject({ status: "TIMEOUT", attempts: 2, idempotency_key: `chk:${r.card.id}:1`, last4: r.card.last4 });
    expect(await r.cardEvents()).toEqual([]);

    failing = false;
    const rerun = await r.executor.checkout({ logId: LOG_ID, decision: r.decision, card: r.card });
    expect(rerun).toMatchObject({ status: "AUTHORISED", idempotency_key: `chk:${r.card.id}:1`, attempts: 1 });
    expect(await r.cardEvents()).toHaveLength(1);
  });

  it("does not retry anything but a simulated timeout (fail closed, handle redacted)", async () => {
    const merchant = (rail: FakeRail) =>
      steered(rail, {
        checkout: async (_n, input) => {
          throw new Error(`gateway exploded for ${input.handle}`);
        },
      });
    const r = await rig({ merchant });
    const outcome = await r.executor.checkout({ logId: LOG_ID, decision: r.decision, card: r.card });
    expect(outcome).toMatchObject({ status: "ERROR", reason: "CHECKOUT_FAILED", last4: r.card.last4 });
    expect(JSON.stringify(outcome)).not.toContain(r.card.handle);
    expect((r.merchant as ReturnType<typeof steered>).checkoutCalls).toHaveLength(1);
    expect(await r.cardEvents()).toEqual([]);
  });

  it("recognises the timeout structurally as well as by class", () => {
    expect(isSimulatedTimeout(new SimulatedTimeoutError())).toBe(true);
    expect(isSimulatedTimeout({ code: "SIMULATED_TIMEOUT" })).toBe(true);
    expect(isSimulatedTimeout(new Error("timeout"))).toBe(false);
    expect(isSimulatedTimeout(null)).toBe(false);
    expect(isSimulatedTimeout("SIMULATED_TIMEOUT")).toBe(false);
  });

  it("validates its configuration", async () => {
    expect(EXECUTOR_DEFAULTS.maxCheckoutCalls).toBeGreaterThanOrEqual(2);
    const r = await rig();
    for (const maxCheckoutCalls of [0, -1, 1.5, Number.NaN]) {
      expect(() => createExecutor({ ...r.deps, maxCheckoutCalls })).toThrow(RangeError);
    }
  });
});

describe("checkout: fail closed on bad input, quotes and answers (I5)", () => {
  it("refuses a decision that is not an APPROVE for this card, before the merchant is touched", async () => {
    const r = await rig();
    const { approved_limit_minor: _limit, explanation: _e, ...rest } = r.decision;
    const cases: [string, Decision, CardRecord, string?][] = [
      ["DENY", { ...rest, outcome: "DENY" } as Decision, r.card],
      ["limit differs from cart total", { ...r.decision, approved_limit_minor: r.decision.cart.total_minor - 1 }, r.card],
      ["card minted for another decision", r.decision, { ...r.card, decision_id: "dec_otherDecision1" }],
      ["card limit differs from approved limit", r.decision, { ...r.card, limit_minor: r.card.limit_minor + 1 }],
      ["card for another mandate", r.decision, { ...r.card, mandate_id: "mnd_otherMandate1" }],
      ["schema-invalid card", r.decision, { ...r.card, last4: "12" }],
      ["schema-invalid decision", { ...r.decision, id: "nope" }, r.card],
    ];
    const spy = vi.spyOn(r.merchant, "quote");
    for (const [, decision, card] of cases) {
      expect(await r.executor.checkout({ logId: LOG_ID, decision, card })).toMatchObject({ status: "ERROR", reason: "INVALID_INPUT" });
    }
    expect(await r.executor.checkout({ logId: "not-a-log", decision: r.decision, card: r.card })).toMatchObject({ reason: "INVALID_INPUT" });
    expect(spy).not.toHaveBeenCalled();
    expect(await r.cardEvents()).toEqual([]);
  });

  it("QUOTE_FAILED when the merchant cannot quote; QUOTE_INVALID for a malformed quote", async () => {
    const down = await rig({ merchant: (rail) => steered(rail, { quote: async () => Promise.reject(new Error("shop down")) }) });
    expect(await down.executor.checkout({ logId: LOG_ID, decision: down.decision, card: down.card })).toMatchObject({ reason: "QUOTE_FAILED" });
    for (const bad of [{ ...quoteOf(CART), total_minor: 259.5 }, { ...quoteOf(CART), shipping_minor: -1 }, { ...quoteOf(CART), fx_minor: Number.NaN }, null]) {
      const r = await rig({ merchant: (rail) => steered(rail, { quote: async () => bad as MerchantQuote }) });
      expect(await r.executor.checkout({ logId: LOG_ID, decision: r.decision, card: r.card })).toMatchObject({ reason: "QUOTE_INVALID" });
      expect((r.merchant as ReturnType<typeof steered>).checkoutCalls).toHaveLength(0);
    }
  });

  it("EVENT_INVALID, and nothing logged, when the answer is for another card, lacks the key, or is the wrong kind", async () => {
    type Make = (cardId: string, key: string) => unknown;
    const ok = { event: "AUTHORISED", at: NOW, amount_minor: CART.total_minor, merchant_domain: CART.merchant.domain, simulated: true };
    const answers: Record<string, Make> = {
      "another card": (_c, key) => ({ ...ok, card_id: "crd_someoneElse1", idempotency_key: key }),
      "no idempotency key": (c) => ({ ...ok, card_id: c }),
      "someone else's key": (c) => ({ ...ok, card_id: c, idempotency_key: "chk:other:9" }),
      "a VOIDED event": (c, key) => ({ card_id: c, event: "VOIDED", at: NOW, idempotency_key: key, simulated: true }),
      "an EXPIRED event": (c, key) => ({ card_id: c, event: "EXPIRED", at: NOW, idempotency_key: key, simulated: true }),
      "missing amount": (c, key) => ({ card_id: c, event: "AUTHORISED", at: NOW, idempotency_key: key, simulated: true }),
      "bad timestamp": (c, key) => ({ ...ok, card_id: c, at: "yesterday", idempotency_key: key }),
      "not an object": () => null,
    };
    for (const [name, make] of Object.entries(answers)) {
      const r = await rig({
        merchant: (rail) => steered(rail, { checkout: async (_n, input) => make(rail.cards[0]?.id ?? "", input.idempotencyKey) as CardEvent }),
      });
      const outcome = await r.executor.checkout({ logId: LOG_ID, decision: r.decision, card: r.card });
      expect(outcome, name).toMatchObject({ status: "ERROR", reason: "EVENT_INVALID" });
      expect(await r.cardEvents(), name).toEqual([]);
    }
  });

  it("accepts UNKNOWN_HANDLE as the one rail answer that names no card, and logs it", async () => {
    const r = await rig({
      merchant: (rail) =>
        steered(rail, {
          checkout: async (_n, input) =>
            rail.authorise({ handle: "hdl_wrongHandleXXXXXXXXXX", amountMinor: input.cart.total_minor, merchantDomain: input.cart.merchant.domain, now: input.now, idempotencyKey: input.idempotencyKey }),
        }),
    });
    const outcome = await r.executor.checkout({ logId: LOG_ID, decision: r.decision, card: r.card });
    expect(outcome).toMatchObject({ status: "DECLINED", event: { decline_code: "UNKNOWN_HANDLE" } });
    expect(await r.cardEvents()).toHaveLength(1);
  });

  it("reports AMOUNT_ABOVE_APPROVED when the rail authorised more than was approved, and still logs the fact", async () => {
    const r = await rig({
      merchant: (rail) =>
        steered(rail, {
          checkout: async (_n, input) => ({
            card_id: rail.cards[0]?.id ?? "",
            event: "AUTHORISED",
            at: NOW,
            amount_minor: CART.total_minor + 1,
            merchant_domain: CART.merchant.domain,
            idempotency_key: input.idempotencyKey,
            simulated: true,
          }),
        }),
    });
    const outcome = await r.executor.checkout({ logId: LOG_ID, decision: r.decision, card: r.card });
    expect(outcome).toMatchObject({ status: "AUTHORISED", anomalies: ["AMOUNT_ABOVE_APPROVED"] });
    expect(await r.cardEvents()).toHaveLength(1);
  });

  it("reports MERCHANT_DOMAIN_MISMATCH when a card without a lock paid another domain (the real card has none [F1])", async () => {
    const wrongShop = (rail: FakeRail) =>
      steered(rail, {
        checkout: async (_n, input) =>
          rail.authorise({ handle: input.handle, amountMinor: CART.total_minor, merchantDomain: "other-shop.example", now: input.now, idempotencyKey: input.idempotencyKey }),
      });
    const open = await rig({ merchant: wrongShop, lock: false });
    expect(await open.executor.checkout({ logId: LOG_ID, decision: open.decision, card: open.card })).toMatchObject({
      status: "AUTHORISED",
      anomalies: ["MERCHANT_DOMAIN_MISMATCH"],
    });
    const locked = await rig({ merchant: wrongShop });
    expect(await locked.executor.checkout({ logId: LOG_ID, decision: locked.decision, card: locked.card })).toMatchObject({
      status: "DECLINED",
      event: { decline_code: "MERCHANT_MISMATCH" },
      anomalies: [],
    });
  });

  it("LOG_APPEND_FAILED keeps the rail's answer in the outcome so it is not lost", async () => {
    const r = await rig({ append: async () => Promise.reject(new Error("disk full")) });
    const outcome = await r.executor.checkout({ logId: LOG_ID, decision: r.decision, card: r.card });
    expect(outcome).toMatchObject({ status: "ERROR", reason: "LOG_APPEND_FAILED", event: { event: "AUTHORISED" }, last4: r.card.last4 });
    expect(r.rail.cards[0]?.state).toBe("USED");
  });

  it("LOG_UNAVAILABLE when the log cannot be read for the attempt number; nothing is charged", async () => {
    const r = await rig();
    vi.spyOn(r.store, "read").mockRejectedValue(new Error("log unreadable"));
    expect(await r.executor.checkout({ logId: LOG_ID, decision: r.decision, card: r.card })).toMatchObject({ reason: "LOG_UNAVAILABLE" });
    expect(r.rail.cards[0]?.state).toBe("ACTIVE");
  });

  it("never throws, even for garbage input", async () => {
    const r = await rig();
    const outcome = await r.executor.checkout(undefined as never);
    expect(outcome).toMatchObject({ status: "ERROR", simulated: true });
  });
});

describe("void and expiry bridge rail events into the log", () => {
  it("voidCard logs VOIDED; a second void, or a void after use, is RAIL_REJECTED", async () => {
    const r = await rig();
    expect(await r.executor.voidCard({ logId: LOG_ID, cardId: r.card.id })).toMatchObject({ status: "VOIDED", log_seq: 1 });
    expect(await r.executor.voidCard({ logId: LOG_ID, cardId: r.card.id })).toMatchObject({ status: "ERROR", reason: "RAIL_REJECTED" });
    const used = await rig();
    await used.executor.checkout({ logId: LOG_ID, decision: used.decision, card: used.card });
    expect(await used.executor.voidCard({ logId: LOG_ID, cardId: used.card.id })).toMatchObject({ reason: "RAIL_REJECTED" });
    expect((await used.cardEvents()).map((e) => e.event)).toEqual(["AUTHORISED"]);
  });

  it("voidCard reports LOG_APPEND_FAILED with the event", async () => {
    const r = await rig({ append: async () => Promise.reject(new Error("disk full")) });
    expect(await r.executor.voidCard({ logId: LOG_ID, cardId: r.card.id })).toMatchObject({ reason: "LOG_APPEND_FAILED", event: { event: "VOIDED" } });
  });

  it("expireDue logs one EXPIRED per due card, in order; nothing due is an empty success", async () => {
    const r = await rig();
    expect(await r.executor.expireDue({ logId: LOG_ID })).toMatchObject({ status: "EXPIRED", events: [], log_seqs: [] });
    r.clock.advance(TTL_MS);
    const done = await r.executor.expireDue({ logId: LOG_ID });
    expect(done).toMatchObject({ status: "EXPIRED", log_seqs: [1], events: [{ event: "EXPIRED", card_id: r.card.id }] });
    expect(await r.executor.expireDue({ logId: LOG_ID })).toMatchObject({ events: [] });
    expect(r.rail.cards[0]?.state).toBe("EXPIRED");
  });

  it("expireDue hands back what it could not log", async () => {
    const r = await rig({ append: async () => Promise.reject(new Error("disk full")) });
    r.clock.advance(TTL_MS);
    const outcome = await r.executor.expireDue({ logId: LOG_ID });
    expect(outcome).toMatchObject({ status: "ERROR", reason: "LOG_APPEND_FAILED", unlogged: [{ event: "EXPIRED" }] });
  });

  it("expireDue is RAIL_REJECTED with nothing unlogged when the rail throws", async () => {
    const r = await rig();
    vi.spyOn(r.rail, "expireDue").mockRejectedValue(new Error("rail down"));
    expect(await r.executor.expireDue({ logId: LOG_ID })).toMatchObject({ status: "ERROR", reason: "RAIL_REJECTED", unlogged: [] });
  });
});

describe("boundaries: the executor imports ports and schema only", () => {
  const dir = fileURLToPath(new URL("../src/executor/", import.meta.url));
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));

  it.each(files)("%s does not import rail-sim or the crypto module", (file) => {
    const source = readFileSync(join(dir, file), "utf8");
    const specifiers = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1] ?? "");
    for (const spec of specifiers) {
      expect(spec).not.toMatch(/rail-sim/);
      expect(spec).not.toMatch(/crypto/);
      expect(spec).not.toMatch(/\/(log|orchestrator|vc)(\/|$)/);
    }
    expect(source).not.toMatch(/console\.log/);
  });
});
