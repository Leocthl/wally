// Strings for the Wally primitives, character, PWA prompts and the style guide (phase A). Additive: nothing here
// replaces strings.ts. Vocabulary: budget, rules, Seal, one-off card, "Stopped before paying", "Needs your OK",
// Receipts, Proof; the person is "you", the assistant is Wally. No digits here: figures go through the formatter.
// Every zh-HK line is a draft and marked NEEDS-REVIEW for the native read.
import { label, type LabelPair } from "./label";

/** Lane b-run (the Wally screen). Figures arrive already formatted (HK$ with separators), so no digit lives here. */
const RUN = {
  title: label("Wally", "Wally"), // NEEDS-REVIEW
  subtitle: label("Your shopping assistant", "你的購物助手"), // NEEDS-REVIEW
  forYourBudget: label("For your budget", "按你的預算"), // NEEDS-REVIEW
  idleTitle: label("Ready when you are", "隨時準備好"), // NEEDS-REVIEW
  idleBody: label("Tell Wally what you need. Fixed rules check every purchase before any money moves.", "話俾 Wally 知你想買乜。每次購買都會先經固定規則檢查，先至會付款。"), // NEEDS-REVIEW
  ask: label("Ask Wally", "問 Wally"), // NEEDS-REVIEW
  recent: label("Recent", "最近"), // NEEDS-REVIEW
  earlier: label("Earlier", "較早前"), // NEEDS-REVIEW
  noRecent: label("Nothing yet. Your first purchase shows up here.", "暫時未有紀錄，第一次購買會喺呢度顯示。"), // NEEDS-REVIEW

  stepsLabel: label("What Wally is doing", "Wally 做緊乜"), // NEEDS-REVIEW
  stepPick: label("Wally picks", "Wally 揀選"), // NEEDS-REVIEW
  stepPickNow: label("Looking in shops you allow", "喺你允許的店舖搵緊"), // NEEDS-REVIEW
  stepPicked: (item: string): LabelPair => label(`Picked: ${item}`, `揀咗：${item}`), // NEEDS-REVIEW
  stepRead: label("Wally reads the listing", "Wally 閱讀商品資料"), // NEEDS-REVIEW
  stepReadDetail: label("Read as data, never as orders", "只當資料，唔當指令"), // NEEDS-REVIEW
  stepReadOffline: label("The checker is offline, so Wally will ask you", "檢查器離線，Wally 會先問你"), // NEEDS-REVIEW
  stepRules: label("Rules check", "規則檢查"), // NEEDS-REVIEW
  stepRulesDetail: label("Fixed rules decide, not the AI", "由固定規則決定，唔係 AI"), // NEEDS-REVIEW
  stepRulesPass: label("All your rules pass", "全部規則通過"), // NEEDS-REVIEW
  stepCard: label("One-off card", "一次性卡"), // NEEDS-REVIEW
  stepCardNow: label("Making a card for this amount only", "整緊一張只限呢個金額的卡"), // NEEDS-REVIEW
  stepCardDetail: label("Works once, for this amount only", "只可用一次，只限呢個金額"), // NEEDS-REVIEW
  stepCardNone: label("No card was made", "沒有發出任何卡"), // NEEDS-REVIEW
  stepCardWait: label("Waits for your OK", "等你確認"), // NEEDS-REVIEW
  stepFailed: label("Something went wrong here", "呢一步出咗問題"), // NEEDS-REVIEW
  stepOf: (step: string, total: string, name: string): LabelPair => label(`Step ${step} of ${total}: ${name}`, `第 ${step} 步，共 ${total} 步：${name}`), // NEEDS-REVIEW
  timesSimulated: label("Times are from a simulated run", "時間來自模擬運行"), // NEEDS-REVIEW
  timesMeasured: label("Times measured on this run", "時間為今次實測"), // NEEDS-REVIEW

  approvedTitle: label("Wally made a one-off card", "Wally 已發出一次性卡"), // NEEDS-REVIEW
  paidTitle: label("Paid with a one-off card", "已用一次性卡付款"), // NEEDS-REVIEW
  youSaidYes: label("You said yes, so Wally went ahead.", "你揀咗批准，Wally 照做。"), // NEEDS-REVIEW
  oneOffCard: label("One-off card", "一次性卡"), // NEEDS-REVIEW
  worksOnce: (amount: string): LabelPair => label(`Works once, for ${amount} only`, `只可用一次，限 ${amount}`), // NEEDS-REVIEW
  cardEnding: (last4: string): LabelPair => label(`Card ending ${last4}`, `卡號尾數 ${last4}`), // NEEDS-REVIEW
  onlyAt: (shop: string): LabelPair => label(`Only at ${shop}`, `只限 ${shop}`), // NEEDS-REVIEW
  expiresAt: (time: string): LabelPair => label(`Expires ${time}`, `${time} 到期`), // NEEDS-REVIEW
  cardReady: label("Ready", "可以使用"), // NEEDS-REVIEW
  cardUsed: label("Used", "已使用"), // NEEDS-REVIEW
  cardVoided: label("Cancelled", "已取消"), // NEEDS-REVIEW
  cardExpired: label("Expired", "已過期"), // NEEDS-REVIEW
  budgetLeft: label("Budget left", "預算剩餘"), // NEEDS-REVIEW
  budgetLeftOf: (left: string, total: string): LabelPair => label(`${left} left of ${total}`, `${total} 預算尚餘 ${left}`), // NEEDS-REVIEW
  payNow: label("Pay now", "立即付款"), // NEEDS-REVIEW
  whyApproved: label("Why was this approved?", "點解會批准？"), // NEEDS-REVIEW
  storyTitle: label("At checkout", "結帳經過"), // NEEDS-REVIEW
  beatOvershoot: (asked: string, limit: string): LabelPair => label(`The shop asked for ${asked}. Declined, the ${limit} limit held.`, `商店要求 ${asked}，已拒絕，${limit} 上限不變。`), // NEEDS-REVIEW
  beatExact: (amount: string): LabelPair => label(`Charged the exact ${amount}.`, `按確實金額 ${amount} 扣款。`), // NEEDS-REVIEW
  beatReplay: label("Someone tried the card again. Declined, it works once.", "有人再用張卡，已拒絕，只可用一次。"), // NEEDS-REVIEW
  beatWrongShop: label("A different shop tried the card. Declined.", "另一間店試用張卡，已拒絕。"), // NEEDS-REVIEW
  beatDrift: label("The price changed at checkout. The approval was cancelled.", "結帳時價格有變，批准已取消。"), // NEEDS-REVIEW
  beatVoid: label("Card cancelled. The amount went back to your budget.", "卡已取消，金額已退回預算。"), // NEEDS-REVIEW
  beatRetry: (amount: string): LabelPair => label(`The shop timed out. Wally retried once and ${amount} was charged once.`, `商店逾時，Wally 重試一次，只扣款 ${amount} 一次。`), // NEEDS-REVIEW
  beatExpire: label("The card expired unused.", "卡未使用已過期。"), // NEEDS-REVIEW
  beatDeclined: label("Declined.", "已拒絕。"), // NEEDS-REVIEW

  stoppedTitle: label("Stopped before paying", "付款前已攔截"), // NEEDS-REVIEW
  noCard: label("No card was made. Nothing can be charged.", "沒有發出任何卡，不會有任何扣款。"), // NEEDS-REVIEW
  cardCancelled: label("The card was cancelled. Nothing more can be charged.", "卡已取消，不會再有扣款。"), // NEEDS-REVIEW
  cheaper: label("See cheaper options", "睇平啲的選擇"), // NEEDS-REVIEW
  topUp: label("Top up budget", "增加預算"), // NEEDS-REVIEW
  why: label("Why?", "點解？"), // NEEDS-REVIEW
  rulesDecided: label("Fixed rules decided this, not the AI.", "由固定規則決定，唔係 AI。"), // NEEDS-REVIEW
  youSaidNo: label("You said no, so Wally stopped it.", "你揀咗唔要，Wally 已攔截。"), // NEEDS-REVIEW
  nobodyAnswered: label("Nobody answered in time, so Wally stopped it.", "冇人及時回覆，Wally 已攔截。"), // NEEDS-REVIEW
  hardRuleAnyway: label("You said yes, but a fixed rule still stops this.", "你揀咗批准，但固定規則仍然攔截。"), // NEEDS-REVIEW

  needsOkTitle: label("Needs your OK", "需要你確認"), // NEEDS-REVIEW
  approve: label("Approve", "批准"), // NEEDS-REVIEW
  noThanks: label("No thanks", "唔使喇"), // NEEDS-REVIEW
  answerLimit: label("Your answer can't override a fixed rule.", "你的回覆唔可以推翻固定規則。"), // NEEDS-REVIEW
  timeToAnswer: label("Time to answer", "回覆時限"), // NEEDS-REVIEW
  secondsLeft: (n: string): LabelPair => label(`${n} s left`, `尚餘 ${n} 秒`), // NEEDS-REVIEW
  answerStart: (n: string): LabelPair => label(`You have ${n} seconds to answer.`, `你有 ${n} 秒回覆。`), // NEEDS-REVIEW
  timesUp: label("Time's up. Wally is stopping it.", "時間到，Wally 會攔截。"), // NEEDS-REVIEW
  whyAsk: label("Why is Wally asking?", "Wally 點解問你？"), // NEEDS-REVIEW

  noPickTitle: label("Wally couldn't pick a clear item", "Wally 揀唔到合適的貨品"), // NEEDS-REVIEW
  noPickBody: label("Try describing it differently.", "試吓用另一個講法。"), // NEEDS-REVIEW
  errorTitle: label("Something went wrong, so nothing was bought", "出咗問題，所以冇買任何嘢"), // NEEDS-REVIEW
  errorBody: label("No card was made. You can try again.", "沒有發出任何卡，可以再試。"), // NEEDS-REVIEW
  infoTitle: label("Nothing new to buy", "冇新嘢要買"), // NEEDS-REVIEW
  infoBody: label("Wally used the card it already made.", "Wally 用咗之前發出的卡。"), // NEEDS-REVIEW

  reasonR1: label("The signature on your rules didn't check out, so nothing can be bought.", "你的規則簽署驗證唔到，所以唔可以購買。"), // NEEDS-REVIEW
  reasonR2Revoked: label("This budget was cancelled.", "呢個預算已取消。"), // NEEDS-REVIEW
  reasonR2Expired: label("This budget has ended.", "呢個預算已到期。"), // NEEDS-REVIEW
  reasonR3: (total: string, left: string): LabelPair => label(`It costs ${total} with shipping, but only ${left} is left in your budget.`, `連運費要 ${total}，但你的預算只剩 ${left}。`), // NEEDS-REVIEW
  reasonR4Cap: (total: string, cap: string): LabelPair => label(`It costs ${total}. Your limit for one purchase is ${cap}.`, `要 ${total}，超過你每次購買上限 ${cap}。`), // NEEDS-REVIEW
  reasonR4Ask: (total: string, ask: string): LabelPair => label(`It costs ${total}, more than the ${ask} you asked Wally to check with you first.`, `要 ${total}，超過你要求先問你的 ${ask}。`), // NEEDS-REVIEW
  reasonR5: (total: string, ceiling: string): LabelPair => label(`It costs ${total}, more than a one-off card can hold (${ceiling}).`, `要 ${total}，超過一次性卡上限（${ceiling}）。`), // NEEDS-REVIEW
  reasonR6: label("That isn't something your rules let Wally buy.", "你的規則唔容許 Wally 買呢樣嘢。"), // NEEDS-REVIEW
  reasonR7: label("Wally made too many cards in a short time. Try again later.", "短時間內發卡太多，請稍後再試。"), // NEEDS-REVIEW
  reasonR8: label("Too many one-off cards are still open. Use or cancel one first.", "未用的一次性卡太多，請先用或取消一張。"), // NEEDS-REVIEW
  reasonR9Flagged: label("This seller is flagged as a possible scam.", "呢個賣家被標記為可能詐騙。"), // NEEDS-REVIEW
  reasonR9Unverified: label("Wally couldn't check this seller recently.", "Wally 最近未能核實呢個賣家。"), // NEEDS-REVIEW
  reasonR10Injection: label("The listing tried to give Wally orders. Wally reads listings as data, never as orders.", "商品資料試圖指揮 Wally。Wally 只當佢係資料，唔會照做。"), // NEEDS-REVIEW
  reasonR10Seller: label("The listing looks like it comes from a risky seller.", "商品資料顯示賣家風險高。"), // NEEDS-REVIEW
  reasonR10Scope: label("This might not fit your rules.", "呢件貨品可能唔符合你的規則。"), // NEEDS-REVIEW
  reasonR10Unsure: label("Wally isn't sure about this one.", "Wally 對呢件貨品冇把握。"), // NEEDS-REVIEW
  reasonR10Offline: label("Wally's checker is offline, so it asked you first.", "Wally 的檢查器離線，所以先問你。"), // NEEDS-REVIEW
  reasonR12: label("The price changed at checkout, so Wally cancelled the card.", "結帳時價格有變，Wally 已取消張卡。"), // NEEDS-REVIEW
  reasonUnknown: label("A fixed rule stopped this.", "固定規則攔截咗。"), // NEEDS-REVIEW

  chipR1: label("Signed rules", "簽署規則"), // NEEDS-REVIEW
  chipR2: label("Budget dates", "預算期限"), // NEEDS-REVIEW
  chipR3: label("Budget rule", "預算規則"), // NEEDS-REVIEW
  chipR4: label("Per-purchase limit", "每次上限"), // NEEDS-REVIEW
  chipR5: label("Card limit", "卡額上限"), // NEEDS-REVIEW
  chipR6: label("Your rules", "你的規則"), // NEEDS-REVIEW
  chipR7: label("Card pace", "發卡頻率"), // NEEDS-REVIEW
  chipR8: label("Open cards", "未用卡數"), // NEEDS-REVIEW
  chipR9: label("Seller check", "賣家檢查"), // NEEDS-REVIEW
  chipR10: label("Listing check", "商品檢查"), // NEEDS-REVIEW
  chipR11: label("Your answer", "你的回覆"), // NEEDS-REVIEW
  chipR12: label("Checkout price", "結帳價格"), // NEEDS-REVIEW

  whyApprovedTitle: label("Why this was approved", "點解會批准"), // NEEDS-REVIEW
  whyStoppedTitle: label("Why Wally stopped", "Wally 點解攔截"), // NEEDS-REVIEW
  whyAskTitle: label("Why Wally asked you", "Wally 點解問你"), // NEEDS-REVIEW
  checksLabel: label("The checks", "檢查項目"), // NEEDS-REVIEW
  checkBudget: label("Your budget", "你的預算"), // NEEDS-REVIEW
  checkRules: label("Your rules", "你的規則"), // NEEDS-REVIEW
  checkSeller: label("Seller", "賣家"), // NEEDS-REVIEW
  checkListing: label("Wally's read of the listing", "Wally 對商品資料的判斷"), // NEEDS-REVIEW
  checkCard: label("Card limit", "卡額上限"), // NEEDS-REVIEW
  checkAnswer: label("Your answer", "你的回覆"), // NEEDS-REVIEW
  checkPrice: label("Checkout price", "結帳價格"), // NEEDS-REVIEW
  statusPass: label("Pass", "通過"), // NEEDS-REVIEW
  statusStop: label("Stop", "攔截"), // NEEDS-REVIEW
  statusAsk: label("Ask you", "問你"), // NEEDS-REVIEW
  statusSkip: label("Not needed", "毋須檢查"), // NEEDS-REVIEW
  budgetFits: (total: string, left: string): LabelPair => label(`${total} fits in the ${left} left`, `${total} 喺剩餘 ${left} 之內`), // NEEDS-REVIEW
  budgetOver: (total: string, left: string): LabelPair => label(`${total} is over the ${left} left`, `${total} 超出剩餘 ${left}`), // NEEDS-REVIEW
  budgetAsk: label("Over the amount you asked Wally to check first", "超過你要求先確認的金額"), // NEEDS-REVIEW
  rulesPass: label("Allowed item and shop, signed and in date", "貨品同店舖都符合，已簽署，喺期限內"), // NEEDS-REVIEW
  rulesStop: label("Outside what your rules allow", "超出你的規則範圍"), // NEEDS-REVIEW
  sellerPass: label("Checked recently. No scam report found, which is not proof of safety.", "最近查過，未有詐騙紀錄，但唔代表一定安全。"), // NEEDS-REVIEW
  sellerStop: label("Flagged as a possible scam", "被標記為可能詐騙"), // NEEDS-REVIEW
  sellerAsk: label("Not checked recently", "最近未有查核"), // NEEDS-REVIEW
  listingPass: label("Nothing odd. Read as data, never as orders.", "冇異樣，只當資料，唔當指令。"), // NEEDS-REVIEW
  listingInjection: label("It tried to give Wally orders", "試圖指揮 Wally"), // NEEDS-REVIEW
  listingSeller: label("Looks like a risky seller", "似係高風險賣家"), // NEEDS-REVIEW
  listingScope: label("Might not fit your rules", "可能唔符合你的規則"), // NEEDS-REVIEW
  listingUnsure: label("Wally wasn't sure", "Wally 冇把握"), // NEEDS-REVIEW
  listingOffline: label("The checker was offline, so Wally asked you", "檢查器離線，Wally 先問你"), // NEEDS-REVIEW
  cardPass: label("Within what a one-off card can hold", "喺一次性卡上限之內"), // NEEDS-REVIEW
  cardStop: label("More than a one-off card can hold", "超出一次性卡上限"), // NEEDS-REVIEW
  answerStop: label("No yes in time", "未有及時批准"), // NEEDS-REVIEW
  priceStop: label("The price at checkout was not the approved price", "結帳價格同批准的唔同"), // NEEDS-REVIEW
  skipped: label("Not needed this time", "今次毋須檢查"), // NEEDS-REVIEW
  nerds: label("Details for nerds", "技術細節"), // NEEDS-REVIEW
  engineWrote: label("What the rules engine wrote", "規則引擎的紀錄"), // NEEDS-REVIEW
  ruleResults: label("Rule results", "規則結果"), // NEEDS-REVIEW
  listingScores: label("Wally's read of the listing", "Wally 對商品資料的判斷"), // NEEDS-REVIEW
  scoreLimit: label("limit", "門檻"), // NEEDS-REVIEW
  checker: label("Checker", "檢查器"), // NEEDS-REVIEW
  decisionId: label("Decision", "決定編號"), // NEEDS-REVIEW
  receiptNo: label("Receipt", "收據"), // NEEDS-REVIEW
  seeReceipt: label("See the receipt", "查看收據"), // NEEDS-REVIEW

  statusApproved: label("Approved", "已批准"), // NEEDS-REVIEW
  statusPaid: label("Paid", "已付款"), // NEEDS-REVIEW
  statusStopped: label("Stopped before paying", "付款前已攔截"), // NEEDS-REVIEW
  statusNeedsOk: label("Needs your OK", "需要你確認"), // NEEDS-REVIEW
  simulatedCard: label("Simulated card. No money moves.", "模擬卡，沒有真錢轉移。"), // NEEDS-REVIEW
} as const;

export const UI = {
  close: label("Close", "關閉"), // NEEDS-REVIEW
  back: label("Back", "返回"), // NEEDS-REVIEW
  loading: label("Loading", "載入中"), // NEEDS-REVIEW
  dismiss: label("Dismiss", "知道了"), // NEEDS-REVIEW
  more: label("More", "更多"), // NEEDS-REVIEW
  language: label("Language", "語言"), // NEEDS-REVIEW
  theme: label("Appearance", "外觀"), // NEEDS-REVIEW
  themeAuto: label("Auto", "自動"), // NEEDS-REVIEW
  themeLight: label("Light", "淺色"), // NEEDS-REVIEW
  themeDark: label("Dark", "深色"), // NEEDS-REVIEW
  dragToClose: label("Drag down or press Escape to close", "向下拉或按 Escape 關閉"), // NEEDS-REVIEW

  wallyIdle: label("Wally is ready", "Wally 準備好了"), // NEEDS-REVIEW
  wallyThinking: label("Wally is shopping", "Wally 正在幫你買"), // NEEDS-REVIEW
  wallyApproved: label("Wally made a one-off card", "Wally 已發出一次性卡"), // NEEDS-REVIEW
  wallyStopped: label("Wally stopped this before paying", "Wally 在付款前攔截了"), // NEEDS-REVIEW
  wallyOffline: label("Wally is offline", "Wally 離線中"), // NEEDS-REVIEW

  tabBudget: label("Budget", "預算"), // NEEDS-REVIEW
  tabWally: label("Wally", "Wally"), // NEEDS-REVIEW
  tabReceipts: label("Receipts", "收據"), // NEEDS-REVIEW
  tabProof: label("Proof", "證明"), // NEEDS-REVIEW
  mainNav: label("Main", "主選單"), // NEEDS-REVIEW

  installTitle: label("Install Wally", "安裝 Wally"), // NEEDS-REVIEW
  installBody: label("Open it from your home screen, full screen and offline.", "從主畫面開啟，全螢幕，離線都用得。"), // NEEDS-REVIEW
  installButton: label("Install", "安裝"), // NEEDS-REVIEW
  installed: label("Installed on this device", "已安裝在這部裝置"), // NEEDS-REVIEW
  installMenu: label("Use your browser menu to install", "請用瀏覽器選單安裝"), // NEEDS-REVIEW
  iosHintTitle: label("Add Wally to your Home Screen", "把 Wally 加到主畫面"), // NEEDS-REVIEW
  iosHintStep1: label("Tap the Share button in Safari", "在 Safari 按「分享」"), // NEEDS-REVIEW
  iosHintStep2: label("Choose Add to Home Screen", "選擇「加至主畫面」"), // NEEDS-REVIEW
  updateReady: label("New version ready", "有新版本"), // NEEDS-REVIEW
  updateReload: label("Reload", "重新載入"), // NEEDS-REVIEW
  offlineTitle: label("You're offline", "你已離線"), // NEEDS-REVIEW
  offlineBody: label("Wally still works on this phone. Nothing leaves it.", "Wally 仍可在這部手機使用，資料不會外傳。"), // NEEDS-REVIEW

  simulated: label("Simulated. No money moves.", "模擬示範，沒有真錢轉移。"), // NEEDS-REVIEW
  simulatedShort: label("Simulated", "模擬"), // NEEDS-REVIEW

  // Lane b-run: the Wally screen (#/wally). Planner = "Wally picks", judge = "Wally reads the listing", engine = "Rules
  // check", rail = "One-off card". Rule ids, probabilities and comparators appear only under "Details for nerds".
  run: RUN,
} as const;

export type UiKey = keyof typeof UI;
