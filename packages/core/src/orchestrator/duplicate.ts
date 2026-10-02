// Idempotent submit (docs/02 section 6). A cart that repeats a live one, same cart fingerprint in the same packet,
// gets the earlier decision back instead of a second decision, card and charge. Live means: an APPROVE whose card is
// ACTIVE or USED (a voided or expired card is dead, so the cart is decided afresh), or an ESCALATE that is still open.
// A DENY, an escalation that was answered or ran out, and an APPROVE whose mint never completed are decided again:
// the packet, the clock or the listing may have changed since. Pure functions over the folded log.
import { cartFingerprint } from "../engine/hash";
import type { Decision, LogEntry } from "../generated";
import type { Ctx } from "./context";
import type { Run } from "./events";
import { cardViews, decisions, escalationViewOf } from "./log-view";
import type { CardView, DecidedResult, EscalationView } from "./types";

export interface LiveDuplicate {
  readonly decision: Decision;
  readonly card: CardView | null;
  readonly escalation: EscalationView | null;
}

/** The newest live decision for `fingerprint`, or null. `now` ends an escalation whose window has passed. */
export function findLiveDuplicate(entries: readonly LogEntry[], fingerprint: string, now: Date): LiveDuplicate | null {
  const all = decisions(entries);
  const resolved = new Set(all.flatMap((d) => (d.resolves === undefined ? [] : [d.resolves])));
  const cards = cardViews(entries);
  for (const decision of [...all].reverse()) {
    if (decision.outcome === "DENY" || resolved.has(decision.id) || cartFingerprint(decision.cart) !== fingerprint) continue;
    if (decision.outcome === "APPROVE") {
      const card = cards.find((c) => c.decision_id === decision.id);
      if (card !== undefined && (card.state === "ACTIVE" || card.state === "USED")) return { decision, card, escalation: null };
      continue;
    }
    const open = escalationViewOf(decision, "OPEN");
    if (open !== null && Date.parse(open.expiresAt) > now.getTime()) return { decision, card: null, escalation: open };
  }
  return null;
}

/**
 * The result for a repeat, with the events a run shows: the stages that did not run are skipped, then the earlier
 * decision. Nothing is appended to the log, so no `log` event follows. `judgeRan`: the judge call was already started.
 */
export function reportDuplicate(ctx: Ctx, run: Run, hit: LiveDuplicate, judgeRan: boolean): DecidedResult {
  const note = `repeats ${hit.decision.id}`;
  if (!judgeRan) ctx.report.stage(run, "judge", "skipped", { note });
  ctx.report.stage(run, "engine", "skipped", { note });
  ctx.report.stage(run, "rail", "skipped", { note });
  ctx.report.emit({ type: "decision", runId: run.runId, decision: hit.decision });
  if (hit.escalation !== null) ctx.report.emit({ type: "escalation", escalation: hit.escalation });
  return {
    ok: true,
    runId: run.runId,
    outcome: hit.decision.outcome,
    decision: hit.decision,
    card: hit.card,
    escalation: hit.escalation,
    checkout: null,
    duplicate: true,
  };
}
