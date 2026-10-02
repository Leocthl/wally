// The decide step, always inside the packet queue: fold the packet from the log, wait for the judge (started
// before the queue, so it ran in parallel with the fold), engine.decide, append the DECISION before any side
// effect (I7), then mint for an APPROVE (I1, I2) and log CARD_MINTED. A failed CARD_MINTED append voids the card.
import type { CardRecord, Cart, Decision } from "../generated";
import type { EscalationResolution, JudgeRecord, MintErrorCode } from "../ports";
import { validateCardRecord } from "../schema";
import { purposeOf } from "./config";
import { StepError, append, describe, emitPacket, flushLog, now, readLogState, type Ctx } from "./context";
import type { Run } from "./events";
import { decisions, escalationViewOf, findDecision, toCardView } from "./log-view";
import { checkoutCard } from "./checkout";
import type { CardView, CheckoutMode, CheckoutResult, DecidedResult, EscalationView } from "./types";

export interface DecideStep {
  readonly run: Run;
  readonly logId: string;
  readonly cart: Cart;
  /** Started before the queue; awaited after the fold. Never rejects (assessWithDeadline). */
  readonly judge: Promise<JudgeRecord>;
  readonly resolution?: EscalationResolution;
  /** verifyEscalationAnswer result, for a resolution that carries an answer. */
  readonly answerSignatureValid?: boolean;
  readonly checkout: CheckoutMode;
}

function decideNow(ctx: Ctx, step: DecideStep, state: Awaited<ReturnType<typeof readLogState>>, judge: JudgeRecord): Decision {
  const flags = {
    mandateProofValid: state.proofValid,
    ...(step.answerSignatureValid === undefined ? {} : { answerSignatureValid: step.answerSignatureValid }),
  };
  try {
    return ctx.deps.engine.decide(state.mandate, state.packet, step.cart, judge, now(ctx), step.resolution, flags);
  } catch (err) {
    throw new StepError("ENGINE_FAILED", `engine.decide failed: ${describe(err)}`);
  }
}

function escalationAfter(step: DecideStep, decision: Decision): EscalationView | null {
  if (decision.outcome === "ESCALATE" && step.resolution === undefined) return escalationViewOf(decision, "OPEN");
  const escalated = step.resolution?.escalated;
  const state = decision.escalation?.state;
  if (escalated === undefined || state === undefined || state === "OPEN") return null;
  return escalationViewOf(escalated, state);
}

/** Decide, record and act. Throws StepError; a Decision already logged rides along in the error. */
export async function decideAndRecord(ctx: Ctx, step: DecideStep): Promise<DecidedResult> {
  const { run, logId } = step;
  const state = await readLogState(ctx, logId, now(ctx));
  const judge = await step.judge;
  ctx.report.stage(run, "engine", "running");
  const decision = decideNow(ctx, step, state, judge);
  if (findDecision(state.entries, decision.id) !== undefined) throw new StepError("DUPLICATE_DECISION", `decision ${decision.id} is already in the log`);
  await append(ctx, logId, "DECISION", decision); // I7: logged before any side effect
  ctx.report.stage(run, "engine", "done", { note: decision.outcome });
  ctx.report.emit({ type: "decision", runId: run.runId, decision });
  await flushLog(ctx, logId);
  const card = decision.outcome === "APPROVE" ? await mintFor(ctx, run, logId, decision) : null;
  if (card === null) ctx.report.stage(run, "rail", "skipped", { note: decision.outcome });
  const escalation = escalationAfter(step, decision);
  if (escalation !== null) ctx.report.emit({ type: "escalation", escalation });
  await emitPacket(ctx, logId);
  const checkout: CheckoutResult | null = card !== null && step.checkout === "auto" ? await checkoutCard(ctx, run, logId, { cardId: card.id }) : null;
  return { ok: true, runId: run.runId, outcome: decision.outcome, decision, card, escalation, checkout };
}

const MINT_CODES: readonly MintErrorCode[] = ["NOT_APPROVED", "ALREADY_MINTED", "OVER_CEILING", "MAX_ACTIVE", "TTL_TOO_LONG"];

/** The rail's MintError code, recognised by shape so a copy of the class from another module instance counts. */
function mintErrorCode(err: unknown): MintErrorCode | null {
  if (!(err instanceof Error) || err.name !== "MintError") return null;
  const code = (err as { code?: unknown }).code;
  return MINT_CODES.find((c) => c === code) ?? null;
}

function mintedProblem(card: CardRecord, decision: Decision): string | null {
  const checked = validateCardRecord(card);
  if (!checked.ok) return "the rail returned a card that fails card-record.schema.json";
  if (card.decision_id !== decision.id || card.mandate_id !== decision.mandate_id) return "the rail returned a card for another decision (I1)";
  if (card.limit_minor !== decision.approved_limit_minor) return "the rail returned a card whose limit is not the approved total (I2)";
  return null;
}

/** rail.void for a card that must not live; the outcome is reported, never hidden. */
async function voidAtOnce(ctx: Ctx, cardId: string): Promise<string> {
  try {
    await ctx.deps.rail.void(cardId, now(ctx));
    return "the card was voided at once";
  } catch (err) {
    return `the card could not be voided (${describe(err)}); it expires at its TTL`;
  }
}

/** Why this decision must not be minted now, from a clean APPROVE check and a fresh fold of the log; or null. */
async function mintBlocker(ctx: Ctx, logId: string, decision: Decision): Promise<string | null> {
  if (decision.outcome !== "APPROVE") return "the decision is not an APPROVE (I1)";
  if (decision.rules.some((r) => r.result === "FAIL")) return "the APPROVE carries a FAIL rule";
  if (decision.approved_limit_minor !== decision.cart.total_minor) return "the approved limit is not the cart total (I2)";
  const state = await readLogState(ctx, logId, now(ctx)); // re-fold: another writer may have logged since the decide
  if (state.packet.status !== "ACTIVE") return `the packet is ${state.packet.status} now (I6)`;
  if (findDecision(state.entries, decision.id) === undefined) return "the approval is not in the log (I7)";
  if (decisions(state.entries).some((d) => d.resolves === decision.id)) return "the approval was resolved by a later decision";
  if (state.entries.some((e) => e.kind === "CARD_MINTED" && e.payload.decision_id === decision.id)) return "a card was already minted for this approval";
  return null;
}

async function mintFor(ctx: Ctx, run: Run, logId: string, decision: Decision): Promise<CardView> {
  const blocker = await mintBlocker(ctx, logId, decision);
  if (blocker !== null) {
    ctx.report.stage(run, "rail", "skipped", { note: "mint aborted" });
    throw new StepError("MINT_ABORTED", `no mint: ${blocker}`, { decision });
  }
  ctx.report.stage(run, "rail", "running");
  let card: CardRecord;
  try {
    card = await ctx.deps.rail.mint({
      decision,
      ttlMs: ctx.config.cardTtlMs, // [F30]
      now: now(ctx),
      merchantLock: decision.cart.merchant.domain,
      purpose: purposeOf(decision.cart.id),
    });
  } catch (err) {
    const code = mintErrorCode(err);
    ctx.report.stage(run, "rail", "error", { note: code ?? "mint failed" });
    if (code !== null) throw new StepError("MINT_REFUSED", `SIMULATED rail refused the mint: ${code}`, { decision, mintError: code });
    throw new StepError("MINT_FAILED", `SIMULATED rail mint failed: ${describe(err)}`, { decision });
  }
  const problem = mintedProblem(card, decision);
  if (problem !== null) throw new StepError("MINT_FAILED", `${problem}; ${await voidAtOnce(ctx, card.id)}`, { decision });
  try {
    await append(ctx, logId, "CARD_MINTED", card);
  } catch (err) {
    ctx.report.stage(run, "rail", "error", { note: "CARD_MINTED not logged" });
    throw new StepError("LOG_APPEND_FAILED", `${describe(err)}; ${await voidAtOnce(ctx, card.id)}`, { decision });
  }
  ctx.report.stage(run, "rail", "done", { note: "minted" });
  const view = toCardView(card);
  ctx.report.emit({ type: "card.minted", runId: run.runId, card: view });
  await flushLog(ctx, logId);
  return view;
}
