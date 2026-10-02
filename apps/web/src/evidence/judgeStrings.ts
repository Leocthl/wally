// Judge panel strings (judge-fit report), EN then zh-HK. No digits. The limits restate the report's own limits section.
import { label } from "../i18n/label";

export const J = {
  title: label("Judge fit on invented listings", "判斷器在虛構商品頁上的表現"), // NEEDS-REVIEW zh-HK
  notAccuracy: label("These figures describe this corpus at these thresholds. They are not a general accuracy.", "這些數字只描述此語料在這些門檻下的結果，並非一般準確度。"), // NEEDS-REVIEW zh-HK
  endToEnd: label("End to end, at the thresholds in force", "按現行門檻的整體結果"), // NEEDS-REVIEW zh-HK
  legitApproved: label("Legitimate listings approved", "合法商品頁獲批"), // NEEDS-REVIEW zh-HK
  injectedApproved: label("Injected listings approved", "植入指令商品頁獲批"), // NEEDS-REVIEW zh-HK
  thresholds: label("Thresholds in force", "現行門檻"), // NEEDS-REVIEW zh-HK
  gatesTitle: label("Per gate", "按關卡"), // NEEDS-REVIEW zh-HK
  gate: label("Gate", "關卡"), // NEEDS-REVIEW zh-HK
  recall: label("Should-stop cases stopped", "應攔個案被攔"), // NEEDS-REVIEW zh-HK
  falseBlock: label("Should-pass cases stopped (false block)", "應放個案被攔（誤攔）"), // NEEDS-REVIEW zh-HK
  listingsTitle: label("The six demo listings", "六個示範商品頁"), // NEEDS-REVIEW zh-HK
  listing: label("Listing", "商品頁"), // NEEDS-REVIEW zh-HK
  expected: label("Expected", "預期"), // NEEDS-REVIEW zh-HK
  live: label("Live verdicts", "即場結果"), // NEEDS-REVIEW zh-HK
  recorded: label("Recorded verdicts (replay placeholders, not measurements)", "錄製結果（重播用的佔位答案，並非量度）"), // NEEDS-REVIEW zh-HK
  heldout: label("Held-out injection items let through by the judge alone (harness corpus)", "保留測試集中只靠判斷器而漏網的植入指令（測試語料）"), // NEEDS-REVIEW zh-HK
  tuning: label("Tuning items let through", "調校集漏網"), // NEEDS-REVIEW zh-HK
  limitsTitle: label("Limits", "限制"), // NEEDS-REVIEW zh-HK
  limitCorpus: label("SIMULATED corpus: invented listings, not real shop pages.", "模擬語料：虛構商品頁，並非真實商店頁面。"), // NEEDS-REVIEW zh-HK
  limitAnnotator: label("One annotator: every label is one author's judgement; there is no second annotator.", "單一標註者：所有標籤只屬一位作者的判斷，沒有第二位標註者。"), // NEEDS-REVIEW zh-HK
  limitSplit: label("Fit and test are the same cases in the judge-fit report, so its figures are optimistic. The harness keeps a held-out injection split, shown above.", "判斷器調校報告的調校與測試用同一批個案，數字偏樂觀；測試工具另設保留集，見上。"), // NEEDS-REVIEW zh-HK
  limitChinese: label("Chinese input is weak: the checkpoint is English-derived.", "中文輸入表現較弱：模型檢查點源自英文。"), // NEEDS-REVIEW zh-HK
  limitTruncation: label("Long listings are truncated, which fails closed: the judge errors and the engine escalates.", "過長的商品頁會被截斷並安全拒絕：判斷器報錯，規則引擎轉交確認。"), // NEEDS-REVIEW zh-HK
  limitFile: label("Limits stated in the file", "檔案列明的限制"), // NEEDS-REVIEW zh-HK
  verdictPass: label("pass", "通過"), // NEEDS-REVIEW zh-HK
  noFit: label("No judge-fit report could be read, so no judge figure is shown.", "未能讀取判斷器調校報告，因此不顯示判斷器數字。"), // NEEDS-REVIEW zh-HK
} as const;
