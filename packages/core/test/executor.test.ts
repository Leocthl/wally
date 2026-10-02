// A-33 executor with the fakes: re-quote (R12), stable idempotency key, bounded same-key retries on a simulated
// timeout, CARD_EVENT appended through the injected AppendEntry, typed outcomes, handle never exposed (I8).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createExecutor, EXECUTOR_DEFAULTS, SimulatedTimeoutError, isSimulatedTimeout, type ExecutorDeps } from "../src/executor";
import type { CardRecord, Cart, Decision, LogEntry } from "../src/generated";
import type { AppendEntry, CardEvent, MerchantPort, MerchantQuote, RailPort, Signer } from "../src/ports";
import { FakeClock, FakeMerchant, FakeRail, MemoryLogStore, PLACEHOLDER_ENGINE_DID, placeholderEntry } from "../src/testing";
import { loadFixture } from "../src/testing/fixtures";

const LOG_ID = "log_demoM0";
const NOW = "2026-10-03T02:05:02Z";
/** The rig logs MANDATE_SEALED (seq 0), the APPROVE (1) and its CARD_MINTED (2): the first CARD_EVENT is seq 3. */
const FIRST_EVENT_SEQ = 3;
/** Test TTL for the fake rail; the rail rules themselves are tested in rail-sim. */
const TTL_MS = 60_000;
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

/** A RailPort over FakeRail that also keeps its own record per idempotency key (eventFor), optionally altered. */
function recordingRail(inner: FakeRail, alter: (event: CardEvent) => CardEvent = (event) => event): RailPort {
  let byKey: ReadonlyMap<string, CardEvent> = new Map();
  return {
    mint: (req) => inner.mint(req),
    authorise: async (req) => {
      const event = await inner.authorise(req);
      byKey = new Map([...byKey, [req.idempotencyKey, alter(event)]]);
      return event;
    },
    void: (id, at) => inner.void(id, at),
    expireDue: (at) => inner.expireDue(at),
    eventFor: async (key) => byKey.get(key) ?? null,
  };
}

interface RigOptions {
  /** The merchant, given the FakeRail and the RailPort the executor uses (the same object unless `rail` wraps it). */
  readonly merchant?: (rail: FakeRail, port: RailPort) => MerchantPort;
  readonly rail?: (inner: FakeRail) => RailPort;
  readonly append?: AppendEntry;
  readonly maxCheckoutCalls?: number;
  readonly lock?: boolean;
}

async function rig(options: RigOptions = {}): Promise<Rig> {
  const clock = new FakeClock(NOW);
  const store = new MemoryLogStore();
  await store.append(placeholderEntry({ logId: LOG_ID, seq: 0, kind: "MANDATE_SEALED", payload: CREDENTIAL, ts: clock.now() }));
  const rail = new FakeRail();
  const port = options.rail?.(rail) ?? rail;
  const decision = approvedDecision();
  const lock = options.lock === false ? {} : { merchantLock: CART.merchant.domain };
  const card = await rail.mint({ decision, ttlMs: TTL_MS, now: clock.now(), purpose: CART.id, ...lock });
  await appendEntry(store, signer, LOG_ID, "DECISION", decision, clock.now()); // the executor pays only what the log stands behind (H3)
  await appendEntry(store, signer, LOG_ID, "CARD_MINTED", card, clock.now());
  const merchant = options.merchant?.(rail, port) ?? new FakeMerchant(port);
  const deps: ExecutorDeps = {
    merchant,
    rail: port,
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
      log_seq: FIRST_EVENT_SEQ,
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
    expect(replay).toMatchObject({ status: "DECLINED", idempotency_key: `chk:${r.card.id}:2`, log_seq: FIRST_EVENT_SEQ + 1, event: { decline_code: "CARD_USED" } });
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

describe("checkout: concurrency and replays keep the log honest", () => {
  it("two concurrent checkouts on one card are serialised: one charge, one blocked replay, exactly two log entries", async () => {
    const r = await rig();
    const input = { logId: LOG_ID, decision: r.decision, card: r.card };
    const [a, b] = await Promise.all([r.executor.checkout(input), r.executor.checkout(input)]);
    expect(a).toMatchObject({ status: "AUTHORISED", idempotency_key: `chk:${r.card.id}:1`, log_seq: FIRST_EVENT_SEQ });
    expect(b).toMatchObject({ status: "DECLINED", idempotency_key: `chk:${r.card.id}:2`, log_seq: FIRST_EVENT_SEQ + 1, event: { decline_code: "CARD_USED" } });
    expect((await r.cardEvents()).map((e) => e.event)).toEqual(["AUTHORISED", "DECLINED"]);
  });

  it("does not serialise different cards against each other (both reach the merchant before either finishes)", async () => {
    let started = 0;
    let release: () => void = () => {};
    const bothStarted = new Promise<void>((resolve) => {
      release = resolve;
    });
    const r = await rig({
      merchant: (rail) =>
        steered(rail, {
          checkout: async (_n, _input, honest) => {
            started += 1;
            if (started === 2) release();
            await bothStarted;
            return honest();
          },
        }),
    });
    const decision2 = approvedDecision(CART, "dec_exec000002");
    const card2 = await r.rail.mint({ decision: decision2, ttlMs: TTL_MS, now: r.clock.now(), merchantLock: CART.merchant.domain });
    await appendEntry(r.store, signer, LOG_ID, "DECISION", decision2, r.clock.now());
    await appendEntry(r.store, signer, LOG_ID, "CARD_MINTED", card2, r.clock.now());
    const [a, b] = await Promise.all([
      r.executor.checkout({ logId: LOG_ID, decision: r.decision, card: r.card }),
      r.executor.checkout({ logId: LOG_ID, decision: decision2, card: card2 }),
    ]);
    expect([a.status, b.status]).toEqual(["AUTHORISED", "AUTHORISED"]);
    expect([a, b].map((o) => (o.status === "AUTHORISED" ? o.idempotency_key : ""))).toEqual([`chk:${r.card.id}:1`, `chk:${card2.id}:1`]);
  });

  it("an explicit key that is already in the log replays the logged outcome: no merchant call, no new entry", async () => {
    const r = await rig();
    const input = { logId: LOG_ID, decision: r.decision, card: r.card, idempotencyKey: "order-7.try:1" };
    const first = await r.executor.checkout(input);
    const spy = vi.spyOn(r.merchant, "checkout");
    const replay = await r.executor.checkout(input);
    expect(replay).toMatchObject({ status: "AUTHORISED", attempts: 0, idempotency_key: "order-7.try:1", log_seq: FIRST_EVENT_SEQ, anomalies: [] });
    expect(replay).toHaveProperty("event", (first as { event: CardEvent }).event);
    expect(spy).not.toHaveBeenCalled();
    expect(await r.cardEvents()).toHaveLength(1);
  });

  it("a logged DECLINED replays the same way", async () => {
    const r = await rig();
    await r.executor.checkout({ logId: LOG_ID, decision: r.decision, card: r.card });
    const declined = await r.executor.checkout({ logId: LOG_ID, decision: r.decision, card: r.card, idempotencyKey: "retry-after-used" });
    expect(declined).toMatchObject({ status: "DECLINED", attempts: 1 });
    const again = await r.executor.checkout({ logId: LOG_ID, decision: r.decision, card: r.card, idempotencyKey: "retry-after-used" });
    expect(again).toMatchObject({ status: "DECLINED", attempts: 0, log_seq: FIRST_EVENT_SEQ + 1 });
    expect(await r.cardEvents()).toHaveLength(2);
  });

  it("a void queued behind a checkout waits for it; a checkout queued behind a void is declined CARD_VOIDED", async () => {
    const pay = await rig();
    const [paid, voided] = await Promise.all([
      pay.executor.checkout({ logId: LOG_ID, decision: pay.decision, card: pay.card }),
      pay.executor.voidCard({ logId: LOG_ID, cardId: pay.card.id }),
    ]);
    expect(paid.status).toBe("AUTHORISED");
    expect(voided).toMatchObject({ status: "ERROR", reason: "RAIL_REJECTED" }); // a used card is final [F2]

    const stop = await rig();
    const [first, second] = await Promise.all([
      stop.executor.voidCard({ logId: LOG_ID, cardId: stop.card.id }),
      stop.executor.checkout({ logId: LOG_ID, decision: stop.decision, card: stop.card }),
    ]);
    expect(first.status).toBe("VOIDED");
    expect(second).toMatchObject({ status: "DECLINED", event: { decline_code: "CARD_VOIDED" } });
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

  // Changed (lane s-fix-core, audit LOW): the drift check compares every price field, as R12 does, not only the total.
  it("a re-split with an unchanged total is drift too (same comparison as R12); nothing is charged", async () => {
    const r = await rig({
      merchant: (rail) => steered(rail, { quote: async (cart) => ({ ...quoteOf(cart), shipping_minor: 100, subtotal_minor: cart.subtotal_minor - 100 }) }),
    });
    const outcome = await r.executor.checkout({ logId: LOG_ID, decision: r.decision, card: r.card });
    expect(outcome).toMatchObject({ status: "DRIFT", delta_minor: 0, changed: ["subtotal_minor", "shipping_minor"] });
    expect((r.merchant as ReturnType<typeof steered>).checkoutCalls).toHaveLength(0);
  });

  it("the orchestrator can then void the card through the executor", async () => {
    const r = await rig({ merchant: (rail) => steered(rail, { quote: async (cart) => quoteOf(cart, 500) }) });
    await r.executor.checkout({ logId: LOG_ID, decision: r.decision, card: r.card });
    const voided = await r.executor.voidCard({ logId: LOG_ID, cardId: r.card.id });
    expect(voided).toMatchObject({ status: "VOIDED", log_seq: FIRST_EVENT_SEQ, event: { event: "VOIDED", card_id: r.card.id } });
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
    expect(outcome).toMatchObject({ status: "AUTHORISED", attempts: 3, log_seq: FIRST_EVENT_SEQ });
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
    expect((r.merchant as ReturnType<typeof steered>).checkoutCalls).toHaveLength(2);
    expect(await r.cardEvents()).toEqual([]);

    failing = false;
    const rerun = await r.executor.checkout({ logId: LOG_ID, decision: r.decision, card: r.card });
    expect(rerun).toMatchObject({ status: "AUTHORISED", idempotency_key: `chk:${r.card.id}:1`, attempts: 1 });
    expect(await r.cardEvents()).toHaveLength(1);
  });

  it("the default bound is EXECUTOR_DEFAULTS.maxCheckoutCalls calls, no more", async () => {
    const r = await rig({ merchant: (rail) => steered(rail, { checkout: async () => Promise.reject(new SimulatedTimeoutError()) }) });
    expect(await r.executor.checkout({ logId: LOG_ID, decision: r.decision, card: r.card })).toMatchObject({
      status: "TIMEOUT",
      attempts: EXECUTOR_DEFAULTS.maxCheckoutCalls,
    });
    expect((r.merchant as ReturnType<typeof steered>).checkoutCalls).toHaveLength(EXECUTOR_DEFAULTS.maxCheckoutCalls);
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
    const { approved_limit_minor: _limit, ...withoutLimit } = r.decision;
    const denied: Decision = {
      ...withoutLimit,
      outcome: "DENY",
      rules: [{ id: "R3", result: "FAIL", verdict: "DENY", inputs: {}, comparator: "<=", threshold_ref: "packet.remaining_minor", template_id: "R3.over_remaining" }],
      explanation: { template_id: "R3.over_remaining", inputs: {}, rendered: "Stopped by R3 (SIMULATED test)." },
    };
    const cases: [string, string, Decision, CardRecord][] = [
      ["a DENY", "not an APPROVE", denied, r.card],
      ["a limit that differs from the cart total", "cart total", { ...r.decision, approved_limit_minor: r.decision.cart.total_minor - 1 }, r.card],
      ["a card minted for another decision", "another decision|not minted for this decision", r.decision, { ...r.card, decision_id: "dec_otherDecision1" }],
      ["a card limit that differs from the approved limit", "card limit", r.decision, { ...r.card, limit_minor: r.card.limit_minor + 1 }],
      ["a card of another mandate", "another mandate", r.decision, { ...r.card, mandate_id: "mnd_otherMandate1" }],
      ["a schema-invalid card", "card is not schema-valid", r.decision, { ...r.card, last4: "12" }],
      ["a schema-invalid decision", "decision is not schema-valid", { ...r.decision, id: "nope" }, r.card],
    ];
    const spy = vi.spyOn(r.merchant, "quote");
    for (const [name, expected, decision, card] of cases) {
      const outcome = await r.executor.checkout({ logId: LOG_ID, decision, card });
      expect(outcome, name).toMatchObject({ status: "ERROR", reason: "INVALID_INPUT" });
      expect((outcome as { message: string }).message, name).toMatch(new RegExp(expected));
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

  // Changed (lane s-fix-core, audit H5): the executor logs the rail's own record for the key, not the merchant's copy.
  // A merchant that claims a charge it never made gets its claim replayed at the rail, which declines it OVER_LIMIT.
  it("a claimed charge above the approved total is not what gets logged: the rail's own record (a decline) is", async () => {
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
    expect(outcome).toMatchObject({ status: "DECLINED", event: { decline_code: "OVER_LIMIT" }, anomalies: ["MERCHANT_REPORT_MISMATCH"] });
    expect(await r.cardEvents()).toEqual([expect.objectContaining({ event: "DECLINED" })]);
  });

  it("reports AMOUNT_ABOVE_APPROVED when the rail's own record shows more than was approved, and still logs the fact", async () => {
    const r = await rig({ rail: (inner) => recordingRail(inner, (event) => (event.event === "AUTHORISED" ? { ...event, amount_minor: CART.total_minor + 1 } : event)) });
    const outcome = await r.executor.checkout({ logId: LOG_ID, decision: r.decision, card: r.card });
    expect(outcome).toMatchObject({ status: "AUTHORISED", anomalies: ["AMOUNT_ABOVE_APPROVED", "MERCHANT_REPORT_MISMATCH"] });
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
    expect(await r.executor.voidCard({ logId: LOG_ID, cardId: r.card.id })).toMatchObject({ status: "VOIDED", log_seq: FIRST_EVENT_SEQ });
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
    expect(done).toMatchObject({ status: "EXPIRED", log_seqs: [FIRST_EVENT_SEQ], events: [{ event: "EXPIRED", card_id: r.card.id }] });
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

describe("rail and merchant misbehaviour is contained", () => {
  it("a rail that answers a void with another kind of event is EVENT_INVALID and nothing is logged", async () => {
    const r = await rig();
    const wrong: CardEvent = { card_id: r.card.id, event: "EXPIRED", at: NOW, simulated: true };
    vi.spyOn(r.rail, "void").mockResolvedValue(wrong);
    expect(await r.executor.voidCard({ logId: LOG_ID, cardId: r.card.id })).toMatchObject({ status: "ERROR", reason: "EVENT_INVALID" });
    vi.spyOn(r.rail, "void").mockResolvedValue({ ...wrong, event: "VOIDED", card_id: "crd_someoneElse1" });
    expect(await r.executor.voidCard({ logId: LOG_ID, cardId: r.card.id })).toMatchObject({ reason: "EVENT_INVALID" });
    vi.spyOn(r.rail, "void").mockResolvedValue({ event: "VOIDED" } as CardEvent);
    expect(await r.executor.voidCard({ logId: LOG_ID, cardId: r.card.id })).toMatchObject({ reason: "EVENT_INVALID" });
    expect(await r.cardEvents()).toEqual([]);
  });

  it("a rail that expires with a wrong kind of event is EVENT_INVALID and hands every event back", async () => {
    const r = await rig();
    const bad: CardEvent = { card_id: r.card.id, event: "VOIDED", at: NOW, simulated: true };
    vi.spyOn(r.rail, "expireDue").mockResolvedValue([bad]);
    expect(await r.executor.expireDue({ logId: LOG_ID })).toMatchObject({ status: "ERROR", reason: "EVENT_INVALID", unlogged: [bad] });
    expect(await r.cardEvents()).toEqual([]);
  });

  it("a thrown value that is not an Error still becomes a typed outcome", async () => {
    const r = await rig({ merchant: (rail) => steered(rail, { checkout: async () => Promise.reject("just a string") }) });
    expect(await r.executor.checkout({ logId: LOG_ID, decision: r.decision, card: r.card })).toMatchObject({
      status: "ERROR",
      reason: "CHECKOUT_FAILED",
      message: "unknown error",
    });
  });

  it("a rail that throws on void is RAIL_REJECTED", async () => {
    const r = await rig();
    vi.spyOn(r.rail, "void").mockRejectedValue(new Error("rail offline"));
    expect(await r.executor.voidCard({ logId: LOG_ID, cardId: r.card.id })).toMatchObject({ reason: "RAIL_REJECTED", message: expect.stringContaining("rail offline") });
  });
});

describe("H3: the executor pays only what the log still stands behind (audit S-RAIL-1, at the component)", () => {
  const revocation = { mandate_id: "mnd_demoM0", revoked_at: NOW, signer: CREDENTIAL.issuer, signature: "A".repeat(86) };
  const resolving = (approved: Decision): Decision => {
    const { approved_limit_minor: _limit, ...rest } = approved;
    return {
      ...rest,
      id: "dec_exec000009",
      outcome: "DENY",
      resolves: approved.id,
      rules: [{ id: "R12", result: "FAIL", verdict: "DENY", inputs: {}, comparator: "==", template_id: "R12.price_drift" }],
      explanation: { template_id: "R12.price_drift", inputs: {}, rendered: "Stopped by R12 (SIMULATED test)." },
    };
  };
  const cases: readonly [string, string, (r: Rig) => Promise<unknown>][] = [
    ["the mandate was revoked", "MANDATE_REVOKED", (r) => appendEntry(r.store, signer, LOG_ID, "MANDATE_REVOKED", revocation, r.clock.now())],
    ["PACKET_EXPIRED is logged", "PACKET_EXPIRED", (r) => appendEntry(r.store, signer, LOG_ID, "PACKET_EXPIRED", { mandate_id: "mnd_demoM0", expired_at: NOW }, r.clock.now())],
    ["validUntil has passed", "PACKET_EXPIRED", async (r) => r.clock.set(CREDENTIAL.validUntil)],
    ["a later decision resolved the approval", "APPROVAL_RESOLVED", (r) => appendEntry(r.store, signer, LOG_ID, "DECISION", resolving(r.decision), r.clock.now())],
    ["the log over-commits (the fold refuses it)", "LOG_INVALID", (r) => appendEntry(r.store, signer, LOG_ID, "DECISION", { ...approvedDecision(CART, "dec_exec000077"), approved_limit_minor: 60_000, cart: { ...CART, total_minor: 60_000, subtotal_minor: 60_000, shipping_minor: 0, fees_minor: 0, fx: null, items: [{ ...CART.items[0], qty: 1, unit_price_minor: 60_000 }] } }, r.clock.now())],
  ];
  it.each(cases)("refuses when %s: no quote, no merchant call, nothing logged", async (_name, reason, mutate) => {
    const r = await rig();
    await mutate(r);
    const quote = vi.spyOn(r.merchant, "quote");
    const outcome = await r.executor.checkout({ logId: LOG_ID, decision: r.decision, card: r.card });
    expect(outcome).toMatchObject({ status: "ERROR", reason, last4: r.card.last4 });
    expect(quote).not.toHaveBeenCalled();
    expect(await r.cardEvents()).toEqual([]);
    expect(r.rail.cards[0]?.state).toBe("ACTIVE");
  });

  it("refuses an APPROVE or a card that is not in the log exactly as given", async () => {
    const r = await rig();
    const otherDecision = { ...r.decision, decided_at: "2026-10-03T02:05:03Z" };
    expect(await r.executor.checkout({ logId: LOG_ID, decision: otherDecision, card: r.card })).toMatchObject({ reason: "APPROVAL_NOT_LOGGED" });
    expect(await r.executor.checkout({ logId: LOG_ID, decision: r.decision, card: { ...r.card, purpose: "crt_otherPurpose" } })).toMatchObject({ reason: "CARD_NOT_LOGGED" });
    expect(await r.cardEvents()).toEqual([]);
  });
});

describe("H5: the rail's own record is what gets logged (rail with eventFor)", () => {
  const lying = (port: RailPort): MerchantPort => {
    const honest = new FakeMerchant(port);
    return { quote: (i) => honest.quote(i), checkout: async (i) => ({ ...(await honest.checkout(i)), amount_minor: 1 }) };
  };

  it("an under-reporting merchant: the rail's amount is logged, the claim is flagged MERCHANT_REPORT_MISMATCH", async () => {
    const r = await rig({ rail: (inner) => recordingRail(inner), merchant: (_fake, port) => lying(port) });
    const outcome = await r.executor.checkout({ logId: LOG_ID, decision: r.decision, card: r.card });
    expect(outcome).toMatchObject({ status: "AUTHORISED", event: { amount_minor: CART.total_minor }, anomalies: ["MERCHANT_REPORT_MISMATCH"] });
    expect((await r.cardEvents()).map((e) => e.amount_minor)).toEqual([CART.total_minor]);
  });

  it("a merchant that never reached the rail: RAIL_MISMATCH, nothing logged, the card stays ACTIVE", async () => {
    const fake = (cardId: string, key: string): CardEvent => ({ card_id: cardId, event: "AUTHORISED", at: NOW, amount_minor: 1, merchant_domain: CART.merchant.domain, idempotency_key: key, simulated: true });
    const r = await rig({ rail: (inner) => recordingRail(inner), merchant: (rail) => steered(rail, { checkout: async (_n, input) => fake(rail.cards[0]?.id ?? "", input.idempotencyKey) }) });
    expect(await r.executor.checkout({ logId: LOG_ID, decision: r.decision, card: r.card })).toMatchObject({ status: "ERROR", reason: "RAIL_MISMATCH" });
    expect(await r.cardEvents()).toEqual([]);
    expect(r.rail.cards[0]?.state).toBe("ACTIVE");
  });

  it("an honest merchant's event equals the rail's record: logged as is, no anomaly", async () => {
    const r = await rig({ rail: (inner) => recordingRail(inner) });
    expect(await r.executor.checkout({ logId: LOG_ID, decision: r.decision, card: r.card })).toMatchObject({ status: "AUTHORISED", anomalies: [] });
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
