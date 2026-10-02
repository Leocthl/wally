// tick (A-23, A-25): the timers. For each open escalation past its window, engine.decide with no answer (DENY
// R11.expired resolving it); PACKET_EXPIRED once when validUntil has passed; due cards expired through the
// executor (CARD_EVENT EXPIRED). Idle ticks emit nothing. Each step fails on its own; the others still run.
import { hasPacketExpired } from "./log-view";
import { StepError, append, describe, emitPacket, flushLog, now, readLogState, type Ctx, type LogState, type Sealed } from "./context";
import type { Run } from "./events";
import { cardViews, findDecision } from "./log-view";
import { decideAndRecord } from "./record";
import type { OrchestratorErrorCode, TickProblem, TickResult } from "./types";

interface Due {
  readonly escalations: readonly string[];
  readonly packet: boolean;
  readonly cards: boolean;
}

function dueAt(state: LogState, atMs: number): Due {
  return {
    escalations: state.packet.open_escalations.filter((e) => Date.parse(e.expires_at) <= atMs).map((e) => e.decision_id),
    packet: atMs >= Date.parse(state.credential.validUntil) && !hasPacketExpired(state.entries),
    cards: cardViews(state.entries).some((c) => c.state === "ACTIVE" && Date.parse(c.expires_at) <= atMs),
  };
}

const problemOf = (err: unknown): TickProblem =>
  err instanceof StepError ? { code: err.code, message: err.message } : { code: "INTERNAL" as OrchestratorErrorCode, message: describe(err) };

async function expireEscalation(ctx: Ctx, run: Run, sealed: Sealed, state: LogState, decisionId: string): Promise<void> {
  const escalated = findDecision(state.entries, decisionId);
  if (escalated === undefined) throw new StepError("UNKNOWN_ESCALATION", `open escalation ${decisionId} has no decision in the log`);
  await decideAndRecord(ctx, {
    run,
    logId: sealed.logId,
    cart: escalated.cart,
    judge: Promise.resolve(escalated.judge),
    resolution: { resolves: escalated.id, escalated },
    checkout: "none",
  });
}

async function expireCards(ctx: Ctx, run: Run, logId: string): Promise<readonly string[]> {
  const outcome = await ctx.executor.expireDue({ logId });
  if (outcome.status === "ERROR") throw new StepError("LOG_APPEND_FAILED", `card expiry: ${outcome.reason}: ${outcome.message}`);
  for (const event of outcome.events) ctx.report.emit({ type: "card.event", runId: run.runId, event, cause: "expire" });
  return outcome.events.map((e) => e.card_id);
}

async function runDue(ctx: Ctx, run: Run, sealed: Sealed, state: LogState, due: Due): Promise<TickResult> {
  let problems: readonly TickProblem[] = [];
  let expiredEscalations: readonly string[] = [];
  for (const id of due.escalations) {
    try {
      await expireEscalation(ctx, run, sealed, state, id);
      expiredEscalations = [...expiredEscalations, id];
    } catch (err) {
      problems = [...problems, problemOf(err)];
    }
  }
  let packetExpired = false;
  if (due.packet) {
    try {
      await append(ctx, sealed.logId, "PACKET_EXPIRED", { mandate_id: sealed.mandate.id, expired_at: state.credential.validUntil });
      packetExpired = true;
    } catch (err) {
      problems = [...problems, problemOf(err)];
    }
  }
  let expiredCardIds: readonly string[] = [];
  if (due.cards) {
    try {
      expiredCardIds = await expireCards(ctx, run, sealed.logId);
    } catch (err) {
      problems = [...problems, problemOf(err)];
    }
  }
  return { ok: problems.length === 0, runId: run.runId, expiredEscalations, expiredCardIds, packetExpired, problems };
}

const IDLE: TickResult = Object.freeze({ ok: true, runId: null, expiredEscalations: [], expiredCardIds: [], packetExpired: false, problems: [] });

/** Inside the packet queue. */
export async function tickInQueue(ctx: Ctx, sealed: Sealed): Promise<TickResult> {
  const at = now(ctx);
  let state: LogState;
  try {
    state = await readLogState(ctx, sealed.logId, at);
  } catch (err) {
    return { ...IDLE, ok: false, problems: [problemOf(err)] };
  }
  const due = dueAt(state, at.getTime());
  if (due.escalations.length === 0 && !due.packet && !due.cards) return IDLE;
  const run = ctx.report.start("tick");
  const result = await runDue(ctx, run, sealed, state, due);
  await flushLog(ctx, sealed.logId);
  await emitPacket(ctx, sealed.logId);
  ctx.report.finish(run, result.ok ? "INFO" : "ERROR", result.ok ? "TICK" : "TICK_PROBLEMS");
  return result;
}

export const idleTick = (): TickResult => IDLE;
