// Escalation answers (A-23): the delegator's signed answer is verified here; the engine decides the resolution
// with the ESCALATE decision read from the log (resolution.escalated) and the signature result. A malformed answer,
// an unknown or already closed escalation is refused without a Decision; a bad signature is a logged DENY R11.
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

/** Throws StepError; the caller turns it into an OperationFailure. */
export async function answerSteps(ctx: Ctx, run: Run, signedAnswer: unknown, options: AnswerOptions): Promise<DecidedResult> {
  const sealed = sealedOrThrow(ctx);
  const check = verifyEscalationAnswer(signedAnswer, sealed.mandate.delegator);
  if (!check.valid && check.reason === "SCHEMA") throw new StepError("INVALID_ANSWER", `the answer fails its schema: ${check.detail}`);
  const answer = signedAnswer as EscalationAnswer; // schema-valid (checked above)
  return ctx.queue(PACKET_QUEUE_KEY, async () => {
    const escalated = openEscalation(await readEntries(ctx, sealed.logId), answer.decision_id);
    return decideAndRecord(ctx, {
      run,
      logId: sealed.logId,
      cart: escalated.cart,
      judge: Promise.resolve(escalated.judge), // a resolution copies the judge record of the decision it resolves
      resolution: { resolves: escalated.id, answer, escalated },
      answerSignatureValid: check.valid,
      checkout: options.checkout ?? "none",
    });
  });
}
