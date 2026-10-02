// Interim pipeline shared by B0, B1 and B2: decide each submission, mint what was approved, check out, optionally replay,
// handle a revoke. A Gate decides; a Policy says which orchestrator behaviours the baseline has. Core's orchestrator
// (TASKS A-26) replaces the body of this file through the factory; the Gate and Policy split stays.
import type { CardRecord, Decision } from "@laisee/core/generated";
import { MintError, type CardEvent, type MerchantPort, type RailPort } from "@laisee/core/ports";
import { RAIL } from "../config";
import { sha256Hex, stableStringify } from "../canonical";
import type { Baseline, Scenario } from "../types";
import { summariseEvent } from "./summary";
import type { Components, DecisionSummary, EventSummary, JudgeSummary, MintSummary, RunOutcome } from "./types";
import type { Timer } from "../timer";

export interface GateDecision {
  readonly facts: Pick<DecisionSummary, "outcome" | "rule" | "templateId"> & { readonly decisionId: string };
  /** The Decision handed to the rail when the outcome is APPROVE; null otherwise. */
  readonly forRail: Decision | null;
  readonly judge: JudgeSummary | null;
}

export interface Gate {
  decide(scenario: Scenario, submission: number): Promise<GateDecision>;
}

/** Which orchestrator behaviours the baseline has. B0 is a bare model gate and has none of them. */
export interface Policy {
  readonly id: Baseline;
  /** A repeated cart returns the earlier Decision (cart fingerprint, 02 §6). */
  readonly dedup: boolean;
  /** The executor re-quotes before paying and voids on any difference (R12). */
  readonly requote: boolean;
  /** A revoke voids ACTIVE cards. */
  readonly voidOnRevoke: boolean;
}

export interface PipelineDeps {
  readonly components: Components;
  readonly timer: Timer;
  readonly measureLatency: boolean;
}

const CHECKOUT_DELAY_MS = 60_000;

/** SHA-256 of the cart without its id and proposal time: the same purchase proposed twice has the same fingerprint (02 §6). */
export function cartFingerprint(scenario: Scenario): string {
  const { id: _id, proposed_at: _at, ...rest } = scenario.cart;
  return sha256Hex(stableStringify(rest));
}

interface Work {
  readonly cards: readonly CardRecord[];
  readonly events: readonly EventSummary[];
  readonly mintBlocked: string | null;
  readonly r12Void: boolean;
  readonly error: string | null;
}

const empty: Work = { cards: [], events: [], mintBlocked: null, r12Void: false, error: null };
const withEvent = (w: Work, e: CardEvent): Work => ({ ...w, events: [...w.events, summariseEvent(e)] });
const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

async function mintAll(decisions: readonly GateDecision[], scenario: Scenario, rail: RailPort, now: Date): Promise<Work> {
  let work = empty;
  for (const d of decisions) {
    if (d.forRail === null) continue;
    try {
      // A repeat mint for the same decision returns the same card (rail idempotency, T-I1); count each card once.
      const card = await rail.mint({ decision: d.forRail, ttlMs: RAIL.cardTtlMs, now, merchantLock: scenario.cart.merchant.domain, purpose: scenario.cart.id });
      if (!work.cards.some((c) => c.id === card.id)) work = { ...work, cards: [...work.cards, card] };
    } catch (err) {
      work = err instanceof MintError ? { ...work, mintBlocked: err.code } : { ...work, error: `mint failed: ${message(err)}` };
    }
  }
  return work;
}

async function voidAll(work: Work, rail: RailPort, at: Date): Promise<Work> {
  let next = work;
  for (const card of work.cards) {
    try {
      next = withEvent(next, await rail.void(card.id, at));
    } catch {
      // a card that is no longer ACTIVE cannot be voided: a used card is final [F2.cancel]
    }
  }
  return next;
}

async function payAll(work: Work, scenario: Scenario, policy: Policy, deps: PipelineDeps, rail: RailPort, merchant: MerchantPort, at: Date): Promise<Work> {
  let next = work;
  for (const [i, card] of work.cards.entries()) {
    const report = await deps.components.executor.checkout({ cart: scenario.cart, card, merchant, rail, now: at, idempotencyKey: `idem-${scenario.cart.id}-${i}`, requote: policy.requote });
    if (report.drift) next = { ...next, r12Void: true };
    if (report.voided) next = withEvent(next, report.voided);
    if (report.event) next = withEvent(next, report.event);
    if (report.error !== null) next = { ...next, error: report.error };
  }
  return next;
}

async function replayCharge(work: Work, scenario: Scenario, merchant: MerchantPort, at: Date): Promise<Work> {
  const card = work.cards[0];
  if (!scenario.events.replayCharge || card === undefined || !work.events.some((e) => e.event === "AUTHORISED")) return work;
  try {
    return withEvent(work, await merchant.checkout({ cart: scenario.cart, handle: card.handle, idempotencyKey: `idem-${scenario.cart.id}-replay`, now: at }));
  } catch (err) {
    return { ...work, error: `replay attempt failed: ${message(err)}` };
  }
}

async function decideAll(scenario: Scenario, gate: Gate, policy: Policy): Promise<{ decisions: GateDecision[]; error: string | null }> {
  const decisions: GateDecision[] = [];
  const seen = new Map<string, GateDecision>();
  for (let k = 0; k < scenario.events.submissions; k += 1) {
    const fp = cartFingerprint(scenario);
    const prior = policy.dedup ? seen.get(fp) : undefined;
    try {
      const d = prior ?? (await gate.decide(scenario, k));
      if (policy.dedup) seen.set(fp, d);
      decisions.push(d);
    } catch (err) {
      return { decisions, error: `decision failed: ${message(err)}` };
    }
  }
  return { decisions, error: null };
}

/** Used when no submission produced a decision: nothing was approved, so the scenario counts as a stop (I5). */
const failClosed = (): GateDecision => ({ facts: { outcome: "DENY", rule: null, templateId: null, decisionId: "dec_failclosed" }, forRail: null, judge: null });

interface Summary {
  readonly scenario: Scenario;
  readonly policy: Policy;
  readonly decisions: readonly GateDecision[];
  readonly work: Work;
  readonly latencyMs: number | null;
  readonly error: string | null;
}

function summarise({ scenario, policy, decisions, work, latencyMs, error }: Summary): RunOutcome {
  const first = decisions[0] ?? failClosed();
  const distinct = [...new Set(decisions.map((d) => d.facts.decisionId))];
  const authorised = work.events.filter((e) => e.event === "AUTHORISED");
  const mints: MintSummary[] = work.cards.map((c) => ({ cardId: c.id, limitMinor: c.limit_minor, merchantLock: c.merchant_lock ?? null }));
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
  };
}

/** Runs one scenario through one baseline. Every failure becomes a value on the outcome and counts as a stop (I5). */
export async function runPipeline(scenario: Scenario, gate: Gate, policy: Policy, deps: PipelineDeps): Promise<RunOutcome> {
  const t0 = deps.timer();
  const rail = deps.components.createRail();
  const merchant = deps.components.createMerchant(rail, scenario.events.merchantMode, scenario.events.merchantDeltaMinor);
  const now = new Date(scenario.now);
  const at = new Date(now.getTime() + CHECKOUT_DELAY_MS);
  const { decisions, error } = await decideAll(scenario, gate, policy);
  if (error !== null) return summarise({ scenario, policy, decisions, work: empty, latencyMs: null, error });
  let work = await mintAll(decisions, scenario, rail, now);
  // Latency measures real calls: an outage injected by the judge_down category called nothing, so it is not a sample.
  const latencyMs = deps.measureLatency && scenario.events.judgeFault === "none" ? deps.timer() - t0 : null;
  if (scenario.events.revoke === "after_mint" && policy.voidOnRevoke) work = await voidAll(work, rail, now);
  work = await payAll(work, scenario, policy, deps, rail, merchant, at);
  work = await replayCharge(work, scenario, merchant, at);
  if (scenario.events.revoke === "after_use" && policy.voidOnRevoke) work = await voidAll(work, rail, at);
  return summarise({ scenario, policy, decisions, work, latencyMs, error: null });
}
