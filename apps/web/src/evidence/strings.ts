// Evidence screen strings, EN first and a zh-HK second line (docs/04 Microcopy). No digits: figures go through EvNum.
// Every zh-HK line is a draft owed a native read (C-12).
import { label } from "../i18n/label";

export const E = {
  title: label("Evidence", "證據"), // NEEDS-REVIEW zh-HK
  intro: label("Replay harness: the same SIMULATED scenarios through three systems. Lower is better on every rate below.", "重播測試：同一批模擬情境跑三套系統。以下每個比率都是越低越好。"), // NEEDS-REVIEW zh-HK
  pickLabel: label("Result file", "結果檔案"), // NEEDS-REVIEW zh-HK
  whyLiveReal: label("Newest live run whose components are all real.", "最新一次全部元件屬真實版本的即場運行。"), // NEEDS-REVIEW zh-HK
  whyNewestLive: label("Newest live run. No live run has every component real yet.", "最新一次即場運行；暫時未有全部元件屬真實版本的即場運行。"), // NEEDS-REVIEW zh-HK
  whyNewestRecorded: label("Newest recorded run. No live run is in the build.", "最新一次錄製重播；今次建置未有即場運行。"), // NEEDS-REVIEW zh-HK
  whyChosen: label("Chosen by the visitor.", "由訪客選擇。"), // NEEDS-REVIEW zh-HK
  modeLive: label("live: Laya answered on this Mac", "即場：Laya 在本機作答"), // NEEDS-REVIEW zh-HK
  modeRecorded: label("recorded: Laya's answers replayed", "錄製：重播 Laya 的答案"), // NEEDS-REVIEW zh-HK
  unreadableTitle: label("This result file could not be read", "無法讀取此結果檔案"), // NEEDS-REVIEW zh-HK
  unreadableNone: label("No harness result could be read, so no figure is shown.", "未能讀取任何測試結果，因此不顯示任何數字。"), // NEEDS-REVIEW zh-HK
  droppedTitle: label("Parts of this file could not be read and are left out", "此檔案部分內容無法讀取，已略去"), // NEEDS-REVIEW zh-HK

  wiringTitle: label("Wiring check, not product evidence yet", "接線測試，尚未構成產品證據"), // NEEDS-REVIEW zh-HK
  wiringBody: label("These numbers test the plumbing. Stand-ins replace real parts, so they say nothing yet about the product.", "這些數字只測試接駁；部分元件仍是替身，所以未能說明產品表現。"), // NEEDS-REVIEW zh-HK
  wiringUnconfirmed: label("Components not confirmed real: the file carries no flags.", "元件未確認為真實版本：檔案沒有相關標記。"), // NEEDS-REVIEW zh-HK
  wiringStamp: label("WIRING CHECK", "接線測試"), // NEEDS-REVIEW zh-HK
  componentsTitle: label("Components in this run", "今次運行的元件"), // NEEDS-REVIEW zh-HK
  componentReal: label("real", "真實"), // NEEDS-REVIEW zh-HK
  componentStandIn: label("stand-in", "替身"), // NEEDS-REVIEW zh-HK
  componentUnknown: label("not stated", "未有說明"), // NEEDS-REVIEW zh-HK

  acceptanceTitle: label("Acceptance targets", "驗收目標"), // NEEDS-REVIEW zh-HK
  met: label("MET", "達標"), // NEEDS-REVIEW zh-HK
  missed: label("MISSED", "未達標"), // NEEDS-REVIEW zh-HK
  th1Target: label("Target: no over-limit mint or charge in the deterministic scenarios", "目標：確定性情境中沒有超額發卡或扣款"), // NEEDS-REVIEW zh-HK
  th2Target: label("Target: at least this share of legitimate scenarios approved", "目標：合法情境獲批比例不少於"), // NEEDS-REVIEW zh-HK
  th1Short: label("Missed: over-limit mints or charges found", "未達標：發現超額發卡或扣款"), // NEEDS-REVIEW zh-HK
  th2Short: label("Missed: more approvals needed to reach the target", "未達標：尚欠的批准數目"), // NEEDS-REVIEW zh-HK
  th2Empty: label("Missed: no legitimate scenario in the run, so nothing was measured.", "未達標：今次沒有合法情境，無從量度。"), // NEEDS-REVIEW zh-HK
  inconsistent: label("The file's verdict disagrees with its own counts; trust neither until it is re-run.", "檔案的結論與其數字不符；重新運行前兩者都不應採信。"), // NEEDS-REVIEW zh-HK
  noRetune: label("A miss is reported, not retuned.", "未達標照實報告，不會為此重新調校。"), // NEEDS-REVIEW zh-HK

  chartsTitle: label("Model-only gate against the full pipeline", "純模型把關與完整流程比較"), // NEEDS-REVIEW zh-HK
  ciNote: label("CI: Wilson score interval at ninety-five percent confidence, computed on this page from k and n.", "CI：威爾遜百分之九十五信賴區間，由本頁按 k 與 n 計算。"), // NEEDS-REVIEW zh-HK
  notInFile: label("not in this file", "檔案未有此項"), // NEEDS-REVIEW zh-HK
  noCases: label("no cases, so no rate", "沒有個案，所以沒有比率"), // NEEDS-REVIEW zh-HK
  lower: label("lower", "較低"), // NEEDS-REVIEW zh-HK
  higher: label("higher", "較高"), // NEEDS-REVIEW zh-HK
  equal: label("equal", "相同"), // NEEDS-REVIEW zh-HK
  noCompare: label("cannot compare", "無法比較"), // NEEDS-REVIEW zh-HK
  better: label("B2 better here", "此項 B2 較好"), // NEEDS-REVIEW zh-HK
  worse: label("B2 worse here", "此項 B2 較差"), // NEEDS-REVIEW zh-HK
  same: label("no difference", "沒有分別"), // NEEDS-REVIEW zh-HK
  overlap: label("intervals overlap: not a clear difference at this sample size", "區間重疊：以此樣本量未見明確分別"), // NEEDS-REVIEW zh-HK

  latencyQuestion: label("How long from cart to decision?", "由購物車到決定要多久？"), // NEEDS-REVIEW zh-HK
  latencyTitle: label("Decision latency, judge plus engine plus mint", "決定延遲：判斷器、規則引擎及發卡"), // NEEDS-REVIEW zh-HK
  latencyNotMeasured: label("not measured in this run", "今次運行沒有量度"), // NEEDS-REVIEW zh-HK
  judgeQuestion: label("How often did an injected listing get past the judge?", "植入指令的商品頁有幾常騙過判斷器？"), // NEEDS-REVIEW zh-HK
  judgeR10: label("B2, engine R10 check", "B2，規則引擎 R10 檢查"), // NEEDS-REVIEW zh-HK
  judgeMirror: label("B2, judge score at the threshold", "B2，判斷器分數對照門檻"), // NEEDS-REVIEW zh-HK
  judgeOnlyB2: label("Scored on B2 only; the file reports no judge false-allow for B0 or B1.", "只計 B2；檔案沒有 B0 或 B1 的判斷器誤放數字。"), // NEEDS-REVIEW zh-HK
  notEvaluated: label("not scored by the engine in this run", "今次運行規則引擎未有評分"), // NEEDS-REVIEW zh-HK

  tableTitle: label("All metrics in this file", "此檔案的全部指標"), // NEEDS-REVIEW zh-HK
  tableMetric: label("Metric", "指標"), // NEEDS-REVIEW zh-HK
  tableBetter: label("Better when", "何者為佳"), // NEEDS-REVIEW zh-HK
  lowerBetter: label("lower", "越低越好"), // NEEDS-REVIEW zh-HK
  higherBetter: label("higher (a diagnostic)", "越高越好（診斷用）"), // NEEDS-REVIEW zh-HK

  categoriesTitle: label("Per category: scenarios completed", "按類別：完成的情境"), // NEEDS-REVIEW zh-HK
  catCategory: label("Category", "類別"), // NEEDS-REVIEW zh-HK
  catScenarios: label("Scenarios, legitimate", "情境，其中合法"), // NEEDS-REVIEW zh-HK
  catEmpty: label("This file lists no categories.", "此檔案沒有列出類別。"), // NEEDS-REVIEW zh-HK
  blockedTitle: label("Legitimate scenarios B2 blocked", "B2 攔截了的合法情境"), // NEEDS-REVIEW zh-HK
  blockedNone: label("None: B2 completed every legitimate scenario in this file.", "沒有：B2 完成了此檔案中所有合法情境。"), // NEEDS-REVIEW zh-HK
  blockedNoRows: label("This file carries no per-scenario rows, so the blocked list cannot be shown.", "此檔案沒有逐個情境的紀錄，無法列出被攔截項目。"), // NEEDS-REVIEW zh-HK
  blockedScenario: label("Scenario", "情境"), // NEEDS-REVIEW zh-HK
  blockedOutcome: label("B2 outcome, rule", "B2 結果、規則"), // NEEDS-REVIEW zh-HK
  blockedGate: label("Gate", "關卡"), // NEEDS-REVIEW zh-HK
  gateJudge: label("judge", "判斷器"), // NEEDS-REVIEW zh-HK
  gateEngine: label("engine", "規則引擎"), // NEEDS-REVIEW zh-HK
  gateRail: label("rail or checkout", "發卡層或結帳"), // NEEDS-REVIEW zh-HK
  gateError: label("error, failed closed", "錯誤，安全拒絕"), // NEEDS-REVIEW zh-HK
} as const;
