// Plain words for each verifyChain failure code (docs/02 section 11 steps 1-8). The code is always shown too.
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
};

export function reasonText(reason: VerifyFailure): Bi {
  return REASONS[reason];
}
