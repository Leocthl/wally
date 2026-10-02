// Does the log still stand behind this payment? (audit H3, S-RAIL-1, at the component.) The executor reads the log
// for the attempt number anyway; before any card is presented it also refuses when the packet is REVOKED or EXPIRED,
// when the APPROVE or the card is not in this log exactly as given, or when a later decision resolved the approval.
// The orchestrator checks the same before calling (R1, R2, R12 at checkout); this makes the component safe on its own.
import { canonicalJson } from "../engine/hash";
import type { CardRecord, Decision, LogEntry } from "../generated";
import { foldPacket } from "../packet";
import type { ExecutorErrorReason } from "./types";

export interface Refusal {
  readonly reason: ExecutorErrorReason;
  readonly message: string;
}

const refusal = (reason: ExecutorErrorReason, message: string): Refusal => ({ reason, message });

/** Deep equality on JSON data; anything that cannot be canonicalised is not equal (fail closed). */
function sameData(a: unknown, b: unknown): boolean {
  try {
    return canonicalJson(a) === canonicalJson(b);
  } catch {
    return false;
  }
}

function packetRefusal(entries: readonly LogEntry[], decision: Decision, now: Date): Refusal | null {
  let packet;
  try {
    packet = foldPacket(entries, now);
  } catch (err) {
    return refusal("LOG_INVALID", `the log cannot be folded: ${err instanceof Error ? err.message : "unknown error"}`);
  }
  if (packet.mandate_id !== decision.mandate_id) return refusal("APPROVAL_NOT_LOGGED", "the decision belongs to another packet");
  if (packet.status === "REVOKED") return refusal("MANDATE_REVOKED", "the mandate was revoked after the approval (I6); nothing presented");
  if (packet.status === "EXPIRED") return refusal("PACKET_EXPIRED", "the packet has expired (I6); nothing presented");
  return null;
}

/** Why this card must not be presented now, from the log as read for this attempt; null when the payment stands. */
export function standingRefusal(entries: readonly LogEntry[], decision: Decision, card: CardRecord, now: Date): Refusal | null {
  const packet = packetRefusal(entries, decision, now);
  if (packet !== null) return packet;
  const decisions = entries.flatMap((e) => (e.kind === "DECISION" ? [e.payload] : []));
  const logged = decisions.find((d) => d.id === decision.id);
  if (logged === undefined || !sameData(logged, decision)) return refusal("APPROVAL_NOT_LOGGED", "the APPROVE is not in this log as given (I1, I7)");
  if (decisions.some((d) => d.resolves === decision.id)) return refusal("APPROVAL_RESOLVED", "a later decision resolved this approval; nothing presented");
  const minted = entries.find((e) => e.kind === "CARD_MINTED" && e.payload.id === card.id);
  if (minted === undefined || !sameData(minted.payload, card)) return refusal("CARD_NOT_LOGGED", "the card is not in this log as given (CARD_MINTED)");
  return null;
}
