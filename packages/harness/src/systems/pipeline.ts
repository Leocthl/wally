// Pipeline shared by B0, B1 and B2: decide each submission, log the decision (I7), mint what was approved, check out,
// optionally replay the charge, handle a revoke. A Gate decides; a Policy says which orchestrator behaviours and which
// world the baseline has. Core's orchestrator (TASKS A-26) replaces the body of this file; the Gate and Policy split stays.
import type { CardRecord, Decision } from "@laisee/core/generated";
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

/** Logs a decision (I7), then mints it when it was approved. A decision that cannot be logged is not acted on. */
async function recordAndMint(d: GateDecision, scenario: Scenario, world: World, before: Work): Promise<Work> {
  if (d.entry !== null) {
    const failure = await world.recordDecision(d.entry);
    if (failure !== null) return withError(before, failure);
  }
  if (d.forRail === null) return before;
  try {
    const card = await world.mint(d.forRail, scenario.cart.merchant.domain, d.forRail.cart.id);
    const held = [...before.held, { card, decision: d.forRail }];
    const failure = await world.recordMint(card);
    return failure === null ? { ...before, held } : withError({ ...before, held }, failure);
  } catch (err) {
    return err instanceof MintError ? { ...before, mintBlocked: err.code } : withError(before, `mint failed: ${message(err)}`);
  }
}

interface Submitted {
  readonly decisions: readonly GateDecision[];
  readonly work: Work;
  readonly error: string | null;
}

/** One submission after another: decide, log, mint, so the next decision is made against the budget this one committed. */
async function submitAll(scenario: Scenario, gate: Gate, world: World): Promise<Submitted> {
  const decisions: GateDecision[] = [];
  let work = empty;
  for (let k = 0; k < scenario.events.submissions; k += 1) {
    let d: GateDecision;
    try {
      d = await gate.decide(scenario, world, k);
    } catch (err) {
      return { decisions, work, error: `decision failed: ${message(err)}` };
    }
    decisions.push(d);
    work = await recordAndMint(d, scenario, world, work);
    if (work.error !== null) break;
  }
  return { decisions, work, error: null };
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
    escalations: [],
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
  const submitted = await submitAll(scenario, gate, world);
  const { decisions } = submitted;
  if (submitted.error !== null) return summarise({ scenario, policy, decisions, work: submitted.work, latencyMs: null, error: submitted.error, log: await auditOf(world, deps) });
  let work = submitted.work;
  // Latency measures real calls: an outage injected by the judge_down category called nothing, so it is not a sample.
  const latencyMs = deps.measureLatency && scenario.events.judgeFault === "none" ? deps.timer() - t0 : null;
  if (scenario.events.revoke === "after_mint" && policy.voidOnRevoke) work = await voidAll(work, world);
  world.setTime(at);
  work = await payAll(work, scenario, gate, world, at);
  work = await replay(work, scenario, gate, world, at);
  if (scenario.events.revoke === "after_use" && policy.voidOnRevoke) work = await voidAll(work, world);
  return summarise({ scenario, policy, decisions, work, latencyMs, error: null, log: await auditOf(world, deps) });
}
