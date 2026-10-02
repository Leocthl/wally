// Log builders for packet-* and engine-* tests: schema-valid entries with placeholder hashes (they do not verify).
import decisionSchema from "../../../schemas/decision.schema.json" with { type: "json" };
import type { CardRecord, Decision, LogEntry, LogEntryKind, LogPayloadByKind, MandateCredential } from "../src/generated";
import type { CardEvent } from "../src/ports";
import { placeholderEntry } from "../src/testing";
import { loadFixture } from "../src/testing/fixtures";
import { mandateIdFromCredentialId } from "../src/vc/mandate";

export const LOG_ID = "log_demoM0";
export const CREDENTIAL: MandateCredential = loadFixture("mandate/m0.credential.json", "mandate-credential");
/** The domain mandate id (mnd_...): the credential id is a URN, log payloads and cards carry this one. */
export const MANDATE_ID = mandateIdFromCredentialId(CREDENTIAL.id);
export const DECISION_EXAMPLE = decisionSchema.examples[0] as unknown as Decision;

/** New log array with one more entry at the next seq (never mutates the input). */
export function append<K extends LogEntryKind>(entries: readonly LogEntry[], kind: K, payload: LogPayloadByKind[K], ts: string): LogEntry[] {
  return [...entries, placeholderEntry({ logId: LOG_ID, seq: entries.length, kind, payload, ts: new Date(ts) }) as LogEntry];
}

export function sealedLog(ts = "2026-10-03T02:00:01Z", credential: MandateCredential = CREDENTIAL): LogEntry[] {
  return append([], "MANDATE_SEALED", credential, ts);
}

export function card(n: number, limit: number, mintedAt: string, ttlMs = 30 * 60 * 1000): CardRecord {
  const id = `crd_test${String(n).padStart(4, "0")}`;
  return {
    id,
    decision_id: `dec_test${String(n).padStart(4, "0")}`,
    mandate_id: MANDATE_ID,
    handle: `hdl_SIMULATEDtesthandle${n}`,
    last4: "0000",
    limit_minor: limit,
    currency: "HKD",
    minted_at: mintedAt,
    expires_at: new Date(Date.parse(mintedAt) + ttlMs).toISOString(),
    state: "ACTIVE",
    simulated: true,
  };
}

export function cardEvent(cardId: string, event: CardEvent["event"], at: string, amount?: number, key?: string): CardEvent {
  const base: CardEvent = { card_id: cardId, event, at, simulated: true };
  if (event === "AUTHORISED") return { ...base, amount_minor: amount ?? 0, merchant_domain: "demo-apparel.example", idempotency_key: key ?? `k_${cardId}_${at}` };
  if (event === "DECLINED") return { ...base, amount_minor: amount ?? 0, merchant_domain: "demo-apparel.example", decline_code: "OVER_LIMIT", idempotency_key: key ?? `k_${cardId}_${at}` };
  return base;
}

export function escalateDecision(id: string, expiresAt: string): Decision {
  const { approved_limit_minor: _a, ...rest } = DECISION_EXAMPLE;
  return {
    ...rest,
    id,
    outcome: "ESCALATE",
    escalation: { state: "OPEN", expires_at: expiresAt },
    explanation: { template_id: "R9.unverified", inputs: {}, rendered: "Escalated by R9. No record, not proof of safety." },
  };
}

export function resolvingDecision(id: string, resolves: string): Decision {
  return { ...DECISION_EXAMPLE, id, resolves };
}
