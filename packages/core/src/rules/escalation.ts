// R11: an escalation must be answered inside its window [F31], by the delegator, for that decision.
// No valid answer => DENY R11.expired, which resolves the earlier ESCALATE (S5). Signature checks on
// the answer happen before decide (orchestrator); here the engine checks binding and timing only.
import { THRESHOLD_REFS, type EngineConfig } from "../config";
import type { Mandate, PacketState } from "../generated";
import type { EscalationAnswer, EscalationResolution } from "../ports";
import { MS_PER_S, failed, parseTime, passed, skipped, timeOf, type RuleResult } from "./result";

export interface R11Input {
  readonly mandate: Mandate;
  readonly packet: PacketState;
  readonly resolution: EscalationResolution | undefined;
  readonly now: Date;
  readonly config: EngineConfig;
}

export interface R11Outcome {
  readonly result: RuleResult;
  /** The delegator's answer when valid and in time, else null. */
  readonly answer: EscalationAnswer | null;
  /** expires_at of the open escalation being resolved, when it was found. */
  readonly expiresAt: string | null;
  /** now >= expires_at (or a time could not be read). */
  readonly windowPassed: boolean;
}

const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> => v !== null && typeof v === "object" && !Array.isArray(v);

function answerProblem(answer: unknown, resolves: string, delegator: string, expiresMs: number): string | null {
  if (!isRecord(answer)) return "malformed_answer";
  if (answer["decision_id"] !== resolves) return "decision_id_mismatch";
  if (answer["signer"] !== delegator) return "signer_mismatch";
  if (answer["choice"] !== "APPROVE" && answer["choice"] !== "DENY") return "invalid_choice";
  const answeredMs = parseTime(answer["answered_at"]);
  if (answeredMs === null) return "invalid_time";
  return answeredMs >= expiresMs ? "answered_late" : null;
}

const SKIPPED: R11Outcome = { result: skipped("R11"), answer: null, expiresAt: null, windowPassed: false };

/** R11: PASS for a valid in-time answer; otherwise DENY R11.expired with the reason in inputs. */
export function evaluateR11({ mandate, packet, resolution, now, config }: R11Input): R11Outcome {
  if (resolution === undefined) return SKIPPED;
  const { resolves, answer } = resolution;
  const nowMs = timeOf(now);
  const nowIso = nowMs === null ? null : new Date(nowMs).toISOString();
  const spec = { id: "R11" as const, comparator: "<" as const, thresholdRef: THRESHOLD_REFS.escalation_window };
  const deny = (inputs: Record<string, unknown>): RuleResult => failed({ ...spec, inputs }, "DENY", "R11.expired");
  const open = packet.open_escalations.find((e) => e.decision_id === resolves);
  if (open === undefined) {
    const result = deny({ resolves, answered: answer !== undefined, answer_problem: "not_open", now: nowIso });
    return { result, answer: null, expiresAt: null, windowPassed: true };
  }
  const expiresMs = parseTime(open.expires_at);
  const windowPassed = expiresMs === null || nowMs === null || nowMs >= expiresMs;
  const base = { resolves, expires_at: open.expires_at, now: nowIso, window_s: config.escalation.window_ms / MS_PER_S };
  const outcome = (result: RuleResult, accepted: EscalationAnswer | null): R11Outcome => ({ result, answer: accepted, expiresAt: open.expires_at, windowPassed });
  if (answer === undefined) {
    const inputs = windowPassed ? { ...base, answered: false } : { ...base, answered: false, answer_problem: "window_open" };
    return outcome(deny(inputs), null);
  }
  const problem = expiresMs === null ? "invalid_time" : answerProblem(answer, resolves, mandate.delegator, expiresMs);
  if (problem !== null) return outcome(deny({ ...base, answered: true, answer_problem: problem }), null);
  const inputs = { ...base, answered: true, choice: answer.choice, answered_at: answer.answered_at };
  return outcome(passed({ ...spec, inputs }), answer);
}
