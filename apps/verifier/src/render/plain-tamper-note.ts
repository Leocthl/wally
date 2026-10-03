// What Tamper did, in plain mode: one sentence (what was changed, on which receipt, from what to what, that the check
// caught it, that the real receipts were not touched) and where "Put it back" is. No entry kind, no field path, no line
// or column, no bytes and no text quoted from the log anywhere in it, not even in an attribute: those stay in developer
// mode. The receipt number is the line the change was made on, the same number the receipts list and the verdict use.
// It says "the check caught it" only when the check really failed at that receipt: with empty keys, or a list that was
// already broken earlier, it says what was changed and nothing about a catch.
import { bi, el } from "../dom";
import { tamperSentence } from "../plain/phrases";
import { P } from "../plain/strings";
import type { RunResult } from "../run";
import type { TamperState } from "../state";
import type { TamperChange } from "../tamper";

/** The check caught the change when it failed exactly at the receipt that was changed (line n is index n - 1). */
export function caughtTheChange(change: TamperChange, result: RunResult | null): boolean {
  return result !== null && result.kind === "checked" && !result.report.ok && result.report.failedSeq === change.line - 1;
}

export function renderPlainTamperNote(tamper: TamperState | null, result: RunResult | null): HTMLElement | null {
  if (tamper === null) return null;
  const c = tamper.change;
  return el("div", { class: "tamper-note tamper-note--plain", role: "note", "data-tampered": "true", "data-tampered-seq": String(c.seq) }, [
    bi(P.tamperTitle, "p", "tamper-note__title"),
    bi(tamperSentence(c.field, c.line, c.before, c.after, caughtTheChange(c, result)), "p", "tamper-note__what"),
    bi(P.tamperHint, "p", "tamper-note__hint soft"),
  ]);
}
