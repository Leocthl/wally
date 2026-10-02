// Escalation answers (A-23): the answer is verified against the PINNED delegator before anything else; a malformed
// or forged answer is refused without a Decision, so the escalation stays open for the real delegator. The engine
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

/** Throws StepError; the caller turns it into an OperationFailure. */
export async function answerSteps(ctx: Ctx, run: Run, signedAnswer: unknown, options: AnswerOptions): Promise<DecidedResult> {
  const sealed = sealedOrThrow(ctx);
  const check = verifyEscalationAnswer(signedAnswer, ctx.deps.delegatorDid);
  if (!check.valid) throw new StepError("INVALID_ANSWER", `answer refused (${check.reason}): ${check.detail}`);
  const answer = structuredClone(signedAnswer) as EscalationAnswer; // schema-valid and signed by the pinned delegator
  return ctx.queue(PACKET_QUEUE_KEY, async () => {
    const escalated = openEscalation(await readEntries(ctx, sealed.logId), answer.decision_id);
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
