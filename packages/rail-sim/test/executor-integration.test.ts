// Executor (core) + RailSim + MerchantStub together: the DM2 beat and the failure injections of F19, all SIMULATED.
import { createExecutor } from "@wally/core/executor";
import type { CardRecord, Decision, LogEntry } from "@wally/core/generated";
import type { AppendEntry, CardEvent, Signer } from "@wally/core/ports";
import { FakeClock, MemoryLogStore, PLACEHOLDER_ENGINE_DID, placeholderEntry } from "@wally/core/testing";
import { loadFixture } from "@wally/core/testing/fixtures";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MerchantStub, RailSim, SIMULATED_SURCHARGE_MINOR, seededRandom, type MerchantStubOptions } from "../src";
import { MERCHANT, NOW, PAN_LIKE, CARD_TTL_MS, approvedDecision } from "./helpers";

const LOG_ID = "log_demoM0";
const TOTAL = 25_900;
const signer: Signer = { did: PLACEHOLDER_ENGINE_DID, sign: () => new Uint8Array(64) };

const appendEntry: AppendEntry = async (store, _signer, logId, kind, payload, now) => {
  const head = await store.head(logId);
  const entry = placeholderEntry({ logId, seq: head === null ? 0 : head.seq + 1, kind, payload, ts: now }) as LogEntry;
  await store.append(entry);
  return entry;
};

interface Rig {
  readonly rail: RailSim;
  readonly stub: MerchantStub;
  readonly decision: Decision;
  readonly card: CardRecord;
  readonly store: MemoryLogStore;
  readonly clock: FakeClock;
  readonly executor: ReturnType<typeof createExecutor>;
  checkout(): ReturnType<ReturnType<typeof createExecutor>["checkout"]>;
  cardEvents(): Promise<CardEvent[]>;
}

async function rig(stubOptions: Partial<Omit<MerchantStubOptions, "rail">> = {}, opts: { lock?: boolean; maxCheckoutCalls?: number } = {}): Promise<Rig> {
  const clock = new FakeClock(NOW);
  const store = new MemoryLogStore();
  await store.append(placeholderEntry({ logId: LOG_ID, seq: 0, kind: "MANDATE_SEALED", payload: loadFixture("mandate/m0.credential.json", "mandate-credential"), ts: NOW }));
  const rail = new RailSim({ random: seededRandom(11) });
  const decision = approvedDecision({ totalMinor: TOTAL });
  const card = await rail.mint({ decision, ttlMs: CARD_TTL_MS, now: NOW, ...(opts.lock === false ? {} : { merchantLock: MERCHANT }), purpose: decision.cart.id });
  await appendEntry(store, signer, LOG_ID, "DECISION", decision, NOW); // the executor pays only what the log stands behind (H3)
  await appendEntry(store, signer, LOG_ID, "CARD_MINTED", card, NOW);
  const stub = new MerchantStub({ rail, ...stubOptions });
  const executor = createExecutor({
    merchant: stub,
    rail,
    store,
    signer,
    appendEntry,
    clock,
    ...(opts.maxCheckoutCalls === undefined ? {} : { maxCheckoutCalls: opts.maxCheckoutCalls }),
  });
  const cardEvents = async (): Promise<CardEvent[]> => (await store.read(LOG_ID)).flatMap((e) => (e.kind === "CARD_EVENT" ? [e.payload] : []));
  return { rail, stub, decision, card, store, clock, executor, checkout: () => executor.checkout({ logId: LOG_ID, decision, card }), cardEvents };
}

describe("DM2 on the live card: overshoot, exact charge, blocked replay", () => {
  it("declines the overshoot with the limit held, authorises the exact charge, then blocks the replay; each step is one logged CARD_EVENT", async () => {
    const r = await rig({ mode: "overshoot" });
    const over = await r.checkout();
    expect(over).toMatchObject({
      status: "DECLINED",
      attempts: 1,
      idempotency_key: `chk:${r.card.id}:1`,
      event: { decline_code: "OVER_LIMIT", amount_minor: TOTAL + SIMULATED_SURCHARGE_MINOR },
    });
    expect(r.rail.card(r.card.id)?.state).toBe("ACTIVE");

    r.stub.setMode("honest");
    const exact = await r.checkout();
    expect(exact).toMatchObject({ status: "AUTHORISED", idempotency_key: `chk:${r.card.id}:2`, event: { amount_minor: TOTAL } });

    const replay = await r.checkout();
    expect(replay).toMatchObject({ status: "DECLINED", idempotency_key: `chk:${r.card.id}:3`, event: { decline_code: "CARD_USED" } });

    expect((await r.cardEvents()).map((e) => e.decline_code ?? e.event)).toEqual(["OVER_LIMIT", "AUTHORISED", "CARD_USED"]);
    expect(r.rail.authorisations()).toHaveLength(1);
    expect(PAN_LIKE.test(JSON.stringify([over, exact, replay]))).toBe(false);
    expect(JSON.stringify([over, exact, replay])).not.toContain(r.card.handle);
  });
});

describe("F19 failure injection: a lost response never means a second payment", () => {
  it("timeout after the charge landed: the retry with the same key returns the stored event, one charge", async () => {
    const r = await rig({ mode: "timeout" });
    const outcome = await r.checkout();
    expect(outcome).toMatchObject({ status: "AUTHORISED", attempts: 2 });
    expect(r.rail.authorisations()).toHaveLength(1);
    expect(await r.cardEvents()).toHaveLength(1);
  });

  it("timeout before the charge: the retry charges once", async () => {
    const r = await rig({ mode: "timeout", timeoutPhase: "before_charge" });
    expect(await r.checkout()).toMatchObject({ status: "AUTHORISED", attempts: 2 });
    expect(r.rail.authorisations()).toHaveLength(1);
  });

  it("more timeouts than the retry bound: TIMEOUT, then a re-run reuses the key and still charges exactly once", async () => {
    const r = await rig({ mode: "timeout", timeoutCount: 5 }, { maxCheckoutCalls: 3 });
    const first = await r.checkout();
    expect(first).toMatchObject({ status: "TIMEOUT", attempts: 3, idempotency_key: `chk:${r.card.id}:1` });
    expect(await r.cardEvents()).toEqual([]);
    expect(r.rail.authorisations()).toHaveLength(1); // the charge landed in the first lost response
    const second = await r.checkout();
    expect(second).toMatchObject({ status: "AUTHORISED", idempotency_key: `chk:${r.card.id}:1`, attempts: 3 });
    expect(r.rail.authorisations()).toHaveLength(1);
    expect(await r.cardEvents()).toHaveLength(1);
  });

  it("property: any mix of modes and timeouts leaves at most one charge per card and one log entry per answer", async () => {
    const modeArb = fc.constantFrom("honest", "overshoot", "timeout", "preauth", "wrong_merchant", "drift");
    await fc.assert(
      fc.asyncProperty(
        fc.array(modeArb, { minLength: 1, maxLength: 8 }),
        fc.integer({ min: 0, max: 4 }),
        fc.constantFrom("before_charge", "after_charge"),
        async (modes, timeoutCount, timeoutPhase) => {
          const r = await rig({ timeoutCount, timeoutPhase });
          let answered = 0;
          for (const mode of modes) {
            r.stub.setMode(mode);
            const outcome = await r.checkout();
            if (outcome.status === "AUTHORISED" || outcome.status === "DECLINED") answered += 1;
            expect(JSON.stringify(outcome)).not.toContain(r.card.handle);
          }
          expect(r.rail.authorisations().length).toBeLessThanOrEqual(1);
          const events = await r.cardEvents();
          expect(events).toHaveLength(answered);
          expect(events.filter((e) => e.event === "AUTHORISED").length).toBeLessThanOrEqual(1);
          for (const e of events) if (e.event === "AUTHORISED") expect(e.amount_minor).toBeLessThanOrEqual(TOTAL);
        },
      ),
      { numRuns: 80 },
    );
  });
});

describe("R12 drift, revocation and wrong merchant through the executor", () => {
  it("drift: the executor reports it, the orchestrator voids, the card is dead and the replay is CARD_VOIDED", async () => {
    const r = await rig({ mode: "drift" });
    const outcome = await r.checkout();
    expect(outcome).toMatchObject({ status: "DRIFT", approved_total_minor: TOTAL, quoted_total_minor: TOTAL + SIMULATED_SURCHARGE_MINOR });
    expect(r.rail.card(r.card.id)?.state).toBe("ACTIVE");
    expect(await r.executor.voidCard({ logId: LOG_ID, cardId: r.card.id })).toMatchObject({ status: "VOIDED" });
    r.stub.setMode("honest");
    expect(await r.checkout()).toMatchObject({ status: "DECLINED", event: { decline_code: "CARD_VOIDED" } });
    expect((await r.cardEvents()).map((e) => e.decline_code ?? e.event)).toEqual(["VOIDED", "CARD_VOIDED"]);
  });

  it("revocation after use is final: voiding a USED card is refused [F2] and logs nothing", async () => {
    const r = await rig();
    await r.checkout();
    expect(await r.executor.voidCard({ logId: LOG_ID, cardId: r.card.id })).toMatchObject({ status: "ERROR", reason: "RAIL_REJECTED" });
    expect(await r.cardEvents()).toHaveLength(1);
  });

  // Changed (lane s-fix-core, audit S-RAIL-4): without an explicit lock the rail locks the card to the approved
  // merchant, so the wrong merchant is declined either way (core's executor test covers the anomaly on a lock-free rail).
  it("wrong merchant: declined by the lock (SIMULATED), also when no lock was asked for", async () => {
    const locked = await rig({ mode: "wrong_merchant" });
    expect(await locked.checkout()).toMatchObject({ status: "DECLINED", event: { decline_code: "MERCHANT_MISMATCH" }, anomalies: [] });
    const unasked = await rig({ mode: "wrong_merchant" }, { lock: false });
    expect(await unasked.checkout()).toMatchObject({ status: "DECLINED", event: { decline_code: "MERCHANT_MISMATCH" } });
  });

  it("preauth: the hold above the quote is a false block on an exact-limit card [F2]", async () => {
    const r = await rig({ mode: "preauth" });
    expect(await r.checkout()).toMatchObject({ status: "DECLINED", event: { decline_code: "OVER_LIMIT" } });
    expect(r.rail.card(r.card.id)?.state).toBe("ACTIVE");
  });
});

describe("expiry through the executor", () => {
  it("expireDue logs EXPIRED and the card then declines CARD_EXPIRED", async () => {
    const r = await rig();
    r.clock.advance(CARD_TTL_MS);
    expect(await r.executor.expireDue({ logId: LOG_ID })).toMatchObject({ status: "EXPIRED", events: [{ event: "EXPIRED", card_id: r.card.id }] });
    expect(await r.checkout()).toMatchObject({ status: "DECLINED", event: { decline_code: "CARD_EXPIRED" } });
  });
});
