// Judge panel strings (judge-fit v1 and v2), EN then zh-HK. No digits: figures go through EvNum. The limits restate the
// report's own limits section. zh-HK lines are drafts owed a native read (C-12).
import { label } from "../i18n/label";

export const J = {
  title: label("Judge on invented listings", "判斷器在虛構商品頁上的表現"), // NEEDS-REVIEW zh-HK
  notAccuracy: label("These figures describe this corpus at these thresholds. They are not a general accuracy.", "這些數字只描述此語料在這些門檻下的結果，並非一般準確度。"), // NEEDS-REVIEW zh-HK
  verdictFittedA: label("At the fitted thresholds the judge approves", "按調校後的門檻，判斷器批准了合法保留測試商品頁中的"), // NEEDS-REVIEW zh-HK
  verdictInForceA: label("At the thresholds in force the judge approves", "按現行門檻，判斷器批准了合法商品頁中的"), // NEEDS-REVIEW zh-HK
  verdictFittedB: label("of the legitimate held-out listings and lets", "，並放行了植入指令商品頁中的"), // NEEDS-REVIEW zh-HK
  verdictInForceB: label("of the legitimate listings and lets", "，並放行了植入指令商品頁中的"), // NEEDS-REVIEW zh-HK
  verdictC: label("of the injected ones through; the", "；[F38] 的"), // NEEDS-REVIEW zh-HK
  verdictD: label("target [F38] is", "目標"), // NEEDS-REVIEW zh-HK
  met: label("met.", "已達到。"), // NEEDS-REVIEW zh-HK
  notMet: label("not met.", "未達到。"), // NEEDS-REVIEW zh-HK
  sameCases: label("Fit and test were the same cases in this report.", "此報告的調校與測試用同一批個案。"), // NEEDS-REVIEW zh-HK
  verdictDisagrees: label("The file's own target verdict disagrees with its counts; trust neither until it is re-run.", "檔案的目標結論與其數字不符；重新運行前兩者都不應採信。"), // NEEDS-REVIEW zh-HK

  beforeAfterTitle: label("Same held-out cases: register thresholds before the fit against the fitted ones", "同一批保留測試個案：調校前登記門檻與調校後門檻比較"), // NEEDS-REVIEW zh-HK
  inForceTitle: label("End to end, at the thresholds in force", "按現行門檻的整體結果"), // NEEDS-REVIEW zh-HK
  measure: label("Measure", "指標"), // NEEDS-REVIEW zh-HK
  betterWhen: label("Better when", "何者為佳"), // NEEDS-REVIEW zh-HK
  higher: label("higher", "越高越好"), // NEEDS-REVIEW zh-HK
  lower: label("lower", "越低越好"), // NEEDS-REVIEW zh-HK
  before: label("Register thresholds before the fit [F36, F50]", "調校前的登記門檻 [F36, F50]"), // NEEDS-REVIEW zh-HK
  fitted: label("Fitted thresholds [F36]", "調校後門檻 [F36]"), // NEEDS-REVIEW zh-HK
  inForce: label("Thresholds in force", "現行門檻"), // NEEDS-REVIEW zh-HK
  legitApproved: label("Legitimate listings approved", "合法商品頁獲批"), // NEEDS-REVIEW zh-HK
  injectedApproved: label("Injected listings approved", "植入指令商品頁獲批"), // NEEDS-REVIEW zh-HK
  highRiskApproved: label("High-risk sellers approved", "高風險賣家獲批"), // NEEDS-REVIEW zh-HK
  outOfScopeApproved: label("Out-of-scope listings approved", "範圍外商品頁獲批"), // NEEDS-REVIEW zh-HK
  thresholds: label("Threshold values", "門檻數值"), // NEEDS-REVIEW zh-HK

  gatesTitle: label("Per gate on the evaluated cases", "按關卡：評估個案"), // NEEDS-REVIEW zh-HK
  gate: label("Gate", "關卡"), // NEEDS-REVIEW zh-HK
  threshold: label("Threshold", "門檻"), // NEEDS-REVIEW zh-HK
  falseBlock: label("Should-pass cases stopped (false block)", "應放個案被攔（誤攔）"), // NEEDS-REVIEW zh-HK
  recall: label("Should-stop cases stopped (recall)", "應攔個案被攔（召回）"), // NEEDS-REVIEW zh-HK
  sellerA: label("The seller gate stopped", "賣家關卡攔下了高風險保留測試賣家中的"), // NEEDS-REVIEW zh-HK
  sellerB: label("of the high-risk held-out sellers at its fitted threshold. End to end", "。整體上，高風險賣家獲批的有"), // NEEDS-REVIEW zh-HK
  sellerC: label("high-risk sellers were approved: risky sellers are stopped by R9, the Scameter capture check, and by the injection gate [F36].", "：高風險賣家由 R9（Scameter 擷取檢查）及植入指令關卡攔截 [F36]。"), // NEEDS-REVIEW zh-HK
  sellerInert: label("The seller threshold stops none on its own.", "賣家門檻本身沒有攔下任何個案。"), // NEEDS-REVIEW zh-HK

  listingsTitle: label("The six demo listings and the outcome each gets", "六個示範商品頁及各自的結果"), // NEEDS-REVIEW zh-HK
  listing: label("Listing", "商品頁"), // NEEDS-REVIEW zh-HK
  live: label("Live outcome", "即場結果"), // NEEDS-REVIEW zh-HK
  recorded: label("Recorded outcome (replay fixture, not a measurement)", "錄製結果（重播用，並非量度）"), // NEEDS-REVIEW zh-HK
  verdictPass: label("pass", "通過"), // NEEDS-REVIEW zh-HK

  variantsTitle: label("Every question wording tried on the tuning split, nothing left out", "在調校集試過的所有問題寫法，全數列出"), // NEEDS-REVIEW zh-HK
  variantsNote: label("Tuning figures pick the wording; they are not an evaluation.", "調校集數字只用來選寫法，並非評估結果。"), // NEEDS-REVIEW zh-HK
  variant: label("Wording", "寫法"), // NEEDS-REVIEW zh-HK
  rank: label("Rank", "排名"), // NEEDS-REVIEW zh-HK
  idea: label("Idea", "構思"), // NEEDS-REVIEW zh-HK
  okCalls: label("Calls answered", "成功回應"), // NEEDS-REVIEW zh-HK
  meanAuc: label("Mean AUC", "平均 AUC"), // NEEDS-REVIEW zh-HK
  chosen: label("chosen", "已選用"), // NEEDS-REVIEW zh-HK

  limitsTitle: label("Limits", "限制"), // NEEDS-REVIEW zh-HK
  limitCorpus: label("SIMULATED corpus: invented listings, not real shop pages.", "模擬語料：虛構商品頁，並非真實商店頁面。"), // NEEDS-REVIEW zh-HK
  limitAnnotator: label("One annotator: every label is one author's judgement; there is no second annotator.", "單一標註者：所有標籤只屬一位作者的判斷，沒有第二位標註者。"), // NEEDS-REVIEW zh-HK
  limitSplitV2: label("The tuning and held-out split was fixed by a hash rule before any run, and the held-out split was judged once, after the wording and thresholds were fixed.", "調校集與保留測試集在任何運行前已按雜湊規則固定；保留測試集只在寫法及門檻定案後評估一次。"), // NEEDS-REVIEW zh-HK
  limitSplitV1: label("Fit and test are the same cases in this report, so its figures are optimistic.", "此報告的調校與測試用同一批個案，數字偏樂觀。"), // NEEDS-REVIEW zh-HK
  splitSizes: label("Split sizes, tuning and held-out", "分組大小：調校集及保留測試集"), // NEEDS-REVIEW zh-HK
  limitChinese: label("Chinese input is weak: the checkpoint is English-derived.", "中文輸入表現較弱：模型檢查點源自英文。"), // NEEDS-REVIEW zh-HK
  limitIntervals: label("Intervals are wide at this sample size: a few cases move a rate by several points.", "此樣本量下區間很闊：幾個個案已可令比率變動數個百分點。"), // NEEDS-REVIEW zh-HK
  limitLatency: label("Latency was measured on a shared machine while other callers used it, so it is not a benchmark.", "延遲是在多方共用的機器上量度，並非基準測試。"), // NEEDS-REVIEW zh-HK
  limitTruncation: label("Long listings are truncated, which fails closed: the judge errors and the engine escalates.", "過長的商品頁會被截斷並安全拒絕：判斷器報錯，規則引擎轉交確認。"), // NEEDS-REVIEW zh-HK
  limitFile: label("Limits stated in the file", "檔案列明的限制"), // NEEDS-REVIEW zh-HK
  noFit: label("No judge-fit report could be read, so no judge figure is shown.", "未能讀取判斷器調校報告，因此不顯示判斷器數字。"), // NEEDS-REVIEW zh-HK
} as const;
