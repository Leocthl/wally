// Property tests (A-27) over random operation sequences through the orchestrator on RailSim (SIMULATED): submit with
// random listings, judge results and injected faults, checkout in every merchant mode, answers (some forged),
// revoke and ticks. After each sequence: T-I1, T-I2, T-I5, T-I6, T-I7, T-I8. Seed pinned for CI.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ENGINE_CONFIG } from "@wally/core/config";
import { createEngine } from "@wally/core/engine";
import type { CardRecord, Decision, ListingRecord, LogEntry, ProposeCartInput } from "@wally/core/generated";
import { appendEntry, findCardData, signEscalationAnswer, signRevocation } from "@wally/core/log";
import { createOrchestrator, type OrchestratorEvent } from "@wally/core/orchestrator";
import type { JudgeRecord, RailPort } from "@wally/core/ports";
import { FakeClock, FakeJudge, FakePlanner, MemoryLogStore } from "@wally/core/testing";
import { loadFixture } from "@wally/core/testing/fixtures";
import { verifyChain } from "@wally/core/verify";
import { MerchantStub, RailSim, seededRandom, sequentialIds, type MerchantMode } from "../src";
import { HOODIE, INJECTED, JACKET, P_A1, P_A2, P_A3, P_A3B, P_A4, SEAL_AT, SOCKS, TEE, credential, keys } from "./orchestrator-helpers";

const PROPERTY_SEED = Number(process.env["FAST_CHECK_SEED"] ?? 20_261_004); // FAST_CHECK_SEED explores other seeds locally
const LOG_ID = "log_demoM0";
const VALID_FOR_MS = 2 * 60 * 60_000; // SIMULATED short packet so some sequences pass validUntil (S6)

type JudgeMode = "clean" | "injection" | "seller_high" | "timeout" | "error";
type Fault = "none" | "append_decision" | "append_minted" | "mint_throws";

const CHOICES: readonly { readonly listing: ListingRecord; readonly proposal: ProposeCartInput }[] = [
  { listing: TEE, proposal: P_A1 },
  { listing: SOCKS, proposal: P_A4 },
  { listing: JACKET, proposal: P_A3 },
  { listing: HOODIE, proposal: P_A2 },
  { listing: INJECTED, proposal: P_A3B },
  { listing: { ...TEE, scameter_ref: null }, proposal: P_A1 }, // NOT_CHECKED => ESCALATE R9.unverified
  { listing: { ...SOCKS, scameter_ref: null }, proposal: P_A4 },
];

type Op =
  | { readonly kind: "submit"; readonly choice: number; readonly judge: JudgeMode; readonly planner: "ok" | "null" | "unknown_url"; readonly fault: Fault }
  | { readonly kind: "checkout"; readonly card: number; readonly mode: MerchantMode }
  | { readonly kind: "answer"; readonly esc: number; readonly choice: "APPROVE" | "DENY"; readonly forged: boolean }
  | { readonly kind: "revoke" }
  | { readonly kind: "tick"; readonly advanceMs: number };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  { weight: 5, arbitrary: fc.record({ kind: fc.constant("submit" as const), choice: fc.nat(CHOICES.length - 1), judge: fc.constantFrom<JudgeMode>("clean", "clean", "clean", "injection", "seller_high", "timeout", "error"), planner: fc.constantFrom("ok" as const, "ok" as const, "ok" as const, "null" as const, "unknown_url" as const), fault: fc.constantFrom<Fault>("none", "none", "none", "none", "append_decision", "append_minted", "mint_throws") }) },
  { weight: 3, arbitrary: fc.record({ kind: fc.constant("checkout" as const), card: fc.nat(5), mode: fc.constantFrom<MerchantMode>("honest", "honest", "overshoot", "drift", "timeout", "wrong_merchant") }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("answer" as const), esc: fc.nat(5), choice: fc.constantFrom("APPROVE" as const, "DENY" as const), forged: fc.boolean() }) },
  { weight: 1, arbitrary: fc.constant({ kind: "revoke" as const }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("tick" as const), advanceMs: fc.constantFrom(0, 30_000, ENGINE_CONFIG.escalation.window_ms, ENGINE_CONFIG.card.ttl_ms, VALID_FOR_MS) }) },
);

const INJECTION = loadFixture("judge/injected-tee.json", "judge-record").answers ?? {};

/** Store that refuses the next append of one kind. */
class FlakyStore extends MemoryLogStore {
  failNext: LogEntry["kind"] | null = null;
  override async append(entry: LogEntry): Promise<void> {
    if (entry.kind === this.failNext) {
      this.failNext = null;
      throw new Error(`injected append failure (${entry.kind})`);
    }
    return super.append(entry);
  }
}

interface World {
  readonly rail: RailSim;
  readonly store: FlakyStore;
  readonly events: OrchestratorEvent[];
  readonly decisions: Decision[];
  readonly injectedCards: string[];
  /** The final snapshot without its log field. */
  snapshotJson: string;
}

function judgeFor(mode: () => JudgeMode): FakeJudge {
  return new FakeJudge({
    respond: () => {
      const m = mode();
      if (m === "injection") return { answers: INJECTION };
      if (m === "seller_high") return { answers: { seller_risk: { low_risk: 0.1, high_risk: 0.9 } } };
      if (m === "timeout") return { status: "TIMEOUT" as JudgeRecord["status"] };
      if (m === "error") return { status: "ERROR" as JudgeRecord["status"] };
      return {};
    },
  });
}

async function runSequence(ops: readonly Op[]): Promise<World> {
  const k = keys();
  const clock = new FakeClock(SEAL_AT);
  const rail = new RailSim({ random: seededRandom(3), ids: sequentialIds() });
  const store = new FlakyStore();
  const stub = new MerchantStub({ rail });
  let judgeMode: JudgeMode = "clean";
  let mintThrows = false;
  let nextProposal: ProposeCartInput | null = null;
  let carts = 0;
  const flakyRail: RailPort = {
    mint: (req) => (mintThrows ? Promise.reject(new Error("injected rail fault")) : rail.mint(req)),
    authorise: (req) => rail.authorise(req),
    void: (id, at) => rail.void(id, at),
    expireDue: (at) => rail.expireDue(at),
  };
  const orchestrator = createOrchestrator({
    engine: createEngine({ config: { ...ENGINE_CONFIG, judge_mode: "enforce" } }), // JUDGE_MODE=enforce
    planner: () => new FakePlanner([nextProposal]),
    judge: judgeFor(() => judgeMode),
    rail: flakyRail,
    merchant: stub,
    store,
    signer: k.engine,
    clock,
    ids: { cartId: () => `crt_prop${String((carts += 1)).padStart(6, "0")}`, runId: () => `run_${carts}` },
    scameter: (ref) => ["demo-apparel", "demo-outlet", "demo-streetwear", "flagged-seller"].map((n) => loadFixture(`scameter/${n}.json`, "scameter-capture")).find((c) => c.capture_ref === ref),
    appendEntry,
    delegatorDid: k.delegator.did,
  });
  const world: World = { rail, store, events: [], decisions: [], injectedCards: [], snapshotJson: "{}" };
  orchestrator.subscribe((e) => world.events.push(e));
  const until = new Date(Date.parse(SEAL_AT) + VALID_FOR_MS).toISOString();
  expect(await orchestrator.seal(credential(k, until))).toMatchObject({ ok: true });

  const activeIds = () => new Set(rail.cards.filter((c) => c.state === "ACTIVE").map((c) => c.id));
  const logged = async () => store.read(LOG_ID);
  const record = (result: unknown) => {
    const d = (result as { decision?: Decision }).decision;
    if (d !== undefined) world.decisions.push(d);
  };

  for (const op of ops) {
    if (op.kind === "submit") {
      const choice = CHOICES[op.choice] ?? CHOICES[0];
      if (choice === undefined) continue;
      judgeMode = op.judge;
      nextProposal = op.planner === "null" ? null : op.planner === "unknown_url" ? { ...choice.proposal, listing_url: "https://elsewhere.example/p/x" } : choice.proposal;
      store.failNext = op.fault === "append_decision" ? "DECISION" : op.fault === "append_minted" ? "CARD_MINTED" : null;
      mintThrows = op.fault === "mint_throws";
      const before = activeIds();
      const result = await orchestrator.submit({ requestText: "shopper request", listings: [choice.listing] });
      record(result);
      const injected = op.fault !== "none" || op.judge === "timeout" || op.judge === "error" || op.planner !== "ok";
      const fresh = [...activeIds()].filter((id) => !before.has(id));
      if (injected) world.injectedCards.push(...fresh); // T-I5: must stay empty
      store.failNext = null;
      mintThrows = false;
    } else if (op.kind === "checkout") {
      const cards = (await logged()).flatMap((e) => (e.kind === "CARD_MINTED" ? [e.payload.id] : []));
      const cardId = cards[op.card % Math.max(1, cards.length)];
      if (cardId === undefined) continue;
      stub.setMode(op.mode);
      record(await orchestrator.checkout({ cardId }));
    } else if (op.kind === "answer") {
      const escalations = (await logged()).flatMap((e) => (e.kind === "DECISION" && e.payload.outcome === "ESCALATE" ? [e.payload] : []));
      const esc = escalations[op.esc % Math.max(1, escalations.length)];
      if (esc === undefined) continue;
      const signer = op.forged ? k.engine : k.delegator;
      const answer = signEscalationAnswer({ decision_id: esc.id, mandate_id: esc.mandate_id, cart: esc.cart, choice: op.choice, answered_at: clock.now() }, signer);
      record(await orchestrator.answerEscalation(answer));
    } else if (op.kind === "revoke") {
      await orchestrator.revoke(signRevocation({ mandate_id: "mnd_demoM0", revoked_at: clock.now() }, k.delegator));
    } else {
      clock.advance(op.advanceMs);
      await orchestrator.tick();
    }
  }
  const { log: _log, ...snapshot } = await orchestrator.snapshot();
  world.snapshotJson = JSON.stringify(snapshot);
  return world;
}

function checkInvariants(world: World, entries: readonly LogEntry[], engineDid: string, delegatorDid: string): void {
  const decisionEntries = entries.flatMap((e) => (e.kind === "DECISION" ? [{ seq: e.seq, d: e.payload }] : []));
  const byId = new Map(decisionEntries.map((x) => [x.d.id, x] as const));
  const minted = entries.flatMap((e) => (e.kind === "CARD_MINTED" ? [{ seq: e.seq, card: e.payload }] : []));
  const stopSeq = entries.find((e) => e.kind === "MANDATE_REVOKED" || e.kind === "PACKET_EXPIRED")?.seq ?? Number.POSITIVE_INFINITY;

  // T-I1: every card on the rail and in the log rests on an APPROVE logged before it.
  for (const { seq, card } of minted) {
    const approval = byId.get(card.decision_id);
    expect(approval?.d.outcome).toBe("APPROVE");
    expect(approval?.seq ?? Number.POSITIVE_INFINITY).toBeLessThan(seq);
  }
  for (const card of world.rail.cards) {
    expect(byId.get(card.decision_id)?.d.outcome).toBe("APPROVE");
    if (!minted.some((m) => m.card.id === card.id)) expect(card.state).toBe("VOIDED"); // minted but not logged => voided at once
  }
  // T-I2: limit = approved total = cart total <= min(remaining when decided, rail ceiling [F1]).
  for (const { card } of minted) {
    const d = byId.get(card.decision_id)?.d as Decision;
    expect(card.limit_minor).toBe(d.approved_limit_minor);
    expect(card.limit_minor).toBe(d.cart.total_minor);
    expect(card.limit_minor).toBeLessThanOrEqual(Math.min(d.packet.remaining_minor, ENGINE_CONFIG.rail.ceiling_minor));
  }
  // T-I5: an operation run under an injected failure never left a new ACTIVE card.
  expect(world.injectedCards).toEqual([]);
  // T-I6: nothing approved or minted after a revoke or the packet expiry.
  for (const { seq } of minted) expect(seq).toBeLessThan(stopSeq);
  for (const { seq, d } of decisionEntries) if (seq > stopSeq) expect(d.outcome).not.toBe("APPROVE");
  if (stopSeq !== Number.POSITIVE_INFINITY) {
    for (const card of world.rail.cards) {
      const mintedAt = minted.find((m) => m.card.id === card.id)?.seq ?? -1;
      if (mintedAt >= 0 && mintedAt < stopSeq) expect(card.state).not.toBe("ACTIVE");
    }
  }
  // T-I7: one DECISION entry per decision; every decision an operation reported is in the log once; the chain verifies.
  expect(new Set(decisionEntries.map((x) => x.d.id)).size).toBe(decisionEntries.length);
  for (const d of world.decisions) expect(decisionEntries.filter((x) => x.d.id === d.id)).toHaveLength(1);
  expect(verifyChain(entries, { engine: [engineDid], delegator: delegatorDid })).toMatchObject({ ok: true });
  // T-I8: no handle and no PAN-like run in events or the snapshot outside log entries.
  const outside = JSON.stringify(world.events.filter((e) => e.type !== "log")) + world.snapshotJson;
  expect(outside).not.toMatch(/hdl_/);
  expect(findCardData(world.events.filter((e) => e.type !== "log"))).toBeNull();
  expect(findCardData(JSON.parse(world.snapshotJson))).toBeNull();
}

describe("orchestrator invariants over random operation sequences (SIMULATED rail)", () => {
  it("T-I1, T-I2, T-I5, T-I6, T-I7, T-I8 hold after every sequence", async () => {
    const k = keys();
    const seen = { minted: 0, revoked: 0, expired: 0, resolved: 0, voided: 0, used: 0 };
    await fc.assert(
      fc.asyncProperty(fc.array(opArb, { minLength: 1, maxLength: 14 }), async (ops) => {
        const world = await runSequence(ops);
        const entries = await world.store.read(LOG_ID);
        checkInvariants(world, entries, k.engine.did, k.delegator.did);
        seen.minted += entries.filter((e) => e.kind === "CARD_MINTED").length;
        seen.revoked += entries.filter((e) => e.kind === "MANDATE_REVOKED").length;
        seen.expired += entries.filter((e) => e.kind === "PACKET_EXPIRED").length;
        seen.resolved += entries.filter((e) => e.kind === "DECISION" && e.payload.resolves !== undefined).length;
        seen.voided += world.rail.cards.filter((c) => c.state === "VOIDED").length;
        seen.used += world.rail.cards.filter((c) => c.state === "USED").length;
      }),
      { numRuns: 40, seed: PROPERTY_SEED },
    );
    for (const [what, count] of Object.entries(seen)) expect(count, `no sequence produced ${what}`).toBeGreaterThan(0); // not vacuous
  }, 120_000);

  it("a sequence of honest purchases leaves CardRecord handles only inside CARD_MINTED log entries", async () => {
    const world = await runSequence([
      { kind: "submit", choice: 0, judge: "clean", planner: "ok", fault: "none" },
      { kind: "checkout", card: 0, mode: "honest" },
    ]);
    const entries = await world.store.read(LOG_ID);
    const handles = entries.flatMap((e) => (e.kind === "CARD_MINTED" ? [(e.payload as CardRecord).handle] : []));
    expect(handles).toHaveLength(1);
    const logEvents = world.events.filter((e) => e.type === "log");
    expect(JSON.stringify(logEvents)).toContain(handles[0]);
    expect(JSON.stringify(world.events.filter((e) => e.type !== "log"))).not.toContain(handles[0]);
  });
});
