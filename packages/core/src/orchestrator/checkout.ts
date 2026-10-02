// Checkout of one minted card through the executor (inside the packet queue). Callable repeatedly on one card:
// the rail decides (overshoot OVER_LIMIT keeps the card ACTIVE, an exact charge is AUTHORISED, a replay is
// CARD_USED). A drifted re-quote goes to engine.decideCheckout (R12): its DENY is logged, then the card is voided.
import type { CardRecord, Decision } from "../generated";
import type { CheckoutDrift } from "../executor/types";
import { StepError, describe, emitPacket, flushLog, now, readEntries, readLogState, append, type Ctx } from "./context";
import type { Run } from "./events";
import { findDecision, findMinted } from "./log-view";
import type { CheckoutDriftResult, CheckoutResult } from "./types";

export interface CardCheckout {
  readonly cardId: string;
  readonly idempotencyKey?: string;
}

async function cardAndApproval(ctx: Ctx, logId: string, cardId: string): Promise<{ card: CardRecord; approved: Decision }> {
  const entries = await readEntries(ctx, logId);
  const card = findMinted(entries, cardId);
  if (card === undefined) throw new StepError("UNKNOWN_CARD", "no CARD_MINTED for this card id in the log");
  const approved = findDecision(entries, card.decision_id);
  if (approved?.outcome !== "APPROVE") throw new StepError("UNKNOWN_CARD", "the card has no APPROVE decision in the log (I1)");
  return { card, approved };
}

function denyAtCheckout(ctx: Ctx, state: Awaited<ReturnType<typeof readLogState>>, approved: Decision, drift: CheckoutDrift): Decision {
  let denial: Decision | null;
  try {
    denial = ctx.deps.engine.decideCheckout({ mandate: state.mandate, packet: state.packet, approved, quote: drift.quote, now: now(ctx), ctx: { mandateProofValid: state.proofValid } });
  } catch (err) {
    throw new StepError("ENGINE_FAILED", `engine.decideCheckout failed: ${describe(err)}`);
  }
  if (denial === null) throw new StepError("ENGINE_FAILED", "the executor reported a price drift but the engine let the approval stand; nothing was charged");
  if (findDecision(state.entries, denial.id) !== undefined) throw new StepError("DUPLICATE_DECISION", `decision ${denial.id} is already in the log`);
  return denial;
}

async function onDrift(ctx: Ctx, run: Run, logId: string, approved: Decision, card: CardRecord, drift: CheckoutDrift): Promise<CheckoutDriftResult> {
  const state = await readLogState(ctx, logId, now(ctx));
  const denial = denyAtCheckout(ctx, state, approved, drift);
  await append(ctx, logId, "DECISION", denial); // I7: the R12 DENY is logged before the void
  ctx.report.emit({ type: "decision", runId: run.runId, decision: denial });
  await flushLog(ctx, logId);
  const voided = await ctx.executor.voidCard({ logId, cardId: card.id });
  if (voided.status === "VOIDED") ctx.report.emit({ type: "card.event", runId: run.runId, event: voided.event, cause: "void" });
  ctx.report.stage(run, "rail", voided.status === "VOIDED" ? "done" : "error", { note: voided.status === "VOIDED" ? "R12: card voided" : `void failed: ${voided.reason}` });
  await flushLog(ctx, logId);
  await emitPacket(ctx, logId);
  return {
    ok: true,
    runId: run.runId,
    status: "DRIFT",
    cardId: card.id,
    decision: denial,
    voided: voided.status === "VOIDED",
    approvedTotalMinor: drift.approved_total_minor,
    quotedTotalMinor: drift.quoted_total_minor,
  };
}

/** Inside the packet queue. Throws StepError for a failure; typed outcomes otherwise. */
export async function checkoutCard(ctx: Ctx, run: Run, logId: string, request: CardCheckout): Promise<CheckoutResult> {
  const { card, approved } = await cardAndApproval(ctx, logId, request.cardId);
  ctx.report.stage(run, "rail", "running", { note: "checkout" });
  const outcome = await ctx.executor.checkout({
    logId,
    decision: approved,
    card,
    ...(request.idempotencyKey === undefined ? {} : { idempotencyKey: request.idempotencyKey }),
  });
  if (outcome.status === "DRIFT") return onDrift(ctx, run, logId, approved, card, outcome);
  if (outcome.status === "TIMEOUT") {
    ctx.report.stage(run, "rail", "error", { note: "merchant timed out; re-run with the same key" });
    return { ok: true, runId: run.runId, status: "TIMEOUT", cardId: card.id, attempts: outcome.attempts, idempotencyKey: outcome.idempotency_key };
  }
  if (outcome.status === "ERROR") {
    ctx.report.stage(run, "rail", "error", { note: outcome.reason });
    throw new StepError("CHECKOUT_FAILED", outcome.message, { executorReason: outcome.reason });
  }
  ctx.report.emit({ type: "card.event", runId: run.runId, event: outcome.event, cause: "checkout", attempts: outcome.attempts });
  ctx.report.stage(run, "rail", "done", { note: outcome.event.decline_code ?? outcome.status });
  await flushLog(ctx, logId);
  await emitPacket(ctx, logId);
  return {
    ok: true,
    runId: run.runId,
    status: outcome.status,
    cardId: card.id,
    event: outcome.event,
    attempts: outcome.attempts,
    idempotencyKey: outcome.idempotency_key,
    anomalies: outcome.anomalies,
  };
}
