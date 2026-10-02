// What Tamper changed: entry, field, value before and after, line and column, and the text around the byte.
import { bi, biParts, el } from "../dom";
import { LIMITS } from "../limits";
import { bytePlace } from "../phrases";
import { S } from "../strings";
import type { TamperState } from "../state";
import type { TamperChange } from "../tamper";

function snippet(text: string, offset: number, fromChar: string, toChar: string): HTMLElement {
  const before = text.slice(Math.max(0, offset - LIMITS.snippetChars), offset);
  const after = text.slice(offset + 1, offset + 1 + LIMITS.snippetChars);
  // tabindex 0: the line scrolls sideways, and a keyboard user must be able to reach the part that is cut off.
  return el("p", { class: "snippet mono", role: "group", tabindex: "0", "aria-labelledby": "snippet-label" }, [
    `…${before}`,
    el("del", {}, [fromChar]),
    el("ins", {}, [toChar]),
    `${after}…`,
  ]);
}

/** The entry, field, description and the two values. The field name is a code element, one copy per language. */
function whatChanged(c: TamperChange): HTMLElement {
  const field = (): HTMLElement => el("code", { class: "code" }, [c.field]);
  return biParts(
    [`Entry seq ${c.seq} (${c.kind}), field `, field(), ` (${c.what}): ${c.before} → ${c.after}.`],
    [`第 ${c.seq} 筆（${c.kind}），欄位 `, field(), `（${c.whatZh}）：${c.before} → ${c.after}。`], // NEEDS-REVIEW zh-HK
    "p",
  );
}

export function renderTamperNote(tamper: TamperState | null, logText: string): HTMLElement | null {
  if (tamper === null) return null;
  const c = tamper.change;
  return el("div", { class: "tamper-note", role: "note", "data-tampered": "true", "data-tampered-seq": String(c.seq), "data-field": c.field }, [
    bi(S.tamperTitle, "p", "tamper-note__title"),
    whatChanged(c),
    bi(bytePlace(c.line, c.column), "p"),
    el("span", { id: "snippet-label", class: "sr-only" }, [bi(S.snippetLabel)]),
    snippet(logText, c.offset, c.fromChar, c.toChar),
  ]);
}
