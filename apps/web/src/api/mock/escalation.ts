// Escalation lifecycle for the mock (S5): OPEN until the delegator answers or the window ends (R11).
import type { Decision, EscalationAnswer } from "@laisee/core/generated";
import { PLACEHOLDER_SIGNATURE } from "@laisee/core/testing";
import { ruleIdOf } from "../../explain/renderStop";
import type { EscalationView } from "../types";
import { decideApproved, decideDenied, decideExpired } from "./engine";
import type { MockSession } from "./session";

export function openEscalation(s: MockSession, runId: string, decision: Decision): void {
  const templateId = decision.explanation?.template_id;
  if (!templateId || !decision.escalation) throw new Error("ESCALATE decision without explanation or window (fail closed)");
  const view: EscalationView = {
    decisionId: decision.id,
    templateId,
    ruleId: ruleIdOf(templateId),
    state: "OPEN",
    openedAt: decision.decided_at,
    expiresAt: decision.escalation.expires_at,
    totalMinor: decision.cart.total_minor,
    merchantName: decision.cart.merchant.name,
  };
  s.putEscalation({ view, decisionRunId: runId });
}

function close(s: MockSession, decisionId: string, state: EscalationView["state"]): string {
  const record = s.escalations.get(decisionId);
  if (!record) throw new Error(`no escalation ${decisionId}`);
  s.putEscalation({ ...record, view: { ...record.view, state } });
  return record.decisionRunId;
}

export function prior(s: MockSession, decisionId: string): Decision {
  const entry = s.entries.find((e) => e.kind === "DECISION" && e.payload.id === decisionId);
  if (!entry || entry.kind !== "DECISION") throw new Error(`unknown decision ${decisionId}`);
  return entry.payload;
}

/** R11: every OPEN escalation whose window has passed is stopped. Returns how many it closed. */
export function expireDueEscalations(s: MockSession): number {
  let closed = 0;
  for (const record of s.escalations.values()) {
    if (record.view.state !== "OPEN" || s.now().getTime() < Date.parse(record.view.expiresAt)) continue;
    const denial = decideExpired(prior(s, record.view.decisionId), s.packet(), s.requireMandate(), s.nextId("dec"), s.now());
    s.append("DECISION", denial);
    const runId = close(s, record.view.decisionId, "EXPIRED");
    s.emit({ type: "decision", runId, decision: denial });
    closed += 1;
  }
  return closed;
}

export interface Answered {
  readonly decision: Decision;
  readonly runId: string;
}

/** Records the delegator's answer as a new Decision that resolves the ESCALATE. Hard rules still bind. */
export function answerOpenEscalation(s: MockSession, decisionId: string, choice: "APPROVE" | "DENY"): Answered {
  const record = s.escalations.get(decisionId);
  if (!record || record.view.state !== "OPEN") throw new Error(`escalation ${decisionId} is not open`);
  const mandate = s.requireMandate();
  const answer: EscalationAnswer = { decision_id: decisionId, choice, answered_at: s.nowIso(), signer: mandate.delegator, signature: PLACEHOLDER_SIGNATURE };
  const before = prior(s, decisionId);
  const make = choice === "APPROVE" ? decideApproved : decideDenied;
  const decision = make(before, s.packet(), mandate, s.nextId("dec"), s.now(), answer);
  s.append("DECISION", decision);
  const runId = close(s, decisionId, choice === "APPROVE" ? "APPROVED" : "DENIED");
  s.emit({ type: "decision", runId, decision });
  return { decision, runId };
}
