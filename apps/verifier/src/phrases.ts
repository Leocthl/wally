// Sentences that take a number, a name or a status, in both languages. Static labels are in strings.ts. Numbers come
// from the log or the page state, never invented here. Every zh-HK string is a draft owed a native read (C-12).
import type { Field } from "./inputs";
import type { Source } from "./state";
import type { Bi } from "./strings";

/** 23,231: thousands separated, the same in both languages. */
export const formatCount = (n: number): string => n.toLocaleString("en");
const count = formatCount;

export const FIELD_NAME: Readonly<Record<Field, Bi>> = {
  log: { en: "Receipts", zh: "收據" }, // NEEDS-REVIEW zh-HK
  keys: { en: "Public keys", zh: "公鑰" }, // NEEDS-REVIEW zh-HK
  checkpoint: { en: "Checkpoint", zh: "檢查點" }, // NEEDS-REVIEW zh-HK
};

/** "Receipts: " and "收據：" (each language has its own colon), for the input error list. */
export function fieldLead(field: Field): Bi {
  const name = FIELD_NAME[field];
  return { en: `${name.en}: `, zh: `${name.zh}：` };
}

export function entriesValue(entryCount: number, headSeq: number): Bi {
  return { en: `${entryCount} (seq 0 to ${headSeq})`, zh: `${entryCount}（第 0 至 ${headSeq} 筆）` }; // NEEDS-REVIEW zh-HK
}

export function checkpointLine(headSeq: number, checkpointSeq: number | undefined): Bi {
  if (checkpointSeq === undefined) {
    return {
      en: "None given: truncation was not checked (a log cut short would still pass).",
      zh: "未有提供：沒有檢查是否被截短（被截短的紀錄仍會通過）。", // NEEDS-REVIEW zh-HK
    };
  }
  const later = headSeq - checkpointSeq;
  if (later > 0) {
    return {
      en: `Matches seq ${checkpointSeq}; the ${later} later entries are not covered by it.`,
      zh: `與第 ${checkpointSeq} 筆相符；之後的 ${later} 筆不在檢查點涵蓋範圍內。`, // NEEDS-REVIEW zh-HK
    };
  }
  return { en: `Matches seq ${checkpointSeq} (the head).`, zh: `與第 ${checkpointSeq} 筆（最新一筆）相符。` }; // NEEDS-REVIEW zh-HK
}

export function earlierLine(failedSeq: number): Bi {
  if (failedSeq > 0) {
    return {
      en: `Entries before seq ${failedSeq} verified; entries after it were not checked.`,
      zh: `第 ${failedSeq} 筆之前的紀錄已驗證；之後的紀錄未有檢查。`, // NEEDS-REVIEW zh-HK
    };
  }
  return { en: "Nothing before this entry to trust.", zh: "此筆之前沒有可信賴的紀錄。" }; // NEEDS-REVIEW zh-HK
}

export function changedByTamper(field: string): Bi {
  return { en: `changed by Tamper: ${field}`, zh: `已被「竄改」改動：${field}` }; // NEEDS-REVIEW zh-HK
}

export function gapLine(n: number, where: "earlier" | "later"): Bi {
  if (where === "earlier") return { en: `${n} earlier entries not shown.`, zh: `較早的 ${n} 筆紀錄未有顯示。` }; // NEEDS-REVIEW zh-HK
  return { en: `${n} later entries not shown.`, zh: `較後的 ${n} 筆紀錄未有顯示。` }; // NEEDS-REVIEW zh-HK
}

export function sourceLine(source: Source, chars: number): Bi {
  const n = count(chars);
  if (source === "empty") return { en: "Empty.", zh: "未有內容。" }; // NEEDS-REVIEW zh-HK
  if (source === "demo") return { en: `SIMULATED demo, ${n} characters.`, zh: `模擬示範，${n} 個字元。` }; // NEEDS-REVIEW zh-HK
  if (source === "typed") return { en: `Pasted or typed here, ${n} characters.`, zh: `在此貼上或輸入，${n} 個字元。` }; // NEEDS-REVIEW zh-HK
  if (source === "tampered") {
    return {
      en: `Tampered copy, ${n} characters. One byte differs from the original.`,
      zh: `已竄改的副本，${n} 個字元。與原文相差一個位元組。`, // NEEDS-REVIEW zh-HK
    };
  }
  const name = source.slice("file:".length);
  return { en: `Loaded from file ${name}, ${n} characters.`, zh: `由檔案 ${name} 載入，${n} 個字元。` }; // NEEDS-REVIEW zh-HK
}

export function fileTooBig(name: string, bytes: number, cap: number): Bi {
  return {
    en: `The file ${name} is ${count(bytes)} bytes; this page reads up to ${count(cap)}.`,
    zh: `檔案 ${name} 有 ${count(bytes)} 個位元組；本頁最多讀取 ${count(cap)} 個。`, // NEEDS-REVIEW zh-HK
  };
}

export function fileUnreadable(name: string): Bi {
  return { en: `The file ${name} could not be read.`, zh: `無法讀取檔案 ${name}。` }; // NEEDS-REVIEW zh-HK
}

export function crashedLine(message: string): Bi {
  return {
    en: `The verifier stopped with an error (${message}). Treat these receipts as not verified.`,
    zh: `驗證器因錯誤而停止（${message}）。請當作未驗證。`, // NEEDS-REVIEW zh-HK
  };
}

/** The place of a changed byte, for the Tamper note. */
export function bytePlace(line: number, column: number): Bi {
  return { en: `One byte changed at line ${line}, column ${column}.`, zh: `已改動一個位元組：第 ${line} 行，第 ${column} 欄。` }; // NEEDS-REVIEW zh-HK
}
