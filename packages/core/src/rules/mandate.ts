// R1 mandate signature valid (proof result supplied by the caller, ADR-0007) and R2 not revoked,
// not expired. Pure: no I/O, no clock (now is an argument).
import type { Cart, Mandate, PacketState } from "../generated";
import { failed, judged, parseTime, passed, timeOf, type RuleResult } from "./result";

export interface R1Input {
  readonly mandate: Mandate;
  readonly packet: PacketState;
  readonly cart: Cart;
  /** DecideContext.mandateProofValid; anything but true fails closed (I5). */
  readonly proofValid: unknown;
}

function bindingOf(mandate: Mandate, packet: PacketState, cart: Cart): string {
  if (cart.mandate_id !== mandate.id) return "mandate_mismatch";
  if (cart.agent !== mandate.agent) return "agent_mismatch";
  if (packet.mandate_id !== mandate.id) return "packet_mismatch";
  return "ok";
}

/** R1: the credential proof verified, and the cart and packet belong to this mandate and agent. */
export function evaluateR1({ mandate, packet, cart, proofValid }: R1Input): RuleResult {
  const proof = proofValid === true ? "valid" : proofValid === false ? "invalid" : "not_checked";
  const binding = bindingOf(mandate, packet, cart);
  const inputs = { signer: mandate.delegator, proof, binding };
  return judged(proof === "valid" && binding === "ok", { id: "R1", inputs, comparator: "verify" }, "DENY", "R1.invalid_signature");
}

export interface R2Input {
  readonly mandate: Mandate;
  readonly packet: PacketState;
  readonly now: Date;
}

const KNOWN_STATUS: ReadonlySet<string> = new Set(["ACTIVE", "EXHAUSTED", "EXPIRED", "REVOKED"]);

/** Earlier of mandate.valid_until and packet.expires_at; null when neither parses. */
function effectiveUntil(mandate: Mandate, packet: PacketState): { readonly ms: number | null; readonly iso: string } {
  const until = parseTime(mandate.valid_until);
  const packetUntil = parseTime(packet.expires_at);
  if (until === null || (packetUntil !== null && packetUntil < until)) {
    return { ms: packetUntil, iso: packet.expires_at };
  }
  return { ms: until, iso: mandate.valid_until };
}

/** R2: DENY R2.revoked for a revoked (or unknown) status; DENY R2.expired outside valid_from..valid_until. */
export function evaluateR2({ mandate, packet, now }: R2Input): RuleResult {
  const status: unknown = packet.status;
  if (status === "REVOKED" || typeof status !== "string" || !KNOWN_STATUS.has(status)) {
    const inputs = { revoked: status === "REVOKED", status: typeof status === "string" ? status : null };
    return failed({ id: "R2", inputs, comparator: "!=", thresholdRef: "packet.status" }, "DENY", "R2.revoked");
  }
  const nowMs = timeOf(now);
  const nowIso = nowMs === null ? null : new Date(nowMs).toISOString();
  const until = effectiveUntil(mandate, packet);
  const expiredSpec = { id: "R2" as const, comparator: "<" as const, thresholdRef: "mandate.valid_until" };
  if (nowMs === null || until.ms === null || nowMs >= until.ms || status === "EXPIRED") {
    const inputs = { revoked: false, now: nowIso, valid_until: until.iso, status };
    return failed({ ...expiredSpec, inputs }, "DENY", "R2.expired");
  }
  const from = parseTime(mandate.valid_from);
  if (from === null || nowMs < from) {
    const inputs = { revoked: false, now: nowIso, valid_from: mandate.valid_from, not_yet_valid: true };
    return failed({ id: "R2", inputs, comparator: ">=", thresholdRef: "mandate.valid_from" }, "DENY", "R2.expired");
  }
  return passed({ ...expiredSpec, inputs: { revoked: false, now: nowIso, valid_until: until.iso } });
}
