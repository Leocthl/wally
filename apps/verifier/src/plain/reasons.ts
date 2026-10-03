// Why a receipt failed, one plain sentence per verifyChain failure code and no code in it (the shared wording table).
// The developer sentences are in ../reasons.ts and keep the codes; this file is the plain view's own, so the two can be
// worded for their readers. Every zh-HK line is a draft owed a native read (C-12).
import type { VerifyFailure } from "@wally/core/verify";
import type { Bi } from "../strings";

const REASONS: Readonly<Record<VerifyFailure, Bi>> = {
  SCHEMA: {
    en: "This receipt is not written the way Wally writes them, or is in the wrong place.",
    zh: "這張收據的寫法不是 Wally 的格式，或位置不對。", // NEEDS-REVIEW zh-HK
  },
  SEQ: {
    en: "Some receipts are missing, repeated or out of order.",
    zh: "有收據缺失、重複或次序錯亂。", // NEEDS-REVIEW zh-HK
  },
  PREV_HASH: {
    en: "This receipt no longer fits the one before it.",
    zh: "這張收據與上一張對不上。", // NEEDS-REVIEW zh-HK
  },
  PAYLOAD_HASH: {
    en: "What this receipt says was changed after it was written.",
    zh: "這張收據的內容在寫下後被改動。", // NEEDS-REVIEW zh-HK
  },
  ENTRY_HASH: {
    en: "The label on this receipt (its time or ids) was changed after it was written.",
    zh: "這張收據的標示（時間或編號）在寫下後被改動。", // NEEDS-REVIEW zh-HK
  },
  SIGNATURE: {
    en: "Wally's signature on this receipt is not valid.",
    zh: "這張收據上 Wally 的簽署無效。", // NEEDS-REVIEW zh-HK
  },
  PAYLOAD_SIGNATURE: {
    en: "Your signature (on the budget rules, a cancellation or an OK) is not valid, or belongs to another budget.",
    zh: "你的簽署（預算規則、取消預算或確認）無效，或屬於另一個預算。", // NEEDS-REVIEW zh-HK
  },
  TRUNCATED: {
    en: "Receipts are missing from the end, or were rewritten: the list does not match the saved checkpoint.",
    zh: "收據在尾部缺失或被改寫：與已儲存的檢查點不符。", // NEEDS-REVIEW zh-HK
  },
  KEYS: {
    en: "The keys given cannot be trusted, so nothing was checked.",
    zh: "所給的金鑰不可信，所以沒有檢查任何東西。", // NEEDS-REVIEW zh-HK
  },
  NO_DECISION: {
    en: "A card was made or charged with no earlier approval for it.",
    zh: "有卡在沒有較早批准的情況下發出或扣款。", // NEEDS-REVIEW zh-HK
  },
  DUPLICATE: {
    en: "Something that can only happen once happened twice.",
    zh: "只可發生一次的事發生了兩次。", // NEEDS-REVIEW zh-HK
  },
  CONSENT: {
    en: "Wally went ahead without your signed OK where one was needed.",
    zh: "需要你簽署確認的地方，Wally 沒有取得就繼續。", // NEEDS-REVIEW zh-HK
  },
  OVERSPEND: {
    en: "The money does not add up: a card or charge went past what was approved or what the budget allows.",
    zh: "金額不符：有卡或扣款超出已批准或預算容許的數目。", // NEEDS-REVIEW zh-HK
  },
  AFTER_REVOKE: {
    en: "A card was made or approved after the budget was cancelled or ended, or outside its dates.",
    zh: "預算取消或完結後，或在有效日期以外，仍發卡或批准。", // NEEDS-REVIEW zh-HK
  },
};

/** Said for a code the table has no sentence for (a newer library): the verdict has failed closed either way. */
const UNKNOWN: Bi = {
  en: "This receipt did not pass the check.",
  zh: "這張收據未能通過檢查。", // NEEDS-REVIEW zh-HK
};

/**
 * Failures of the budget's own rules (step 9 of the check): every hash and signature held, so no receipt was altered; what
 * a receipt says breaks a rule. The card must not say "changed" for these.
 */
const RULE_BREAKS: ReadonlySet<string> = new Set<VerifyFailure>(["NO_DECISION", "DUPLICATE", "CONSENT", "OVERSPEND", "AFTER_REVOKE"]);

export function isRuleBreak(reason: VerifyFailure): boolean {
  return RULE_BREAKS.has(reason);
}

export function plainReason(reason: VerifyFailure): Bi {
  return Object.hasOwn(REASONS, reason) ? REASONS[reason] : UNKNOWN;
}
