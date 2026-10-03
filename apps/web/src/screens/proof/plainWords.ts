// Plain Proof in pure functions: which words a receipt gets, which number it carries, why a check failed, what the
// demo changed, and which row is untouched, changed or not checked. No React and no clock. Nothing here throws on an
// entry it cannot read: an unreadable receipt is just "A receipt", and an unknown failure code gets a safe sentence
// that shows no code. Explanations stay rule templates; nothing is written by a model.
import type { VerifyResult } from "@wally/core/ports";
import type { LabelPair } from "../../i18n/label";
import { PLAIN } from "./plainStrings";

export type EventKey = keyof typeof PLAIN.events;
export type RowStatus = "idle" | "ok" | "changed" | "after";

type Loose = Readonly<Record<string, unknown>>;

const asRecord = (value: unknown): Loose | null => (value !== null && typeof value === "object" ? (value as Loose) : null);
const isText = (value: unknown): value is string => typeof value === "string" && value !== "";

function own<T>(table: Readonly<Record<string, T>>, key: string): T | null {
  return Object.prototype.hasOwnProperty.call(table, key) ? (table[key] ?? null) : null;
}

/** Plain receipts are numbered from 1: receipt 1 is the sealed budget. */
export function receiptNumber(seq: number): number {
  return seq + 1;
}

const CARD_EVENT_KEY: Readonly<Record<string, EventKey>> = { AUTHORISED: "charged", DECLINED: "declined", VOIDED: "voided", EXPIRED: "cardExpired" };

/** A stop that closes an earlier decision is told apart by what the person did, then by the rule that fired. */
function stopKey(payload: Loose): EventKey {
  if (!isText(payload["resolves"])) return "stopped";
  const state = asRecord(payload["escalation"])?.["state"];
  const template = asRecord(payload["explanation"])?.["template_id"];
  // Your own no also cites R11, so the answer is read before the template.
  if (state === "DENIED") return "youSaidNo";
  if (state === "EXPIRED" || template === "R11.expired") return "noAnswer";
  if (template === "R12.price_drift") return "priceChanged";
  return "stopped";
}

function decisionKey(payload: Loose | null): EventKey {
  if (payload === null) return "other";
  switch (payload["outcome"]) {
    case "APPROVE":
      return isText(payload["resolves"]) ? "youSaidYes" : "approved";
    case "ESCALATE":
      return "asked";
    case "DENY":
      return stopKey(payload);
    default:
      return "other";
  }
}

/** Which of the 15 plain labels (or "other") a log entry gets. Reads the entry as data; never throws. */
export function eventKey(entry: unknown): EventKey {
  const e = asRecord(entry);
  const payload = asRecord(e?.["payload"] ?? null);
  switch (e?.["kind"]) {
    case "MANDATE_SEALED":
      return "sealed";
    case "DECISION":
      return decisionKey(payload);
    case "CARD_MINTED":
      return "cardMade";
    case "CARD_EVENT":
      return own(CARD_EVENT_KEY, String(payload?.["event"])) ?? "other";
    case "MANDATE_REVOKED":
      return "revoked";
    case "PACKET_EXPIRED":
      return "ended";
    default:
      return "other";
  }
}

export function eventWords(entry: unknown): LabelPair {
  return PLAIN.events[eventKey(entry)];
}

/** You signed the budget, a cancellation and your own answer to a question; Wally signed everything else. */
export function signedByYou(entry: unknown): boolean {
  const e = asRecord(entry);
  if (e === null) return false;
  if (e["kind"] === "MANDATE_SEALED" || e["kind"] === "MANDATE_REVOKED") return true;
  return e["kind"] === "DECISION" && asRecord(asRecord(e["payload"])?.["escalation"])?.["answer"] != null;
}

/** The plain sentence for a failure code. A code this build does not know gets the safe sentence, never the code. */
export function plainReasonWords(code: string): LabelPair {
  return own<LabelPair>(PLAIN.reasons, code) ?? PLAIN.failUnknown;
}

const FIELD_WORDS: Readonly<Record<string, LabelPair>> = {
  "cart.total_minor": PLAIN.fields.total,
  limit_minor: PLAIN.fields.limit,
  amount_minor: PLAIN.fields.amount,
  "credentialSubject.rules.budget.amount_minor": PLAIN.fields.budget,
};

/** What the demo changed, in plain words. money is true when before and after are HK$ minor units. */
export function plainFieldWords(field: string): { readonly words: LabelPair; readonly money: boolean } {
  return { words: own(FIELD_WORDS, field) ?? PLAIN.fields.other, money: field.endsWith("_minor") };
}

/**
 * Untouched up to the failure, changed at it, not checked after it (one change breaks the rest). A pass covers the
 * receipts up to its head; newer ones are not checked yet. Before any verdict every row is neutral. Rows go by their
 * own number, so a window of a long log keeps its meaning.
 */
export function rowStatuses(seqs: readonly number[], result: VerifyResult | null): readonly RowStatus[] {
  return seqs.map((seq): RowStatus => {
    if (result === null) return "idle";
    if (result.ok) return seq <= result.head.seq ? "ok" : "after";
    return seq < result.failedSeq ? "ok" : seq === result.failedSeq ? "changed" : "after";
  });
}
