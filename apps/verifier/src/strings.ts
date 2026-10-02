// UI labels: English first, zh-HK second line (docs/04 Microcopy). Plain words, glossary terms only.
// Every zh-HK string is a draft owed a native read (docs/04, C-12): each line carries NEEDS-REVIEW.
export interface Bi {
  readonly en: string;
  readonly zh: string;
}

export const S = {
  title: { en: "Log verifier", zh: "紀錄驗證" }, // NEEDS-REVIEW zh-HK
  intro: {
    en: "Checks a decision log offline: hash chain, engine signatures, the mandate credential and the head checkpoint.",
    zh: "離線檢查決策紀錄：雜湊鏈、引擎簽署、授權憑證及最新檢查點。", // NEEDS-REVIEW zh-HK
  },
  logLabel: { en: "Log (JSONL, one entry per line)", zh: "紀錄（JSONL，每行一筆）" }, // NEEDS-REVIEW zh-HK
  keysLabel: { en: "Public keys (JSON)", zh: "公鑰（JSON）" }, // NEEDS-REVIEW zh-HK
  checkpointLabel: { en: "Head checkpoint (JSON, optional)", zh: "最新檢查點（JSON，可選）" }, // NEEDS-REVIEW zh-HK
  fileLog: { en: "Load log file", zh: "載入紀錄檔案" }, // NEEDS-REVIEW zh-HK
  fileKeys: { en: "Load public keys file", zh: "載入公鑰檔案" }, // NEEDS-REVIEW zh-HK
  fileCheckpoint: { en: "Load checkpoint file", zh: "載入檢查點檔案" }, // NEEDS-REVIEW zh-HK
  verify: { en: "Verify", zh: "驗證" }, // NEEDS-REVIEW zh-HK
  loadDemo: { en: "Load demo log", zh: "載入示範紀錄" }, // NEEDS-REVIEW zh-HK
  tamper: { en: "Tamper", zh: "竄改" }, // NEEDS-REVIEW zh-HK
  restore: { en: "Restore", zh: "還原" }, // NEEDS-REVIEW zh-HK
  pass: { en: "PASS", zh: "驗證通過" }, // NEEDS-REVIEW zh-HK
  fail: { en: "FAIL", zh: "已中斷" }, // NEEDS-REVIEW zh-HK
  notVerified: { en: "NOT VERIFIED", zh: "未驗證" }, // NEEDS-REVIEW zh-HK
  idle: { en: "Not verified yet. Load or paste a log and its public keys, then press Verify.", zh: "尚未驗證。請載入或貼上紀錄及公鑰，再按「驗證」。" }, // NEEDS-REVIEW zh-HK
  timeline: { en: "Entries", zh: "紀錄條目" }, // NEEDS-REVIEW zh-HK
  result: { en: "Result", zh: "結果" }, // NEEDS-REVIEW zh-HK
  computedHere: { en: "Computed here, offline. Nothing leaves this page.", zh: "於此頁離線計算，資料不會離開本頁。" }, // NEEDS-REVIEW zh-HK
  rowOk: { en: "verified", zh: "已驗證" }, // NEEDS-REVIEW zh-HK
  rowBroken: { en: "broken", zh: "中斷" }, // NEEDS-REVIEW zh-HK
  rowUnchecked: { en: "not checked", zh: "未檢查" }, // NEEDS-REVIEW zh-HK
  demoBadge: {
    en: "SIMULATED demo log and throwaway test keys, not the booth keys.",
    zh: "模擬示範紀錄及一次性測試公鑰，並非攤位所用的金鑰。", // NEEDS-REVIEW zh-HK
  },
  footer: {
    en: "Prototype. Not affiliated with HKT, Tap & Go or Mastercard. Demo keys are throwaway; the rail is SIMULATED.",
    zh: "原型。與 HKT、Tap & Go 或 Mastercard 無關。示範金鑰只供一次性使用；發卡層為模擬。", // NEEDS-REVIEW zh-HK
  },
} as const satisfies Record<string, Bi>;

/** docs/04 Microcopy "Verifier fail". */
export function brokenAt(seq: number): Bi {
  return { en: `Chain broken at entry ${seq}`, zh: `紀錄鏈於第 ${seq} 筆中斷` }; // NEEDS-REVIEW zh-HK
}
