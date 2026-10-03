// Words for the About sheet's "How this demo runs": the common path in plain words, the booth's own notes one level down.
// No digits. Every zh-HK line is a draft for the native read.
import { label, type LabelPair } from "./label";

export const ABOUT = {
  planner: {
    local: label("A model on this laptop", "呢部手提電腦上的模型"), // NEEDS-REVIEW
    rule: label("Fixed rules, no model", "只用固定規則，不用模型"), // NEEDS-REVIEW
    replay: label("Recorded answers", "錄製答案"), // NEEDS-REVIEW
  } satisfies Readonly<Record<string, LabelPair>>,
  judge: {
    laya: label("A checker on this laptop", "呢部手提電腦上的檢查器"), // NEEDS-REVIEW
    replay: label("Recorded answers", "錄製答案"), // NEEDS-REVIEW
  } satisfies Readonly<Record<string, LabelPair>>,
  remembers: label("This demo remembers your session on this device until you start it over.", "呢個示範會喺呢部裝置記住你嘅操作，直至你重新開始。"), // NEEDS-REVIEW
  notes: label("Technical notes", "技術備註"), // NEEDS-REVIEW
  notesLead: label("What the booth says about itself, in English.", "展位自述，英文原文。"), // NEEDS-REVIEW
  // Said once, only on a phone that has a practice wallet of its own on the booth Mac (info.sessions is "private").
  privateWallet: label("This is your own practice wallet on the booth Mac. Other visitors cannot see it.", "呢個係你喺展位 Mac 上嘅專屬練習錢包，其他訪客睇唔到。"), // NEEDS-REVIEW
} as const;
