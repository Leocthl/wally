// Why a receipt failed, one sentence each, no codes (shared wording table). All 14 failure codes have one, in both
// languages, and an unknown code still gets a sentence, because the verdict itself has already failed closed.
import type { VerifyFailure } from "@wally/core/verify";
import { describe, expect, it } from "vitest";
import { isRuleBreak, plainReason } from "../src/plain/reasons";

/** The shared wording table (plain reasons), copied on purpose: a typo in either copy fails this test. */
const TABLE: Readonly<Record<VerifyFailure, readonly [string, string]>> = {
  SCHEMA: ["This receipt is not written the way Wally writes them, or is in the wrong place.", "這張收據的寫法不是 Wally 的格式，或位置不對。"],
  SEQ: ["Some receipts are missing, repeated or out of order.", "有收據缺失、重複或次序錯亂。"],
  PREV_HASH: ["This receipt no longer fits the one before it.", "這張收據與上一張對不上。"],
  PAYLOAD_HASH: ["What this receipt says was changed after it was written.", "這張收據的內容在寫下後被改動。"],
  ENTRY_HASH: ["The label on this receipt (its time or ids) was changed after it was written.", "這張收據的標示（時間或編號）在寫下後被改動。"],
  SIGNATURE: ["Wally's signature on this receipt is not valid.", "這張收據上 Wally 的簽署無效。"],
  PAYLOAD_SIGNATURE: [
    "Your signature (on the budget rules, a cancellation or an OK) is not valid, or belongs to another budget.",
    "你的簽署（預算規則、取消預算或確認）無效，或屬於另一個預算。",
  ],
  TRUNCATED: [
    "Receipts are missing from the end, or were rewritten: the list does not match the saved checkpoint.",
    "收據在尾部缺失或被改寫：與已儲存的檢查點不符。",
  ],
  KEYS: ["The keys given cannot be trusted, so nothing was checked.", "所給的金鑰不可信，所以沒有檢查任何東西。"],
  NO_DECISION: ["A card was made or charged with no earlier approval for it.", "有卡在沒有較早批准的情況下發出或扣款。"],
  DUPLICATE: ["Something that can only happen once happened twice.", "只可發生一次的事發生了兩次。"],
  CONSENT: ["Wally went ahead without your signed OK where one was needed.", "需要你簽署確認的地方，Wally 沒有取得就繼續。"],
  OVERSPEND: [
    "The money does not add up: a card or charge went past what was approved or what the budget allows.",
    "金額不符：有卡或扣款超出已批准或預算容許的數目。",
  ],
  AFTER_REVOKE: [
    "A card was made or approved after the budget was cancelled or ended, or outside its dates.",
    "預算取消或完結後，或在有效日期以外，仍發卡或批准。",
  ],
};

const CODES = Object.keys(TABLE) as readonly VerifyFailure[];

describe("plain reasons", () => {
  it("covers all 14 failure codes", () => {
    expect(CODES).toHaveLength(14);
  });

  it.each(CODES)("%s says what the shared table says, in both languages", (code) => {
    const [en, zh] = TABLE[code];
    expect(plainReason(code)).toEqual({ en, zh });
  });

  it.each(CODES)("%s shows no code and no raw field names", (code) => {
    const { en, zh } = plainReason(code);
    expect(en).not.toMatch(/[A-Z]{3,}_[A-Z]+|\b[A-Z_]{4,}\b/);
    expect(zh).not.toMatch(/[A-Z]{3,}_[A-Z]+/);
    expect(en).toMatch(/\.$/);
    expect(zh).toMatch(/。$/);
  });

  it("never asks the reader to know a technical word, apart from the one the table keeps (signature)", () => {
    const banned = /\b(hash(es)?|JSONL?|seq|payload|engine|delegator|mandate|packet|mint(ed|s)?|bytes?|entry|entries|log id|chain)\b/i;
    for (const code of CODES) expect(plainReason(code).en, code).not.toMatch(banned);
  });

  it("still words a code it does not know, so a new library code cannot blank the card", () => {
    const unknown = plainReason("SOMETHING_NEW" as VerifyFailure);
    expect(unknown.en.length).toBeGreaterThan(10);
    expect(unknown.zh.length).toBeGreaterThan(5);
    expect(plainReason("constructor" as VerifyFailure)).toEqual(unknown);
    expect(plainReason("__proto__" as VerifyFailure)).toEqual(unknown);
  });
});

describe("rule breaks", () => {
  it.each(["NO_DECISION", "DUPLICATE", "CONSENT", "OVERSPEND", "AFTER_REVOKE"] as const)("%s is a broken rule: every hash held, so nothing was altered", (code) => {
    expect(isRuleBreak(code)).toBe(true);
  });

  it.each(["SCHEMA", "SEQ", "PREV_HASH", "PAYLOAD_HASH", "ENTRY_HASH", "SIGNATURE", "PAYLOAD_SIGNATURE", "TRUNCATED", "KEYS"] as const)("%s is not", (code) => {
    expect(isRuleBreak(code)).toBe(false);
  });

  it("is false for anything else, including names an object would answer to", () => {
    for (const code of ["", "constructor", "__proto__", "toString", "SOMETHING_NEW"]) expect(isRuleBreak(code as VerifyFailure), code).toBe(false);
  });
});
