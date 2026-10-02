// Proof screen logic in words. Reason and check names are keyed by string, so a verifier code this build does not know
// yet (a newer core) gets a safe generic sentence plus its code instead of a crash or a blank.
import type { LabelPair } from "../../i18n/label";
import { UI } from "../../i18n/ui";

const P = UI.proof;

function own<T>(table: Readonly<Record<string, T>>, key: string): T | null {
  return Object.prototype.hasOwnProperty.call(table, key) ? (table[key] ?? null) : null;
}

/** The offline verifier page's plain sentence for a failure code; null when this screen does not know the code. */
export function reasonWords(code: string): LabelPair | null {
  return own<LabelPair>(P.reasons, code);
}

/** Short name of a check ("contents", "engine signatures"); null when unknown. */
export function checkWords(code: string): LabelPair | null {
  return own<LabelPair>(P.checks, code);
}

const FIELD_WORDS: Readonly<Record<string, LabelPair>> = {
  "cart.total_minor": P.fieldTotal,
  limit_minor: P.fieldLimit,
  amount_minor: P.fieldAmount,
  "credentialSubject.rules.budget.amount_minor": P.fieldBudget,
};

/** The tampered field in words; money is true when before and after are HK$ minor units. */
export function fieldWords(field: string): { readonly words: LabelPair; readonly money: boolean } {
  return { words: own(FIELD_WORDS, field) ?? P.fieldOther, money: field.endsWith("_minor") };
}

export interface ChainWindow {
  readonly start: number;
  readonly end: number;
}

/** Which links the strip draws: all of a short log, else the newest, else a window centred on the failure. */
export function chainWindow(total: number, failedSeq: number | null, max: number): ChainWindow {
  if (total <= max) return { start: 0, end: total };
  if (failedSeq === null) return { start: total - max, end: total };
  const start = Math.min(Math.max(0, failedSeq - Math.floor(max / 2)), total - max);
  return { start, end: start + max };
}

export type LinkState = "idle" | "ok" | "fail" | "after";

/** Verified up to the failure, broken at it, not checked after it (a break stops the chain). */
export function linkStates(window: ChainWindow, result: { readonly ok: true } | { readonly ok: false; readonly failedSeq: number } | null): readonly LinkState[] {
  return Array.from({ length: Math.max(0, window.end - window.start) }, (_, i) => {
    const seq = window.start + i;
    if (result === null) return "idle";
    if (result.ok) return "ok";
    return seq < result.failedSeq ? "ok" : seq === result.failedSeq ? "fail" : "after";
  });
}

/** The HTTP client asks the booth server to verify; the offline and on-device clients check in this page. */
export function ranOnDevice(kind: string): boolean {
  return kind !== "http";
}
