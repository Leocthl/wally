// Pipeline shared by B0, B1 and B2: decide each submission, log the decision (I7), mint what was approved, check out,
// optionally replay the charge, handle a revoke. A Gate decides; a Policy says which orchestrator behaviours and which
// world the baseline has. Core's orchestrator (TASKS A-26) replaces the body of this file; the Gate and Policy split stays.
import type { CardRecord, Decision } from "@laisee/core/generated";
import { cartFingerprint } from "@laisee/core/engine";
import { MintError, type CardEvent, type MerchantQuote } from "@laisee/core/ports";
import type { Baseline, Scenario } from "../types";
import type { Timer } from "../timer";
import { NO_LIMIT_MINOR } from "../worlds/unlimited-rail";
import { summariseEvent } from "./summary";
import type { Components, DecisionSummary, EventSummary, JudgeSummary, LogAudit, MintSummary, RunOutcome, World } from "./types";

export interface GateDecision {
  readonly facts: Pick<DecisionSummary, "outcome" | "rule" | "templateId"> & { readonly decisionId: string };
  /** The Decision to write to the log (I7); null for a baseline that keeps no log. */
  readonly entry: Decision | null;
  /** The Decision that licenses the mint: the APPROVE the baseline reached; null otherwise. */
  readonly forRail: Decision | null;
  readonly judge: JudgeSummary | null;
}

export interface Gate {
  decide(scenario: Scenario, world: World, submission: number): Promise<GateDecision>;
  /** R12 at checkout: a DENY that voids the approval, or null when it stands. Absent: the baseline never re-checks the price. */
  decideCheckout?(scenario: Scenario, world: World, approved: Decision, quote: MerchantQuote, at: Date): Decision | null;
}

/** Which orchestrator behaviours the baseline has, and which world it pays in. B0 is a bare model gate and has none. */
export interface Policy {
  readonly id: Baseline;
  readonly world: "governed" | "ungoverned";
  /** A repeated cart returns the earlier Decision (cart fingerprint, 02 §6). */
  readonly dedup: boolean;
  /** A revoke voids ACTIVE cards. */
  readonly voidOnRevoke: boolean;
}

export interface PipelineDeps {
  readonly components: Components;
  readonly timer: Timer;
  readonly measureLatency: boolean;
  readonly audit?: boolean | undefined;
}

// SIMULATED scenario-clock step between the mint and the checkout. A harness constant, not a product threshold.
const CHECKOUT_DELAY_MS = 60_000;

interface Held {
  readonly card: CardRecord;
  readonly decision: Decision;
}

interface Work {
  readonly held: readonly Held[];
  readonly events: readonly EventSummary[];
  readonly mintBlocked: string | null;
  readonly r12Void: boolean;
  readonly error: string | null;
}

const empty: Work = { held: [], events: [], mintBlocked: null, r12Void: false, error: null };
const withEvent = (w: Work, e: CardEvent): Work => ({ ...w, events: [...w.events, summariseEvent(e)] });
const withError = (w: Work, message: string): Work => ({ ...w, error: w.error ?? message });
const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** Logs each distinct decision once (I7), then mints each approved one. A repeat mint returns the same card (T-I1). */
async function logAndMint(decisions: readonly GateDecision[], scenario: Scenario, world: World): Promise<Work> {
  let work = empty;
  const logged = new Set<string>();
  for (const d of decisions) {
    if (d.entry !== null && !logged.has(d.facts.decisionId)) {
      logged.add(d.facts.decisionId);
      const failure = await world.recordDecision(d.entry);
      if (failure !== null) return withError(work, failure); // not logged, so nothing may follow (I7)
    }
    if (d.forRail === null) continue;
    try {
      const card = await world.mint(d.forRail, scenario.cart.merchant.domain, scenario.cart.id);
      if (work.held.some((h) => h.card.id === card.id)) continue;
      const failure = await world.recordMint(card);
      if (failure !== null) return withError({ ...work, held: [...work.held, { card, decision: d.forRail }] }, failure);
      work = { ...work, held: [...work.held, { card, decision: d.forRail }] };
    } catch (err) {
      work = err instanceof MintError ? { ...work, mintBlocked: err.code } : withError(work, `mint failed: ${message(err)}`);
    }
  }
  return work;
}

async function voidAll(work: Work, world: World): Promise<Work> {
  let next = work;
  for (const { card } of work.held) {
    const event = await world.voidCard(card);
    if (event !== null) next = withEvent(next, event);
  }
  return next;
}

/** R12: the engine rules on a moved price; a DENY voids the card. */
async function onDrift(work: Work, held: Held, quote: MerchantQuote, scenario: Scenario, gate: Gate, world: World, at: Date): Promise<Work> {
  const verdict = gate.decideCheckout?.(scenario, world, held.decision, quote, at) ?? null;
  if (verdict === null) return withError(work, "the executor saw a moved price but R12 let the approval stand");
  const failure = await world.recordDecision(verdict);
  const voided = await world.voidCard(held.card);
  const next = { ...work, r12Void: true };
  const flagged = failure === null ? next : withError(next, failure);
  return voided === null ? flagged : withEvent(flagged, voided);
}

async function pay(work: Work, held: Held, scenario: Scenario, gate: Gate, world: World, at: Date): Promise<Work> {
  const report = await world.checkout(held.decision, held.card);
  switch (report.status) {
    case "SETTLED":
      return withEvent(work, report.event);
    case "DRIFT":
      return onDrift(work, held, report.quote, scenario, gate, world, at);
    case "FAILED":
      return withError(work, report.error);
  }
}

async function payAll(work: Work, scenario: Scenario, gate: Gate, world: World, at: Date): Promise<Work> {
  let next = work;
  for (const held of work.held) next = await pay(next, held, scenario, gate, world, at);
  return next;
}

/** The scenario's replay: present the used token again. A second authorise on the same card must decline CARD_USED. */
async function replay(work: Work, scenario: Scenario, gate: Gate, world: World, at: Date): Promise<Work> {
  const first = work.held[0];
  if (!scenario.events.replayCharge || first === undefined || !work.events.some((e) => e.event === "AUTHORISED")) return work;
  return pay(work, first, scenario, gate, world, at);
}

async function decideAll(scenario: Scenario, gate: Gate, policy: Policy, world: World): Promise<{ decisions: GateDecision[]; error: string | null }> {
  const decisions: GateDecision[] = [];
  const seen = new Map<string, GateDecision>();
  for (let k = 0; k < scenario.events.submissions; k += 1) {
    const fp = cartFingerprint(scenario.cart);
    const prior = policy.dedup ? seen.get(fp) : undefined;
    try {
      const d = prior ?? (await gate.decide(scenario, world, k));
      if (policy.dedup) seen.set(fp, d);
      decisions.push(d);
    } catch (err) {
      return { decisions, error: `decision failed: ${message(err)}` };
    }
  }
  return { decisions, error: null };
}

/** Used when no submission produced a decision: nothing was approved, so the scenario counts as a stop (I5). */
const failClosed = (): GateDecision => ({ facts: { outcome: "DENY", rule: null, templateId: null, decisionId: "dec_failclosed" }, entry: null, forRail: null, judge: null });

interface Summary {
  readonly scenario: Scenario;
  readonly policy: Policy;
  readonly decisions: readonly GateDecision[];
  readonly work: Work;
  readonly latencyMs: number | null;
  readonly error: string | null;
  readonly log: LogAudit | null;
}

function summarise({ scenario, policy, decisions, work, latencyMs, error, log }: Summary): RunOutcome {
  const first = decisions[0] ?? failClosed();
  const distinct = [...new Set(decisions.map((d) => d.facts.decisionId))];
  const authorised = work.events.filter((e) => e.event === "AUTHORISED");
  const mints: MintSummary[] = work.held.map(({ card }) => ({ cardId: card.id, limitMinor: card.limit_minor === NO_LIMIT_MINOR ? null : card.limit_minor, merchantLock: card.merchant_lock ?? null }));
  return {
    scenarioId: scenario.id,
    baseline: policy.id,
    decision: { outcome: first.facts.outcome, rule: first.facts.rule, templateId: first.facts.templateId, decisionIds: distinct },
    judge: first.judge,
    mints,
    mintBlocked: work.mintBlocked,
    events: work.events,
    authorisedCount: authorised.length,
    authorisedMinor: authorised.reduce((acc, e) => acc + (e.amountMinor ?? 0), 0),
    r12Void: work.r12Void,
    completed: first.facts.outcome === "APPROVE" && authorised.length > 0,
    latencyMs,
    error: error ?? work.error,
    log,
  };
}

const auditOf = (world: World, deps: PipelineDeps): Promise<LogAudit | null> => (deps.audit === false ? Promise.resolve(null) : world.audit());

/** Runs one scenario through one baseline. Every failure becomes a value on the outcome and counts as a stop (I5). */
export async function runPipeline(scenario: Scenario, gate: Gate, policy: Policy, deps: PipelineDeps): Promise<RunOutcome> {
  const stopped = (error: string): RunOutcome => summarise({ scenario, policy, decisions: [], work: empty, latencyMs: null, error, log: null });
  let world: World;
  try {
    world = await deps.components[policy.world](scenario);
  } catch (err) {
    return stopped(`world setup failed: ${message(err)}`);
  }
  const t0 = deps.timer();
  const now = new Date(scenario.now);
  const at = new Date(now.getTime() + CHECKOUT_DELAY_MS);
  const { decisions, error } = await decideAll(scenario, gate, policy, world);
  if (error !== null) return summarise({ scenario, policy, decisions, work: empty, latencyMs: null, error, log: await auditOf(world, deps) });
  let work = await logAndMint(decisions, scenario, world);
  // Latency measures real calls: an outage injected by the judge_down category called nothing, so it is not a sample.
  const latencyMs = deps.measureLatency && scenario.events.judgeFault === "none" ? deps.timer() - t0 : null;
  if (scenario.events.revoke === "after_mint" && policy.voidOnRevoke) work = await voidAll(work, world);
  world.setTime(at);
  work = await payAll(work, scenario, gate, world, at);
  work = await replay(work, scenario, gate, world, at);
  if (scenario.events.revoke === "after_use" && policy.voidOnRevoke) work = await voidAll(work, world);
  return summarise({ scenario, policy, decisions, work, latencyMs, error: null, log: await auditOf(world, deps) });
}
