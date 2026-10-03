// UI labels in both languages (docs/04 Microcopy); the page shows one at a time (src/lang.ts). Plain words: budget,
// rules, one-off card, receipts, Wally. Every zh-HK string is a draft owed a native read (docs/04, C-12): each line
// carries NEEDS-REVIEW. Sentences that take a number or a name are functions in phrases.ts.
export interface Bi {
  readonly en: string;
  readonly zh: string;
}

export const S = {
  title: { en: "Receipt verifier", zh: "收據驗證" }, // NEEDS-REVIEW zh-HK
  railSimulated: { en: "Rail SIMULATED", zh: "發卡層 SIMULATED" }, // NEEDS-REVIEW zh-HK
  intro: {
    en: "Checks Wally's receipts offline: the hash chain, the engine signatures, your signed budget rules and the latest checkpoint.",
    zh: "離線檢查 Wally 的收據：雜湊鏈、引擎簽署、你已簽署的預算規則及最新檢查點。", // NEEDS-REVIEW zh-HK
  },
  actions: { en: "Actions", zh: "操作" }, // NEEDS-REVIEW zh-HK
  inputsTitle: { en: "Check your own receipts", zh: "檢查你自己的收據" }, // NEEDS-REVIEW zh-HK
  logLabel: { en: "Receipts (JSONL, one entry per line)", zh: "收據（JSONL，每行一筆）" }, // NEEDS-REVIEW zh-HK
  keysLabel: { en: "Public keys (JSON)", zh: "公鑰（JSON）" }, // NEEDS-REVIEW zh-HK
  checkpointLabel: { en: "Head checkpoint (JSON, optional)", zh: "最新檢查點（JSON，可選）" }, // NEEDS-REVIEW zh-HK
  fileLog: { en: "Load receipts file", zh: "載入收據檔案" }, // NEEDS-REVIEW zh-HK
  fileKeys: { en: "Load public keys file", zh: "載入公鑰檔案" }, // NEEDS-REVIEW zh-HK
  fileCheckpoint: { en: "Load checkpoint file", zh: "載入檢查點檔案" }, // NEEDS-REVIEW zh-HK
  verify: { en: "Verify", zh: "驗證" }, // NEEDS-REVIEW zh-HK
  loadDemo: { en: "Load demo log", zh: "載入示範紀錄" }, // NEEDS-REVIEW zh-HK
  tamper: { en: "Tamper", zh: "竄改" }, // NEEDS-REVIEW zh-HK
  restore: { en: "Restore", zh: "還原" }, // NEEDS-REVIEW zh-HK
  pass: { en: "PASS", zh: "驗證通過" }, // NEEDS-REVIEW zh-HK
  fail: { en: "FAIL", zh: "驗證失敗" }, // NEEDS-REVIEW zh-HK
  notVerified: { en: "NOT VERIFIED", zh: "未驗證" }, // NEEDS-REVIEW zh-HK
  idle: {
    en: "Not verified yet. Load the demo log, or paste your receipts and their public keys, then press Verify.",
    zh: "尚未驗證。請載入示範紀錄，或貼上收據及公鑰，再按「驗證」。", // NEEDS-REVIEW zh-HK
  },
  timeline: { en: "Entries", zh: "紀錄條目" }, // NEEDS-REVIEW zh-HK
  noEntries: { en: "No entries checked yet.", zh: "尚未檢查任何紀錄條目。" }, // NEEDS-REVIEW zh-HK
  result: { en: "Result", zh: "結果" }, // NEEDS-REVIEW zh-HK
  computedHere: { en: "Computed here, offline. Nothing leaves this page.", zh: "於此頁離線計算，資料不會離開本頁。" }, // NEEDS-REVIEW zh-HK
  rowOk: { en: "verified", zh: "已驗證" }, // NEEDS-REVIEW zh-HK
  rowBroken: { en: "broken", zh: "中斷" }, // NEEDS-REVIEW zh-HK
  rowUnchecked: { en: "not checked", zh: "未檢查" }, // NEEDS-REVIEW zh-HK
  checkpointOk: { en: "Head checkpoint matches.", zh: "最新檢查點相符。" }, // NEEDS-REVIEW zh-HK
  checkpointBroken: {
    en: "Head checkpoint does not match: the log was cut short or rewritten.",
    zh: "最新檢查點不符：紀錄已被截短或改寫。", // NEEDS-REVIEW zh-HK
  },
  checkpointUnchecked: { en: "Head checkpoint not checked: the chain broke first.", zh: "未檢查最新檢查點：紀錄鏈已先中斷。" }, // NEEDS-REVIEW zh-HK
  passLede: { en: "Chain verified: hashes, order and every signature check out.", zh: "紀錄鏈已驗證：雜湊、次序及所有簽署均正確。" }, // NEEDS-REVIEW zh-HK
  factEntries: { en: "Entries", zh: "紀錄條目" }, // NEEDS-REVIEW zh-HK
  factLog: { en: "Log id", zh: "紀錄編號" }, // NEEDS-REVIEW zh-HK
  factHead: { en: "Head hash", zh: "最新雜湊" }, // NEEDS-REVIEW zh-HK
  factCheckpoint: { en: "Checkpoint", zh: "檢查點" }, // NEEDS-REVIEW zh-HK
  detail: { en: "Detail: ", zh: "詳情：" }, // NEEDS-REVIEW zh-HK
  snippetLabel: { en: "Changed byte in context", zh: "已改動的位元組及其前後文字" }, // NEEDS-REVIEW zh-HK
  tamperTitle: { en: "Tampered copy. The original is kept; Restore puts it back.", zh: "已竄改的副本。原文已保留，按「還原」即可復原。" }, // NEEDS-REVIEW zh-HK
  noFile: { en: "No file chosen.", zh: "未選擇檔案。" }, // NEEDS-REVIEW zh-HK
  modeLabel: { en: "Show technical details", zh: "顯示技術細節" }, // NEEDS-REVIEW zh-HK
  modeHint: { en: "For engineers: receipt ids, fingerprints and the exact codes.", zh: "給工程師：收據編號、指紋及確切代碼。" }, // NEEDS-REVIEW zh-HK
  demoBadge: {
    en: "SIMULATED demo log and throwaway test keys, not the booth keys.",
    zh: "模擬示範紀錄及一次性測試公鑰，並非展位所用的金鑰。", // NEEDS-REVIEW zh-HK
  },
  footer: {
    en: "Prototype. Not affiliated with HKT, Tap & Go or Mastercard. Demo keys are throwaway; the rail is SIMULATED.",
    zh: "原型作品。與 HKT、Tap & Go 及 Mastercard 並無關連。示範金鑰只供一次性使用；發卡層為模擬。", // NEEDS-REVIEW zh-HK
  },
} as const satisfies Record<string, Bi>;

/** docs/04 Microcopy "Verifier fail". */
export function brokenAt(seq: number): Bi {
  return { en: `Chain broken at entry ${seq}`, zh: `紀錄鏈於第 ${seq} 筆中斷` }; // NEEDS-REVIEW zh-HK
}
