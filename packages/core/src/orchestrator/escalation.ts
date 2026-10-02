// Escalation answers (A-23): the answer names an open ESCALATE decision in the log; it is then verified against the
// PINNED delegator and bound to that decision, its mandate and its cart (laisee.resolve.v2). A malformed, forged or
// mis-bound answer is refused without a Decision, so the escalation stays open for the real delegator. The engine
// then decides the resolution with the ESCALATE decision read from the log (resolution.escalated: its own cart,
// its judge record) and still checks the binding itself. An unknown or already resolved escalation is refused.
import type { EscalationAnswer, LogEntry } from "../generated";
import { verifyEscalationAnswer } from "../log/delegator";
import { PACKET_QUEUE_KEY, StepError, readEntries, sealedOrThrow, type Ctx } from "./context";
import type { Run } from "./events";
import { decisions, findDecision } from "./log-view";
import { decideAndRecord } from "./record";
import type { AnswerOptions, DecidedResult } from "./types";

function openEscalation(entries: readonly LogEntry[], decisionId: string) {
  const escalated = findDecision(entries, decisionId);
  if (escalated?.outcome !== "ESCALATE") throw new StepError("UNKNOWN_ESCALATION", "the answer names no ESCALATE decision in the log");
  if (decisions(entries).some((d) => d.resolves === escalated.id)) throw new StepError("ESCALATION_CLOSED", "the escalation was already resolved");
  return escalated;
}

const decisionIdOf = (answer: unknown): string | null => {
  const id = typeof answer === "object" && answer !== null ? (answer as { readonly decision_id?: unknown }).decision_id : undefined;
  return typeof id === "string" ? id : null;
};

/** Throws StepError; the caller turns it into an OperationFailure. */
export async function answerSteps(ctx: Ctx, run: Run, signedAnswer: unknown, options: AnswerOptions): Promise<DecidedResult> {
  const sealed = sealedOrThrow(ctx);
  const decisionId = decisionIdOf(signedAnswer);
  if (decisionId === null) throw new StepError("INVALID_ANSWER", "answer refused (SCHEMA): the answer names no decision");
  return ctx.queue(PACKET_QUEUE_KEY, async () => {
    const escalated = openEscalation(await readEntries(ctx, sealed.logId), decisionId);
    const binding = { decision_id: escalated.id, mandate_id: escalated.mandate_id, cart: escalated.cart };
    const check = verifyEscalationAnswer(signedAnswer, ctx.deps.delegatorDid, binding);
    if (!check.valid) throw new StepError("INVALID_ANSWER", `answer refused (${check.reason}): ${check.detail}`);
    const answer = structuredClone(signedAnswer) as EscalationAnswer; // schema-valid, signed by the pinned delegator, bound
    return decideAndRecord(ctx, {
      run,
      logId: sealed.logId,
      cart: escalated.cart,
      judge: Promise.resolve(escalated.judge), // a resolution copies the judge record of the decision it resolves
      resolution: { resolves: escalated.id, answer, escalated },
      answerSignatureValid: true, // verified above; the engine refuses any answer without it
      checkout: options.checkout ?? "none",
    });
  });
}
