// The plain view's own labels, in both languages: the words of the shared wording table (web Proof and this page say the
// same things). No hash, seq, payload, engine, delegator, mandate, packet, mint, byte, entry or chain in anything the
// reader meets without opening "Show the details". Sentences that take a number or a name are in ./phrases.ts. Every
// zh-HK string is a draft owed a native read (C-12): each line carries NEEDS-REVIEW.
import type { Bi } from "../strings";

export const P = {
  title: { en: "Receipt checker", zh: "收據檢查" }, // NEEDS-REVIEW zh-HK
  intro: {
    en: "Checks that none of Wally's receipts were changed after they were written. It works on this page alone: nothing is sent anywhere.",
    zh: "檢查 Wally 的收據在寫下後有沒有被改動。全部在此頁完成，不會傳送任何資料。", // NEEDS-REVIEW zh-HK
  },
  loadDemo: { en: "Try the sample receipts", zh: "試用示範收據" }, // NEEDS-REVIEW zh-HK
  verify: { en: "Check the receipts", zh: "檢查收據" }, // NEEDS-REVIEW zh-HK
  tamper: { en: "Try changing one receipt", zh: "試改動一張收據" }, // NEEDS-REVIEW zh-HK
  restore: { en: "Put it back", zh: "還原" }, // NEEDS-REVIEW zh-HK
  inputsTitle: { en: "Check your own receipts", zh: "檢查你自己的收據" }, // NEEDS-REVIEW zh-HK
  logLabel: { en: "Receipts file", zh: "收據檔案" }, // NEEDS-REVIEW zh-HK
  keysLabel: { en: "Public keys file", zh: "公鑰檔案" }, // NEEDS-REVIEW zh-HK
  checkpointLabel: { en: "Saved checkpoint (optional)", zh: "已儲存的檢查點（選填）" }, // NEEDS-REVIEW zh-HK
  timeline: { en: "Receipts", zh: "收據" }, // NEEDS-REVIEW zh-HK
  noEntries: { en: "No receipts checked yet.", zh: "尚未檢查任何收據。" }, // NEEDS-REVIEW zh-HK
  computedHere: { en: "Checked here, offline. Nothing leaves this page.", zh: "於此頁離線檢查，資料不會離開本頁。" }, // NEEDS-REVIEW zh-HK
  idle: {
    en: 'Not checked yet. Press "Try the sample receipts", then "Check the receipts".',
    zh: "還未檢查。請先按「試用示範收據」，再按「檢查收據」。", // NEEDS-REVIEW zh-HK
  },
  showDetails: { en: "Show the details", zh: "顯示詳情" }, // NEEDS-REVIEW zh-HK
  factCode: { en: "Code", zh: "代碼" }, // NEEDS-REVIEW zh-HK
  noCheckpointNote: {
    en: "Receipts cut off the end would not be noticed without a saved checkpoint.",
    zh: "沒有已儲存的檢查點，被截走的尾部收據不會被發現。", // NEEDS-REVIEW zh-HK
  },
  oldCheckpointNote: {
    en: "The saved checkpoint is older than the last receipt, so receipts cut off after it would not be noticed.",
    zh: "已儲存的檢查點比最後一張收據舊，在它之後被刪去的收據不會被發現。", // NEEDS-REVIEW zh-HK
  },
  failTail: {
    en: "Receipts before it are untouched. Receipts after it were not checked, because one change breaks the rest.",
    zh: "它之前的收據完好；之後的收據不會再檢查，因為一處改動會令之後的都不可信。", // NEEDS-REVIEW zh-HK
  },
  ruleTail: {
    en: "Receipts before it passed. Receipts after it were not checked.",
    zh: "它之前的收據已通過檢查；之後的收據不會再檢查。", // NEEDS-REVIEW zh-HK
  },
  ruleTailFirst: {
    en: "This is the first receipt, so there is nothing earlier to rely on. Receipts after it were not checked.",
    zh: "這是第一張收據，之前沒有可依靠的收據。之後的收據不會再檢查。", // NEEDS-REVIEW zh-HK
  },
  failTailFirst: {
    en: "This is the first receipt, so there is nothing earlier to rely on. Receipts after it were not checked, because one change breaks the rest.",
    zh: "這是第一張收據，之前沒有可依靠的收據。之後的收據不會再檢查，因為一處改動會令之後的都不可信。", // NEEDS-REVIEW zh-HK
  },
  checkpointWord: { en: "Does not match the saved checkpoint", zh: "與已儲存的檢查點不符" }, // NEEDS-REVIEW zh-HK
  checkpointTail: { en: "The receipts that are here are untouched.", zh: "現有的收據完好。" }, // NEEDS-REVIEW zh-HK
  nothingCheckedWord: { en: "Nothing was checked", zh: "沒有進行任何檢查" }, // NEEDS-REVIEW zh-HK
  crashed: {
    en: "The check could not finish. Treat these receipts as not checked.",
    zh: "檢查未能完成。請當作這些收據未經檢查。", // NEEDS-REVIEW zh-HK
  },
  timeUnreadable: { en: "Time not readable", zh: "時間無法讀取" }, // NEEDS-REVIEW zh-HK
  rowUntouched: { en: "untouched", zh: "完好" }, // NEEDS-REVIEW zh-HK
  rowChanged: { en: "changed", zh: "已被改動" }, // NEEDS-REVIEW zh-HK
  rowUnchecked: { en: "not checked", zh: "未檢查" }, // NEEDS-REVIEW zh-HK
  checkpointOk: { en: "The saved checkpoint matches.", zh: "已儲存的檢查點相符。" }, // NEEDS-REVIEW zh-HK
  checkpointBroken: {
    en: "The saved checkpoint does not match: receipts were cut off the end or rewritten.",
    zh: "已儲存的檢查點不符：結尾的收據被刪去或被改寫。", // NEEDS-REVIEW zh-HK
  },
  checkpointUnchecked: {
    en: "The saved checkpoint was not checked, because an earlier receipt failed.",
    zh: "沒有檢查已儲存的檢查點，因為較早的收據已出問題。", // NEEDS-REVIEW zh-HK
  },
  changedTag: { en: "We changed this one", zh: "我們改動了這一張" }, // NEEDS-REVIEW zh-HK
  tamperTitle: { en: "What we did", zh: "我們做了甚麼" }, // NEEDS-REVIEW zh-HK
  tamperHint: { en: 'Press "Put it back" to restore the original.', zh: "按「還原」即可復原原本的收據。" }, // NEEDS-REVIEW zh-HK
  nothingToChange: {
    en: "There is nothing to change here: no receipt with an amount or a time.",
    zh: "此處沒有可改動的內容：找不到含金額或時間的收據。", // NEEDS-REVIEW zh-HK
  },
  sourceEmpty: { en: "Empty.", zh: "未有內容。" }, // NEEDS-REVIEW zh-HK
  sourceTyped: { en: "You pasted or typed this.", zh: "這是你貼上或輸入的內容。" }, // NEEDS-REVIEW zh-HK
  sourceTampered: {
    en: "A changed copy. One digit differs from the original.",
    zh: "已改動的副本，與原文只有一個數字不同。", // NEEDS-REVIEW zh-HK
  },
  problemTooBig: { en: "Too big for this page.", zh: "太大，本頁無法讀取。" }, // NEEDS-REVIEW zh-HK
  problemUnreadable: { en: "Could not be read.", zh: "無法讀取。" }, // NEEDS-REVIEW zh-HK
  problemNothing: { en: "Nothing was given.", zh: "未有提供內容。" }, // NEEDS-REVIEW zh-HK
} as const satisfies Record<string, Bi>;
