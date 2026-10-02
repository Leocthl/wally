// The three pasted inputs, validated at the page boundary. Fail closed: anything unreadable is an input error and
// the chain is never checked (so never PASS). The log text itself is passed on byte for byte, never trimmed.
import { parseCheckpoint, parsePublicKeys, type Checkpoint, type PublicKeys } from "@laisee/core/verify";
import { LIMITS } from "./limits";
import { formatCount } from "./phrases";
import type { Bi } from "./strings";

export type Field = "log" | "keys" | "checkpoint";

export interface InputError {
  readonly field: Field;
  /** The message in English. A library detail inside it stays English in both languages. */
  readonly message: string;
  /** The same message in zh-HK (a library detail inside it stays English). */
  readonly zh: string;
}

export type Read<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: InputError };

const bad = <T>(field: Field, message: string, zh: string): Read<T> => ({ ok: false, error: { field, message, zh } });
const count = formatCount;

const LABEL: Readonly<Record<Field, Bi>> = {
  log: { en: "The receipts text", zh: "收據文字" }, // NEEDS-REVIEW zh-HK
  keys: { en: "The public keys text", zh: "公鑰文字" }, // NEEDS-REVIEW zh-HK
  checkpoint: { en: "The checkpoint text", zh: "檢查點文字" }, // NEEDS-REVIEW zh-HK
};

function tooBig(field: Field, length: number, cap: number): Read<never> | null {
  if (length <= cap) return null;
  const label = LABEL[field];
  return bad(
    field,
    `${label.en} has ${count(length)} characters; this page reads up to ${count(cap)}.`,
    `${label.zh}有 ${count(length)} 個字元；本頁最多讀取 ${count(cap)} 個。`, // NEEDS-REVIEW zh-HK
  );
}

function parseJson(field: Field, text: string): Read<unknown> {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return bad(field, `${LABEL[field].en} is not valid JSON.`, `${LABEL[field].zh}不是有效的 JSON。`); // NEEDS-REVIEW zh-HK
  }
}

export function readLog(text: string): Read<string> {
  const big = tooBig("log", text.length, LIMITS.logChars);
  if (big) return big;
  if (text.trim() === "") return bad("log", "No receipts yet. Paste receipts or load a file.", "尚未有收據。請貼上收據或載入檔案。"); // NEEDS-REVIEW zh-HK
  return { ok: true, value: text };
}

export function readKeys(text: string): Read<PublicKeys> {
  const big = tooBig("keys", text.length, LIMITS.smallChars);
  if (big) return big;
  if (text.trim() === "") {
    return bad("keys", "No public keys yet. Paste the public keys JSON or load the file.", "尚未有公鑰。請貼上公鑰 JSON 或載入檔案。"); // NEEDS-REVIEW zh-HK
  }
  const json = parseJson("keys", text);
  if (!json.ok) return json;
  const parsed = parsePublicKeys(json.value);
  if (!parsed.ok) {
    const details = parsed.errors.map((e) => e.message).join("; ");
    return bad("keys", `Public keys rejected: ${details}.`, `公鑰被拒絕：${details}。`); // NEEDS-REVIEW zh-HK
  }
  return { ok: true, value: parsed.value };
}

/** Optional: blank means "no checkpoint". A checkpoint that is present but unreadable is an error, never skipped. */
export function readCheckpoint(text: string): Read<Checkpoint | undefined> {
  const big = tooBig("checkpoint", text.length, LIMITS.smallChars);
  if (big) return big;
  if (text.trim() === "") return { ok: true, value: undefined };
  const json = parseJson("checkpoint", text);
  if (!json.ok) return json;
  const parsed = parseCheckpoint(json.value);
  if (!parsed.ok) {
    const details = parsed.errors.map((e) => e.message).join("; ");
    return bad("checkpoint", `Checkpoint rejected: ${details}.`, `檢查點被拒絕：${details}。`); // NEEDS-REVIEW zh-HK
  }
  return { ok: true, value: parsed.value };
}
