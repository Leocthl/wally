// Checkout of one minted card (inside the packet queue). Before the card is presented, the engine rules on the
// approval at checkout (R1, R2, R12 via decideCheckout on a fresh fold and a fresh quote): a revoked or expired
// packet, a failed proof or a moved price is a logged DENY, the card is voided and nothing is presented (audit
// S-RAIL-1). Otherwise the executor charges; callable repeatedly on one card: the rail decides (overshoot
// OVER_LIMIT keeps the card ACTIVE, an exact charge is AUTHORISED, a replay is CARD_USED).
import type { CardRecord, Decision, LogEntry } from "../generated";
import type { CheckoutDrift } from "../executor/types";
import type { MerchantQuote } from "../ports";
import { StepError, append, describe, emitPacket, flushLog, now, readLogState, type Ctx, type LogState } from "./context";
import type { Run } from "./events";
import { decisions, findDecision, findMinted } from "./log-view";
import type { CheckoutDeniedResult, CheckoutDriftResult, CheckoutResult } from "./types";

export interface CardCheckout {
  readonly cardId: string;
  readonly idempotencyKey?: string;
}

function cardAndApproval(entries: readonly LogEntry[], cardId: string): { card: CardRecord; approved: Decision } {
  const card = findMinted(entries, cardId);
  if (card === undefined) throw new StepError("UNKNOWN_CARD", "no CARD_MINTED for this card id in the log");
  const approved = findDecision(entries, card.decision_id);
  if (approved?.outcome !== "APPROVE") throw new StepError("UNKNOWN_CARD", "the card has no APPROVE decision in the log (I1)");
  return { card, approved };
}

async function quoteFor(ctx: Ctx, approved: Decision): Promise<MerchantQuote> {
  try {
    return await ctx.deps.merchant.quote({ cart: approved.cart, now: now(ctx) });
  } catch (err) {
    throw new StepError("CHECKOUT_FAILED", `the merchant quote failed: ${describe(err)}`, { executorReason: "QUOTE_FAILED" });
  }
}

function decideAtCheckout(ctx: Ctx, state: LogState, approved: Decision, quote: MerchantQuote): Decision | null {
  try {
    return ctx.deps.engine.decideCheckout({ mandate: state.mandate, packet: state.packet, approved, quote, now: now(ctx), ctx: { mandateProofValid: state.proofValid } });
  } catch (err) {
    throw new StepError("ENGINE_FAILED", `engine.decideCheckout failed: ${describe(err)}`);
  }
}

/** Logs the checkout DENY (I7) before voiding the card; R12 reports as DRIFT, anything else as DENIED. */
async function refuse(ctx: Ctx, run: Run, logId: string, state: LogState, card: CardRecord, denial: Decision, quote: MerchantQuote): Promise<CheckoutDriftResult | CheckoutDeniedResult> {
  if (findDecision(state.entries, denial.id) !== undefined) throw new StepError("DUPLICATE_DECISION", `decision ${denial.id} is already in the log`);
  await append(ctx, logId, "DECISION", denial);
  ctx.report.emit({ type: "decision", runId: run.runId, decision: denial });
  await flushLog(ctx, logId);
  const voided = await ctx.executor.voidCard({ logId, cardId: card.id });
  if (voided.status === "VOIDED") ctx.report.emit({ type: "card.event", runId: run.runId, event: voided.event, cause: "void" });
  const template = denial.explanation?.template_id ?? "DENY";
  ctx.report.stage(run, "rail", voided.status === "VOIDED" ? "done" : "error", { note: `${template}: ${voided.status === "VOIDED" ? "card voided" : `void failed (${voided.reason})`}` });
  await flushLog(ctx, logId);
  await emitPacket(ctx, logId);
  const base = { ok: true as const, runId: run.runId, cardId: card.id, decision: denial, voided: voided.status === "VOIDED" };
  if (template !== "R12.price_drift") return { ...base, status: "DENIED" };
  return { ...base, status: "DRIFT", approvedTotalMinor: denial.cart.total_minor, quotedTotalMinor: quote.total_minor };
}

function priorDenial(state: LogState, approved: Decision, card: CardRecord, run: Run): CheckoutDeniedResult | null {
  const prior = decisions(state.entries).find((d) => d.resolves === approved.id);
  return prior === undefined ? null : { ok: true, runId: run.runId, status: "DENIED", cardId: card.id, decision: prior, voided: false };
}

async function onExecutorDrift(ctx: Ctx, run: Run, logId: string, approved: Decision, card: CardRecord, drift: CheckoutDrift): Promise<CheckoutResult> {
  const state = await readLogState(ctx, logId, now(ctx));
  const denial = decideAtCheckout(ctx, state, approved, drift.quote);
  if (denial === null) throw new StepError("ENGINE_FAILED", "the executor reported a price drift but the engine let the approval stand; nothing was charged");
  return refuse(ctx, run, logId, state, card, denial, drift.quote);
}

/** Inside the packet queue. Throws StepError for a failure; typed outcomes otherwise. */
export async function checkoutCard(ctx: Ctx, run: Run, logId: string, request: CardCheckout): Promise<CheckoutResult> {
  const state = await readLogState(ctx, logId, now(ctx));
  const { card, approved } = cardAndApproval(state.entries, request.cardId);
  const prior = priorDenial(state, approved, card, run); // the approval was already resolved: nothing to present
  if (prior !== null) return prior;
  const quote = await quoteFor(ctx, approved);
  const denial = decideAtCheckout(ctx, state, approved, quote);
  if (denial !== null) return refuse(ctx, run, logId, state, card, denial, quote);
  ctx.report.stage(run, "rail", "running", { note: "checkout" });
  const outcome = await ctx.executor.checkout({ logId, decision: approved, card, ...(request.idempotencyKey === undefined ? {} : { idempotencyKey: request.idempotencyKey }) });
  if (outcome.status === "DRIFT") return onExecutorDrift(ctx, run, logId, approved, card, outcome);
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
  return { ok: true, runId: run.runId, status: outcome.status, cardId: card.id, event: outcome.event, attempts: outcome.attempts, idempotencyKey: outcome.idempotency_key, anomalies: outcome.anomalies };
}
