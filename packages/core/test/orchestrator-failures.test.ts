// Failure injection (T-I5 at orchestrator level): judge timeout, error or junk; planner fault or hang; append,
// mint and read failures. Every path fails closed: no card without a logged APPROVE, and the queue keeps working.
import { describe, expect, it, vi } from "vitest";
import { createEngine } from "../src/engine";
import type { CardRecord, LogEntry } from "../src/generated";
import type { PlannerFactory } from "../src/orchestrator";
import { MintError, type Engine, type JudgePort, type JudgeRecord, type MintRequest, type RailPort } from "../src/ports";
import { FakeJudge, FakeRail, MemoryLogStore } from "../src/testing";
import { LISTING_TEE, PROPOSAL_A1 } from "./cart-helpers";
import { rig, type Rig } from "./orchestrator-helpers";

vi.setConfig({ testTimeout: 60_000 }); // explicit: these runs sign, verify and append; slow when the machine is loaded

const TEE = [LISTING_TEE];
const FAST = { judgeTimeoutMs: 25, plannerTimeoutMs: 25 };

async function sealedRig(options: Parameters<typeof rig>[0] = {}): Promise<Rig> {
  const r = rig(options);
  expect(await r.orchestrator.seal(r.credential)).toMatchObject({ ok: true });
  return r;
}

const submitTee = (r: Rig) => {
  r.planners.push(PROPOSAL_A1);
  return r.orchestrator.submit({ requestText: "a tee", listings: TEE });
};

/** Store that refuses appends of one kind (once, or always). */
class FlakyStore extends MemoryLogStore {
  failKind: LogEntry["kind"] | null = null;
  failReads = false;
  override async append(entry: LogEntry): Promise<void> {
    if (entry.kind === this.failKind) throw new Error(`disk full while writing ${entry.kind}`);
    return super.append(entry);
  }
  override async read(logId: string): Promise<readonly LogEntry[]> {
    if (this.failReads) throw new Error("disk unreadable");
    return super.read(logId);
  }
}

const neverJudge: JudgePort = { provider: "laya", assess: () => new Promise<JudgeRecord>(() => undefined) };

describe("judge failures escalate R10.unavailable (I5), no card", () => {
  const cases: readonly [string, JudgePort][] = [
    ["hangs past the deadline", neverJudge],
    ["throws", { provider: "laya", assess: () => Promise.reject(new Error("socket hang up")) }],
    ["returns a record that fails its schema", { provider: "laya", assess: async () => ({ status: "OK" }) as unknown as JudgeRecord }],
    ["reports truncated input", new FakeJudge({ inputTruncated: true })],
    ["times out itself", new FakeJudge({ status: "TIMEOUT" })],
  ];
  it.each(cases)("judge %s", async (_name, judge) => {
    const r = await sealedRig({ judge, config: FAST });
    const result = await submitTee(r);
    expect(result).toMatchObject({ ok: true, outcome: "ESCALATE", card: null, decision: { explanation: { template_id: "R10.unavailable" } } });
    expect(await r.kinds()).toEqual(["MANDATE_SEALED", "DECISION"]);
    expect((r.rail as FakeRail).cards).toEqual([]);
  });
});

describe("planner failures are no proposal (I5)", () => {
  const throwing: PlannerFactory = () => ({ propose: () => Promise.reject(new Error("planner crashed")) });
  const hanging: PlannerFactory = () => ({ propose: () => new Promise<null>(() => undefined) });
  const unbuildable: PlannerFactory = () => {
    throw new Error("bad catalogue");
  };
  it.each([
    ["throws", throwing, "planner_error"],
    ["hangs past the deadline [F33]", hanging, "planner_timeout"],
    ["cannot be built", unbuildable, "planner_error"],
  ] as const)("a planner that %s makes no Decision", async (_name, planner, reason) => {
    const r = await sealedRig({ planner, config: FAST });
    expect(await r.orchestrator.submit({ requestText: "a tee", listings: TEE })).toMatchObject({ ok: true, outcome: "NO_PROPOSAL", reason });
    expect(await r.kinds()).toEqual(["MANDATE_SEALED"]);
  });

  it("forwards planner trace steps as planner.step events, and drops steps that arrive after the deadline", async () => {
    const step = { step: 1, question: "item_choice", choice: "lst_demoTee", probabilities: { lst_demoTee: 0.9, none: 0.1 }, margin: 0.8 };
    let late: ((s: typeof step) => void) | undefined;
    const tracing: PlannerFactory = () => ({
      propose: async (_ctx, opts) => {
        opts.onTrace?.(step);
        late = opts.onTrace;
        return PROPOSAL_A1;
      },
    });
    const r = await sealedRig({ planner: tracing });
    await r.orchestrator.submit({ requestText: "a tee", listings: TEE });
    late?.({ ...step, step: 2 });
    expect(r.events.filter((e) => e.type === "planner.step")).toEqual([expect.objectContaining({ type: "planner.step", step })]);
  });
});

describe("log and rail failures", () => {
  it("DECISION append fails: ERROR, nothing minted, the queue keeps working", async () => {
    const store = new FlakyStore();
    const r = await sealedRig({ store });
    store.failKind = "DECISION";
    expect(await submitTee(r)).toMatchObject({ ok: false, code: "LOG_APPEND_FAILED" });
    expect((r.rail as FakeRail).cards).toEqual([]);
    store.failKind = null;
    expect(await submitTee(r)).toMatchObject({ ok: true, outcome: "APPROVE" });
  });

  it("CARD_MINTED append fails after the mint: the card is voided at once and the run is ERROR", async () => {
    const store = new FlakyStore();
    const r = await sealedRig({ store });
    store.failKind = "CARD_MINTED";
    const result = await submitTee(r);
    expect(result).toMatchObject({ ok: false, code: "LOG_APPEND_FAILED", decision: { outcome: "APPROVE" } });
    expect(result.ok === false && result.message).toMatch(/voided at once/);
    expect((r.rail as FakeRail).cards.map((c) => c.state)).toEqual(["VOIDED"]);
    expect(await r.kinds()).toEqual(["MANDATE_SEALED", "DECISION"]);
    // Changed (lane s-fix-core, audit H4): the logged APPROVE holds its limit until a card is logged for it. The log
    // cannot tell a failed mint from a pending one (and a failed void would leave a live card), so the hold stays:
    // the packet under-spends, it never over-commits. Before: committed 0, remaining 80000.
    expect((await r.orchestrator.snapshot()).packet).toMatchObject({ committed_minor: 25900, remaining_minor: 54100, active_cards: [] });
  });

  it("MintError: the Decision stays in the log, no card exists, the code is reported", async () => {
    const r = await sealedRig({ rail: new FakeRail({ maxActive: 0 }) });
    const result = await submitTee(r);
    expect(result).toMatchObject({ ok: false, code: "MINT_REFUSED", mintError: "MAX_ACTIVE", decision: { outcome: "APPROVE" } });
    expect(await r.kinds()).toEqual(["MANDATE_SEALED", "DECISION"]);
  });

  it("a rail that throws anything else is MINT_FAILED; a card with the wrong limit is voided (I2)", async () => {
    const broken: RailPort = { ...new FakeRail(), mint: () => Promise.reject(new Error("rail down")), authorise: () => Promise.reject(new Error("x")), void: () => Promise.reject(new Error("x")), expireDue: async () => [] };
    const r1 = await sealedRig({ rail: broken });
    expect(await submitTee(r1)).toMatchObject({ ok: false, code: "MINT_FAILED" });
    const inner = new FakeRail();
    const lying: RailPort = {
      mint: async (req: MintRequest): Promise<CardRecord> => ({ ...(await inner.mint(req)), limit_minor: 1 }),
      authorise: (req) => inner.authorise(req),
      void: (id, at) => inner.void(id, at),
      expireDue: (at) => inner.expireDue(at),
    };
    const r2 = await sealedRig({ rail: lying });
    const result = await submitTee(r2);
    expect(result).toMatchObject({ ok: false, code: "MINT_FAILED" });
    expect(inner.cards.map((c) => c.state)).toEqual(["VOIDED"]);
    expect(await r2.kinds()).toEqual(["MANDATE_SEALED", "DECISION"]);
    expect(new MintError("MAX_ACTIVE").code).toBe("MAX_ACTIVE");
  });

  it("an unreadable log is LOG_UNAVAILABLE with nothing decided", async () => {
    const store = new FlakyStore();
    const r = await sealedRig({ store });
    store.failReads = true;
    expect(await submitTee(r)).toMatchObject({ ok: false, code: "LOG_UNAVAILABLE" });
    store.failReads = false;
    expect(await r.kinds()).toEqual(["MANDATE_SEALED"]);
  });
});

describe("engine failure", () => {
  it("an engine that throws is ENGINE_FAILED: nothing appended, nothing minted", async () => {
    const real = createEngine();
    const engine: Engine = {
      decide: () => {
        throw new Error("engine bug");
      },
      decideCheckout: (input) => real.decideCheckout(input),
    };
    const r = await sealedRig({ engine });
    expect(await submitTee(r)).toMatchObject({ ok: false, code: "ENGINE_FAILED" });
    expect(await r.kinds()).toEqual(["MANDATE_SEALED"]);
    expect((r.rail as FakeRail).cards).toEqual([]);
  });
});
