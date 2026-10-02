// foldPacket (A-02, U1): PacketState as a pure fold of one log, seq 0..n (packet-state.schema.json). Reducers live in
// apply.ts. Committed = limits of ACTIVE cards + limits held by APPROVE decisions whose card is not logged yet (audit
// H4; the schema has no held field, so the hold is counted inside committed_minor). Holds end when the packet is
// REVOKED or EXPIRED: no card can be minted after that (I6). Browser-safe, no clock.
// A log the fold cannot trust throws PacketFoldError, so the caller decides nothing (fail closed, I5). That includes
// a log whose commitments exceed the budget: it is reported, never clamped to zero.
import type { LogEntry, MandateCredential, PacketState } from "../generated";
import { formatIssues, validateLogEntry } from "../schema";
import { mandateIdFromCredentialId } from "../vc/mandate";
import { EMPTY, applyCardEvent, applyDecision, applyMinted, type FoldState } from "./apply";

export class PacketFoldError extends Error {
  readonly seq: number | null;
  constructor(seq: number | null, message: string) {
    super(seq === null ? message : `seq ${seq}: ${message}`);
    this.name = "PacketFoldError";
    this.seq = seq;
  }
}

/** One APPROVE whose card is not logged yet; its limit is inside PacketState.committed_minor. */
export interface HeldApproval {
  readonly decision_id: string;
  readonly limit_minor: number;
}

export interface PacketLedger {
  readonly packet: PacketState;
  /** Approvals holding budget now, in log order. Empty once the packet is REVOKED or EXPIRED. */
  readonly held: readonly HeldApproval[];
}

function applyEntry(s: FoldState, entry: LogEntry): FoldState {
  switch (entry.kind) {
    case "CARD_MINTED":
      return applyMinted(s, entry.payload);
    case "CARD_EVENT":
      return applyCardEvent(s, entry.payload);
    case "DECISION":
      return applyDecision(s, entry.payload);
    case "MANDATE_REVOKED":
      return { ...s, revoked: true };
    case "PACKET_EXPIRED":
      return { ...s, expired: true };
    default:
      throw new PacketFoldError(entry.seq, "a second MANDATE_SEALED in one log");
  }
}

function checkEntries(entries: readonly LogEntry[]): MandateCredential {
  const first = entries[0];
  if (first === undefined) throw new PacketFoldError(null, "empty log: no MANDATE_SEALED");
  entries.forEach((entry, index) => {
    const result = validateLogEntry(entry);
    if (!result.ok) throw new PacketFoldError(index, `entry fails log-entry schema: ${formatIssues(result.errors)}`);
    if (entry.seq !== index) throw new PacketFoldError(index, `seq ${entry.seq} out of order`);
    if (entry.log_id !== first.log_id) throw new PacketFoldError(index, `log_id ${entry.log_id} differs from ${first.log_id}`);
  });
  if (first.kind !== "MANDATE_SEALED") throw new PacketFoldError(0, "seq 0 must be MANDATE_SEALED");
  return first.payload;
}

/** Oldest first; equal times keep log order (Array.prototype.sort is stable). */
function sortedTimes(times: readonly string[]): string[] {
  return [...times].sort((a, b) => Date.parse(a) - Date.parse(b));
}

interface Totals {
  readonly committed: number;
  readonly remaining: number;
  readonly held: readonly HeldApproval[];
}

/** Commitments against the budget; throws when they exceed it (an over-committed log is corrupt, never clamped). */
function totalsOf(s: FoldState, budget: number, stopped: boolean): Totals {
  const held = stopped ? [] : [...s.holds].map(([decision_id, limit_minor]) => ({ decision_id, limit_minor }));
  const committed = s.committed + held.reduce((sum, h) => sum + h.limit_minor, 0);
  const remaining = budget - committed - s.spent;
  if (!Number.isSafeInteger(remaining) || remaining < 0 || s.committed < 0) {
    throw new PacketFoldError(null, `over-committed: committed ${committed} + spent ${s.spent} exceeds the budget ${budget}`);
  }
  return { committed, remaining, held };
}

function statusOf(s: FoldState, remaining: number, expiredByTime: boolean): PacketState["status"] {
  if (s.revoked) return "REVOKED";
  if (s.expired || expiredByTime) return "EXPIRED";
  return remaining === 0 ? "EXHAUSTED" : "ACTIVE";
}

/** PacketState plus the approvals that hold budget, for `entries` (one whole log from seq 0) at `now`. */
export function foldLedger(entries: readonly LogEntry[], now: Date): PacketLedger {
  const nowMs = now instanceof Date ? now.getTime() : Number.NaN;
  if (!Number.isFinite(nowMs)) throw new PacketFoldError(null, "invalid clock");
  const vc = checkEntries(entries);
  const s = entries.slice(1).reduce(applyEntry, EMPTY);
  const untilMs = Date.parse(vc.validUntil);
  const expiredByTime = !Number.isFinite(untilMs) || nowMs >= untilMs;
  const budget = vc.credentialSubject.rules.budget.amount_minor;
  const totals = totalsOf(s, budget, s.revoked || s.expired || expiredByTime);
  const activeCards = [...s.cards].filter(([, c]) => c.state === "ACTIVE").map(([id, c]) => ({ id, limit_minor: c.limit, expires_at: c.expiresAt }));
  const packet: PacketState = {
    mandate_id: mandateIdFromCredentialId(vc.id), // the credential id is a URN, the packet carries the mnd_ id
    log_id: entries[0]?.log_id ?? "",
    budget_minor: budget,
    committed_minor: totals.committed,
    spent_minor: s.spent,
    remaining_minor: totals.remaining,
    currency: vc.credentialSubject.rules.budget.currency,
    active_cards: activeCards,
    mint_times: sortedTimes(s.mintTimes),
    open_escalations: [...s.open].map(([decision_id, expires_at]) => ({ decision_id, expires_at })),
    status: statusOf(s, totals.remaining, expiredByTime),
    expires_at: vc.validUntil,
    folded_through_seq: entries.length - 1,
    computed_at: new Date(nowMs).toISOString(),
  };
  return { packet, held: totals.held };
}

/** PacketState for `entries` (one whole log from seq 0) at `now`. Throws PacketFoldError on a log it cannot trust. */
export function foldPacket(entries: readonly LogEntry[], now: Date): PacketState {
  return foldLedger(entries, now).packet;
}
