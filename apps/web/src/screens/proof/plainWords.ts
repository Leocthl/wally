// Plain Proof in pure functions: which words a receipt gets, which number it carries, why a check failed, what the
// demo changed, and which row is untouched, changed or not checked. No React and no clock. Nothing here throws on an
// entry it cannot read: an unreadable receipt is just "A receipt", and an unknown failure code gets a safe sentence
// that shows no code. Explanations stay rule templates; nothing is written by a model.
import type { VerifyResult } from "@wally/core/ports";
import type { LabelPair } from "../../i18n/label";
import { asRecord, eventKey, own } from "./eventKey";
import { PLAIN } from "./plainStrings";

export { eventKey, type EventKey } from "./eventKey";

export type RowStatus = "idle" | "ok" | "changed" | "after";

export { receiptNumber } from "./receiptNo";

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
