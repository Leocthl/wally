// What Tamper changed: entry, field, value before and after, line and column, and the text around the byte.
import { bi, el } from "../dom";
import { LIMITS } from "../limits";
import type { TamperState } from "../state";

function snippet(text: string, offset: number, fromChar: string, toChar: string): HTMLElement {
  const before = text.slice(Math.max(0, offset - LIMITS.snippetChars), offset);
  const after = text.slice(offset + 1, offset + 1 + LIMITS.snippetChars);
  return el("p", { class: "snippet mono", "aria-label": "Changed byte in context" }, [
    `…${before}`,
    el("del", {}, [fromChar]),
    el("ins", {}, [toChar]),
    `${after}…`,
  ]);
}

export function renderTamperNote(tamper: TamperState | null, logText: string): HTMLElement | null {
  if (tamper === null) return null;
  const c = tamper.change;
  return el("div", { class: "tamper-note", role: "note", "data-tampered": "true", "data-tampered-seq": String(c.seq), "data-field": c.field }, [
    bi({ en: "Tampered copy. The original is kept; Restore puts it back.", zh: "已竄改的副本。原文已保留，按「還原」即可復原。" }, "p", "tamper-note__title"), // NEEDS-REVIEW zh-HK
    el("p", {}, [`Entry seq ${c.seq} (${c.kind}), field `, el("code", { class: "code" }, [c.field]), ` (${c.what}): ${c.before} → ${c.after}.`]),
    el("p", {}, [`One byte changed at line ${c.line}, column ${c.column}.`]),
    snippet(logText, c.offset, c.fromChar, c.toChar),
  ]);
}
