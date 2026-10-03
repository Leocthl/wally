// Plain sentences that take a number, a name or a field, in both languages (the static labels are in ./strings.ts).
// Numbers come from the log or the page state, never invented here. Every zh-HK string is a draft owed a native read (C-12).
import type { Field, InputErrorKind } from "../inputs";
import { formatCount } from "../phrases";
import type { Source } from "../state";
import type { Bi } from "../strings";
import { hkdFromMinor } from "./format";
import { P } from "./strings";

/** "Receipt 2" and "第 2 張收據": receipts are numbered from 1, the way a person counts them. */
export function receiptName(n: number): Bi {
  return { en: `Receipt ${n}`, zh: `第 ${n} 張收據` }; // NEEDS-REVIEW zh-HK
}

/** The big word of a FAIL when a receipt itself changed. */
export function changedAt(n: number): Bi {
  return { en: `Changed at receipt ${n}`, zh: `第 ${n} 張收據被改動` }; // NEEDS-REVIEW zh-HK
}

/** The big word of a FAIL when no receipt was altered but a rule of the budget was broken (a card with no approval, say). */
export function problemAt(n: number): Bi {
  return { en: `Problem at receipt ${n}`, zh: `第 ${n} 張收據有問題` }; // NEEDS-REVIEW zh-HK
}

export function passLede(count: number): Bi {
  if (count === 1) return { en: "The receipt is untouched.", zh: "這張收據完好無缺。" }; // NEEDS-REVIEW zh-HK
  return { en: `All ${count} receipts are untouched.`, zh: `全部 ${count} 張收據都完好無缺。` }; // NEEDS-REVIEW zh-HK
}

export function passBody(count: number): Bi {
  return {
    en: `Nothing was changed, removed or moved since Wally wrote ${count === 1 ? "it" : "them"}.`,
    zh: "自 Wally 寫下後，沒有任何收據被改動、刪走或調動。", // NEEDS-REVIEW zh-HK
  };
}

export function gapLine(n: number, where: "earlier" | "later"): Bi {
  if (where === "earlier") return { en: `${n} earlier receipts not shown.`, zh: `較早的 ${n} 張收據未有顯示。` }; // NEEDS-REVIEW zh-HK
  return { en: `${n} later receipts not shown.`, zh: `較後的 ${n} 張收據未有顯示。` }; // NEEDS-REVIEW zh-HK
}

/** The names a person gives the three boxes (the not-verified card and the box labels use them). */
export const FIELD_NAME: Readonly<Record<Field, Bi>> = {
  log: { en: "Receipts file", zh: "收據檔案" }, // NEEDS-REVIEW zh-HK
  keys: { en: "Public keys", zh: "公鑰" }, // NEEDS-REVIEW zh-HK
  checkpoint: { en: "Saved checkpoint", zh: "已儲存的檢查點" }, // NEEDS-REVIEW zh-HK
};

export function fieldLead(field: Field): Bi {
  const name = FIELD_NAME[field];
  return { en: `${name.en}: `, zh: `${name.zh}：` }; // NEEDS-REVIEW zh-HK
}

const EMPTY_PROBLEM: Readonly<Record<Field, Bi>> = {
  log: { en: "There are no receipts to check yet.", zh: "還未有收據可供檢查。" }, // NEEDS-REVIEW zh-HK
  keys: { en: "There are no public keys yet.", zh: "還未有公鑰。" }, // NEEDS-REVIEW zh-HK
  checkpoint: P.problemNothing,
};

/** What was wrong with a box, in a few plain words; the box's own message stays under the box, in the folded panel. */
export function inputProblem(field: Field, kind: InputErrorKind): Bi {
  if (kind === "empty") return EMPTY_PROBLEM[field];
  return kind === "too-big" ? P.problemTooBig : P.problemUnreadable;
}

const SAMPLE: Readonly<Record<Field, Bi>> = {
  log: { en: "Sample receipts for practice (SIMULATED).", zh: "供練習用的示範收據（模擬）。" }, // NEEDS-REVIEW zh-HK
  keys: { en: "Sample public keys for practice (SIMULATED).", zh: "供練習用的示範公鑰（模擬）。" }, // NEEDS-REVIEW zh-HK
  checkpoint: { en: "Sample checkpoint for practice (SIMULATED).", zh: "供練習用的示範檢查點（模擬）。" }, // NEEDS-REVIEW zh-HK
};

/** Where the text in a box came from, without a character count. A box that holds nothing is empty, however it got that way. */
export function plainSourceLine(field: Field, source: Source, text: string): Bi {
  if (source === "empty" || text.trim() === "") return P.sourceEmpty;
  if (source === "demo") return SAMPLE[field];
  if (source === "typed") return P.sourceTyped;
  if (source === "tampered") return P.sourceTampered;
  const name = source.slice("file:".length);
  return { en: `Loaded from file ${name}.`, zh: `由檔案 ${name} 載入。` }; // NEEDS-REVIEW zh-HK
}

export function plainFileTooBig(name: string, cap: number): Bi {
  return {
    en: `The file ${name} is too big for this page (the limit is ${formatCount(cap)} characters).`,
    zh: `檔案 ${name} 太大，本頁無法讀取（上限為 ${formatCount(cap)} 個字元）。`, // NEEDS-REVIEW zh-HK
  };
}

const WHAT: Readonly<Record<string, Bi>> = {
  "payload.approved_limit_minor": { en: "the approved amount", zh: "批准金額" }, // NEEDS-REVIEW zh-HK
  "payload.limit_minor": { en: "the card limit", zh: "卡的額度" }, // NEEDS-REVIEW zh-HK
  "payload.amount_minor": { en: "the charged amount", zh: "扣款金額" }, // NEEDS-REVIEW zh-HK
  ts: { en: "the time", zh: "時間" }, // NEEDS-REVIEW zh-HK
};
const WHAT_OTHER: Bi = { en: "a value", zh: "一個數值" }; // NEEDS-REVIEW zh-HK

/** What Tamper changed, as a person would say it; chosen by the field path, never by a value from the log. */
export function tamperWhat(field: string): Bi {
  return Object.hasOwn(WHAT, field) ? (WHAT[field] ?? WHAT_OTHER) : WHAT_OTHER;
}

/**
 * The two values of a change, only when both are amounts that read as HK$ (a field ending in _minor, plain digits). A time
 * or anything else gives null: the note then says what changed without quoting a value from the log back at the reader.
 */
function tamperValues(field: string, before: string, after: string): { readonly from: string; readonly to: string } | null {
  if (!field.endsWith("_minor")) return null;
  const [from, to] = [hkdFromMinor(before), hkdFromMinor(after)];
  return from === null || to === null ? null : { from, to };
}

/**
 * What the change did, in one sentence (the shared wording table's): what was changed, on which receipt, from what to what,
 * that the check caught it, that the real receipts are safe. It claims the catch only when `caught` is true, that is when the
 * check failed at exactly this receipt, and it shows values only when they read as HK$ amounts.
 */
export function tamperSentence(field: string, receipt: number, before: string, after: string, caught: boolean): Bi {
  const what = tamperWhat(field);
  const values = tamperValues(field, before, after);
  const enValues = values === null ? "" : `, from ${values.from} to ${values.to}`;
  const enCaught = caught ? ", and the check caught it, because each receipt is locked to the one before it" : "";
  const zhChange = values === null ? `改動了第 ${receipt} 張收據的${what.zh}` : `把第 ${receipt} 張收據的${what.zh}由 ${values.from} 改成 ${values.to}`; // NEEDS-REVIEW zh-HK
  const zhCaught = caught ? "，檢查即時發現，因為每張收據都與上一張鎖在一起" : ""; // NEEDS-REVIEW zh-HK
  return {
    en: `We changed ${what.en} on receipt ${receipt} in a copy${enValues}${enCaught}. Your real receipts were not touched.`,
    zh: `我們在副本中${zhChange}${zhCaught}。你真正的收據原封不動。`, // NEEDS-REVIEW zh-HK
  };
}
