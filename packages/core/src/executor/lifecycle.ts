// Void and expiry: the rail changes a card's state, the executor turns the resulting CardEvent into a log entry.
// Packet accounting releases the limit only from a logged VOIDED or EXPIRED event, so the pair must stay together.
import type { CardEvent } from "../ports";
import { formatIssues, validateCardEvent } from "../schema";
import { appendCardEvent } from "./append";
import { describeError, errorOutcome, expireErrorOutcome } from "./outcome";
import type { ExecutorDeps, ExpireInput, ExpireOutcome, VoidInput, VoidOutcome } from "./types";

function lifecycleEventProblem(event: CardEvent, kind: "VOIDED" | "EXPIRED", cardId?: string): string | null {
  const check = validateCardEvent(event);
  if (!check.ok) return `event is not schema-valid: ${formatIssues(check.errors)}`;
  if (event.event !== kind) return `expected a ${kind} event, got ${event.event}`;
  if (cardId !== undefined && event.card_id !== cardId) return "event belongs to another card";
  return null;
}

export async function runVoid(deps: ExecutorDeps, input: VoidInput): Promise<VoidOutcome> {
  let event: CardEvent;
  try {
    event = await deps.rail.void(input.cardId, deps.clock.now());
  } catch (err) {
    return errorOutcome("RAIL_REJECTED", describeError(err));
  }
  const problem = lifecycleEventProblem(event, "VOIDED", input.cardId);
  if (problem !== null) return errorOutcome("EVENT_INVALID", problem);
  const appended = await appendCardEvent(deps, input.logId, event);
  if (!appended.ok) return errorOutcome("LOG_APPEND_FAILED", appended.message, { event });
  return { status: "VOIDED", simulated: true, event, log_seq: appended.seq };
}

export async function runExpireDue(deps: ExecutorDeps, input: ExpireInput): Promise<ExpireOutcome> {
  let events: readonly CardEvent[];
  try {
    events = await deps.rail.expireDue(deps.clock.now());
  } catch (err) {
    return expireErrorOutcome("RAIL_REJECTED", describeError(err), []);
  }
  const bad = events.map((e) => lifecycleEventProblem(e, "EXPIRED")).find((p) => p !== null);
  if (bad !== undefined && bad !== null) return expireErrorOutcome("EVENT_INVALID", bad, events);
  const seqs: number[] = [];
  for (const [i, event] of events.entries()) {
    const appended = await appendCardEvent(deps, input.logId, event);
    if (!appended.ok) return expireErrorOutcome("LOG_APPEND_FAILED", appended.message, events.slice(i));
    seqs.push(appended.seq);
  }
  return { status: "EXPIRED", simulated: true, events, log_seqs: seqs };
}
