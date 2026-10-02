// Guards the orchestrator must enforce because the components alone do not (security audit lane s-audit, copied
// scenarios): re-fold before mint (H3), serialised decide+mint so unminted approvals cannot over-commit (H4),
// the rail's own event is logged, not the merchant's claim (H5), merchant lock from the approved cart, no mint of
// an APPROVE carrying a FAIL, pinned delegator for seal, answers and revocations, a verified log before every
// fold, R2 at checkout, schema-valid inputs first, and JUDGE_MODE enforce.
import { describe, expect, it, vi } from "vitest";
import { ENGINE_CONFIG } from "../src/config";
import { createSigner } from "../src/crypto";
import { createEngine } from "../src/engine";
import type { Decision, ListingRecord, LogEntry } from "../src/generated";
import { appendEntry, signEscalationAnswer, signRevocation } from "../src/log";
import type { DecidedResult } from "../src/orchestrator";
import type { CardEvent, Engine, MerchantPort, RailPort } from "../src/ports";
import { FakeJudge, FakeMerchant, FakeRail, MemoryLogStore } from "../src/testing";
import { signMandateCredential, type UnsignedMandateCredential } from "../src/vc";
import { LISTING_INJECTED, LISTING_TEE, PROPOSAL_A1, PROPOSAL_A3B } from "./cart-helpers";
import { testSeed } from "./crypto-independent";
import { LOG_ID, rig, type Rig } from "./orchestrator-helpers";

vi.setConfig({ testTimeout: 60_000 }); // explicit: these runs sign, verify and append; slow when the machine is loaded

const TEE = [LISTING_TEE];

async function sealed(options: Parameters<typeof rig>[0] = {}): Promise<Rig> {
  const r = rig(options);
  expect(await r.orchestrator.seal(r.credential)).toMatchObject({ ok: true });
  return r;
}

const buyTee = (r: Rig, listings: readonly ListingRecord[] = TEE) => {
  r.planners.push(PROPOSAL_A1);
  return r.orchestrator.submit({ requestText: "a tee", listings });
};

/** A store that lets the test act right after a given append (another writer, a clock jump). */
class HookedStore extends MemoryLogStore {
  after: ((entry: LogEntry) => Promise<void>) | null = null;
  tamper: ((entries: readonly LogEntry[]) => readonly LogEntry[]) | null = null;
  override async append(entry: LogEntry): Promise<void> {
    await super.append(entry);
    const hook = this.after;
    if (hook !== null) {
      this.after = null;
      await hook(entry);
    }
  }
  override async read(logId: string): Promise<readonly LogEntry[]> {
    const entries = await super.read(logId);
    return this.tamper === null ? entries : this.tamper(entries);
  }
}

describe("H3: re-fold immediately before mint", () => {
  it("a revoke logged by another writer between DECISION and mint stops the mint", async () => {
    const store = new HookedStore();
    const r = await sealed({ store });
    store.after = async (entry) => {
      if (entry.kind !== "DECISION") return;
      const revocation = signRevocation({ mandate_id: "mnd_demoM0", revoked_at: r.clock.now() }, r.keys.delegator);
      await appendEntry(store, r.keys.engine, LOG_ID, "MANDATE_REVOKED", revocation, r.clock.now());
    };
    const result = await buyTee(r);
    expect(result).toMatchObject({ ok: false, code: "MINT_ABORTED", decision: { outcome: "APPROVE" } });
    expect((r.rail as FakeRail).cards).toEqual([]);
    expect(await r.kinds()).toEqual(["MANDATE_SEALED", "DECISION", "MANDATE_REVOKED"]);
  });

  it("a packet that expires between decide and mint is not minted", async () => {
    const store = new HookedStore();
    const r = await sealed({ store });
    store.after = async (entry) => {
      if (entry.kind === "DECISION") r.clock.set(r.credential.validUntil);
    };
    expect(await buyTee(r)).toMatchObject({ ok: false, code: "MINT_ABORTED" });
    expect((r.rail as FakeRail).cards).toEqual([]);
  });
});

describe("H4: an approval not minted yet cannot be over-committed", () => {
  it("two HK$500 carts against HK$800 submitted together: one mint, the other DENY R3", async () => {
    const r = await sealed();
    const pricey: ListingRecord = { ...LISTING_TEE, items: [{ ...LISTING_TEE.items[0], unit_price_minor: 50000 }] } as ListingRecord;
    r.planners.push(PROPOSAL_A1, PROPOSAL_A1);
    const results = await Promise.all([
      r.orchestrator.submit({ requestText: "a tee", listings: [pricey] }),
      r.orchestrator.submit({ requestText: "a tee", listings: [pricey] }),
    ]);
    expect(results.map((x) => (x.ok && "outcome" in x ? x.outcome : x.ok)).sort()).toEqual(["APPROVE", "DENY"]);
    expect((r.rail as FakeRail).cards).toHaveLength(1);
    const packet = (await r.orchestrator.snapshot()).packet;
    expect((packet?.committed_minor ?? 0) + (packet?.spent_minor ?? 0)).toBeLessThanOrEqual(packet?.budget_minor ?? 0);
  });
});

describe("mint guards", () => {
  const approveWith = (patch: (d: Decision) => Decision): Engine => {
    const real = createEngine();
    return { decide: (...args) => patch(real.decide(...args)), decideCheckout: (i) => real.decideCheckout(i) };
  };

  it("an APPROVE that still carries a FAIL rule is never minted", async () => {
    const withFail = approveWith((d) => ({
      ...d,
      rules: d.rules.map((x) => (x.id === "R6" ? { ...x, result: "FAIL" as const, verdict: "DENY" as const, comparator: "in" as const, template_id: "R6.off_mandate" as const } : x)) as Decision["rules"],
    }));
    const r = await sealed({ engine: withFail });
    expect(await buyTee(r)).toMatchObject({ ok: false, code: "MINT_ABORTED" });
    expect((r.rail as FakeRail).cards).toEqual([]);
  });

  it("an APPROVE whose limit is not the cart total is never minted (I2)", async () => {
    const r = await sealed({ engine: approveWith((d) => (d.outcome === "APPROVE" ? { ...d, approved_limit_minor: 1 } : d)) });
    expect(await buyTee(r)).toMatchObject({ ok: false, code: "MINT_ABORTED" });
    expect((r.rail as FakeRail).cards).toEqual([]);
  });

  it("the merchant lock is the approved cart's merchant domain", async () => {
    const r = await sealed();
    const result = (await buyTee(r)) as DecidedResult;
    expect((r.rail as FakeRail).cards[0]?.merchant_lock).toBe(result.decision.cart.merchant.domain);
  });
});

describe("H5: the log carries the rail's own event, not the merchant's claim", () => {
  const underReporting = (rail: RailPort): MerchantPort => {
    const honest = new FakeMerchant(rail);
    return {
      quote: (i) => honest.quote(i),
      checkout: async (i): Promise<CardEvent> => {
        const real = await honest.checkout(i);
        return real.event === "AUTHORISED" ? { ...real, amount_minor: 1 } : real;
      },
    };
  };

  it("a merchant that charges the full amount but reports 1 cent: the rail's own event (HK$259) is what gets logged", async () => {
    const r = await sealed({ merchant: underReporting });
    const minted = (await buyTee(r)) as DecidedResult;
    const result = await r.orchestrator.checkout({ cardId: minted.card?.id ?? "" });
    expect(result).toMatchObject({ ok: true, status: "AUTHORISED", event: { amount_minor: 25900 } }); // FakeRail replays the recorded event for the key
    const logged = (await r.entries()).flatMap((e) => (e.kind === "CARD_EVENT" ? [e.payload.amount_minor] : []));
    expect(logged).toEqual([25900]);
    expect((await r.orchestrator.snapshot()).packet).toMatchObject({ spent_minor: 25900, remaining_minor: 54100 });
  });

  it("an honest merchant's event is the rail's event, logged as is", async () => {
    const r = await sealed();
    const minted = (await buyTee(r)) as DecidedResult;
    expect(await r.orchestrator.checkout({ cardId: minted.card?.id ?? "" })).toMatchObject({ ok: true, status: "AUTHORISED", event: { amount_minor: 25900 } });
  });
});

describe("pinned delegator", () => {
  const mallory = createSigner(testSeed("mallory-self-issuer"));

  it("seal refuses a self-issued credential (WRONG_ISSUER) and logs nothing", async () => {
    const r = rig();
    const { proof: _proof, ...genuine } = r.credential;
    const rules = { ...genuine.credentialSubject.rules, budget: { amount_minor: 99_999_999, currency: "HKD" as const } };
    const unsigned: UnsignedMandateCredential = { ...genuine, issuer: mallory.did, credentialSubject: { ...genuine.credentialSubject, rules } };
    const forged = signMandateCredential(unsigned, mallory, { created: new Date("2026-10-03T02:00:00Z") });
    const result = await r.orchestrator.seal(forged);
    expect(result).toMatchObject({ ok: false, code: "INVALID_CREDENTIAL" });
    expect(result.ok === false && result.message).toMatch(/WRONG_ISSUER/);
    expect(await r.entries()).toEqual([]);
  });

  it("an orchestrator cannot be built without a pinned delegator did:key", async () => {
    const { createOrchestrator } = await import("../src/orchestrator");
    const r = rig();
    expect(() =>
      createOrchestrator({
        engine: createEngine(),
        planner: () => ({ propose: async () => null }),
        judge: new FakeJudge(),
        rail: new FakeRail(),
        merchant: new FakeMerchant(new FakeRail()),
        store: new MemoryLogStore(),
        signer: r.keys.engine,
        clock: r.clock,
        ids: { cartId: () => "crt_x00001", runId: () => "run_x" },
        scameter: () => undefined,
        appendEntry,
        delegatorDid: "not-a-did",
      }),
    ).toThrow(/delegatorDid/);
  });

  it("a forged escalation answer is refused before decide: nothing logged, the escalation stays open", async () => {
    const r = await sealed();
    r.planners.push(PROPOSAL_A1);
    const esc = (await r.orchestrator.submit({ requestText: "a tee", listings: [{ ...LISTING_TEE, scameter_ref: null }] })) as DecidedResult;
    const forged = signEscalationAnswer({ decision_id: esc.decision.id, choice: "APPROVE", answered_at: r.clock.now() }, mallory);
    expect(await r.orchestrator.answerEscalation(forged)).toMatchObject({ ok: false, code: "INVALID_ANSWER" });
    expect((await r.orchestrator.snapshot()).escalations).toEqual([expect.objectContaining({ decisionId: esc.decision.id, state: "OPEN" })]);
    expect(await r.orchestrator.answerEscalation(r.answer(esc.decision.id, "APPROVE"))).toMatchObject({ ok: true, outcome: "APPROVE" });
  });
});

describe("the stored log is verified before every fold", () => {
  it("a rewritten entry fails closed (LOG_INVALID) with no decision", async () => {
    const store = new HookedStore();
    const r = await sealed({ store });
    store.tamper = (entries) =>
      entries.map((e) => (e.kind === "MANDATE_SEALED" ? ({ ...e, payload: { ...e.payload, validUntil: "2099-01-01T00:00:00Z" } } as LogEntry) : e));
    expect(await buyTee(r)).toMatchObject({ ok: false, code: "LOG_INVALID" });
    store.tamper = null;
    expect(await r.kinds()).toEqual(["MANDATE_SEALED"]);
  });

  it("a truncated log (behind the published checkpoint) fails closed", async () => {
    const store = new HookedStore();
    const r = await sealed({ store });
    await buyTee(r);
    store.tamper = (entries) => entries.slice(0, 1);
    expect(await buyTee(r)).toMatchObject({ ok: false, code: "LOG_INVALID" });
  });
});

describe("R2 at checkout", () => {
  it("a card the rail failed to void after a revoke is still never charged", async () => {
    const inner = new FakeRail();
    const stuck: RailPort = { mint: (q) => inner.mint(q), authorise: (q) => inner.authorise(q), void: () => Promise.reject(new Error("rail busy")), expireDue: (at) => inner.expireDue(at) };
    const r = await sealed({ rail: stuck });
    const minted = (await buyTee(r)) as DecidedResult;
    expect(await r.orchestrator.revoke(r.revocation())).toMatchObject({ ok: true, voidedCardIds: [], failedCardIds: [minted.card?.id] });
    const result = await r.orchestrator.checkout({ cardId: minted.card?.id ?? "" });
    expect(result).toMatchObject({ ok: true, status: "DENIED", decision: { outcome: "DENY", explanation: { template_id: "R2.revoked" } } });
    expect(inner.cards[0]?.state).toBe("ACTIVE"); // the rail still has it, but no charge was ever presented
    expect((await r.kinds()).filter((k) => k === "CARD_EVENT")).toEqual([]);
  });
});

describe("inputs and modes", () => {
  it("a listing with a domain outside the schema is refused before the planner runs", async () => {
    const r = await sealed();
    const bad = { ...LISTING_TEE, merchant: { name: "Evil", domain: "Evil.example/path" } } as ListingRecord;
    expect(await buyTee(r, [bad])).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    expect(r.planners.catalogues).toEqual([]);
  });

  it("JUDGE_MODE is enforce in this stack: a judge record that says shadow still stops an injected listing", async () => {
    const r = await sealed({ judge: new FakeJudge({ shadow: true, respond: () => ({ answers: { injection_risk: { clean: 0.1, suspicious: 0.2, injection: 0.7 } } }) }) });
    r.planners.push(PROPOSAL_A3B);
    const result = await r.orchestrator.submit({ requestText: "a graphic tee", listings: [LISTING_INJECTED] });
    expect(result).toMatchObject({ ok: true, outcome: "DENY", decision: { explanation: { template_id: "R10.injection" } } });
    expect(ENGINE_CONFIG.judge_mode).toBe("enforce");
  });
});
