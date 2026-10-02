// Plain words for each verifyChain failure code (docs/02 section 11 steps 1-9). The code is always shown too.
import type { VerifyFailure } from "@laisee/core/verify";
import type { Bi } from "./strings";

const REASONS: Readonly<Record<VerifyFailure, Bi>> = {
  SCHEMA: {
    en: "This entry is not in the log format: an unreadable line, a wrong field, or an entry in the wrong place.",
    zh: "此紀錄不符合格式：無法讀取、欄位錯誤或位置不對。", // NEEDS-REVIEW zh-HK
  },
  SEQ: {
    en: "Entries are missing, repeated or out of order.",
    zh: "紀錄有缺失、重複或次序錯亂。", // NEEDS-REVIEW zh-HK
  },
  PREV_HASH: {
    en: "The link to the previous entry is broken.",
    zh: "與上一筆紀錄的連結已斷開。", // NEEDS-REVIEW zh-HK
  },
  PAYLOAD_HASH: {
    en: "The content of this entry changed after it was written.",
    zh: "此紀錄的內容於寫入後被改動。", // NEEDS-REVIEW zh-HK
  },
  ENTRY_HASH: {
    en: "The header of this entry (time, kind, ids or hashes) changed after it was written.",
    zh: "此紀錄的標頭（時間、類別、編號或雜湊）於寫入後被改動。", // NEEDS-REVIEW zh-HK
  },
  SIGNATURE: {
    en: "The engine signature does not verify against a listed engine key.",
    zh: "引擎簽署未能以已列出的引擎公鑰驗證。", // NEEDS-REVIEW zh-HK
  },
  PAYLOAD_SIGNATURE: {
    en: "A delegator signature (mandate credential, revocation or escalation answer) does not verify, or names another mandate.",
    zh: "委託人簽署（授權憑證、撤銷或升級回覆）未能驗證，或屬於另一份授權。", // NEEDS-REVIEW zh-HK
  },
  TRUNCATED: {
    en: "The log does not reach or match the head checkpoint: it was cut short or rewritten.",
    zh: "紀錄與最新檢查點不符：已被截短或改寫。", // NEEDS-REVIEW zh-HK
  },
  KEYS: {
    en: "The public keys cannot anchor trust: no delegator key, or the delegator key is also an engine key. Nothing was checked.",
    zh: "公鑰無法作為信任依據：沒有委託人公鑰，或委託人公鑰同時列為引擎公鑰。未有進行任何檢查。", // NEEDS-REVIEW zh-HK
  },
  NO_DECISION: {
    en: "A card was minted or charged without an approval for it earlier in this log.",
    zh: "此紀錄中沒有較早的批准，卻發出或扣款了一張卡。", // NEEDS-REVIEW zh-HK
  },
  DUPLICATE: {
    en: "Something that may happen once happened twice: a decision id, a card for one approval, or one consent used again.",
    zh: "只可發生一次的事發生了兩次：決定編號、同一批准的卡，或同一同意被再用。", // NEEDS-REVIEW zh-HK
  },
  CONSENT: {
    en: "An approval claims the delegator's consent, but there is no signed, in-time yes from the delegator for this exact cart.",
    zh: "此批准聲稱已得委託人同意，但沒有委託人就這個購物車及時簽署的同意。", // NEEDS-REVIEW zh-HK
  },
  OVERSPEND: {
    en: "The money does not add up: a limit, a charge or the total goes past what was approved or sealed.",
    zh: "金額不符：上限、扣款或總額超出已批准或封存的數目。", // NEEDS-REVIEW zh-HK
  },
  AFTER_REVOKE: {
    en: "A card was minted after the mandate was revoked or expired.",
    zh: "授權已撤銷或到期後仍發出了卡。", // NEEDS-REVIEW zh-HK
  },
};

export function reasonText(reason: VerifyFailure): Bi {
  return REASONS[reason];
}
