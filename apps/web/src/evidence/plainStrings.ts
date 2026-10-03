// Static words of the plain Evidence screen, EN then zh-HK. Sentences that depend on the numbers live in explainPlain.ts
// and explainCards.ts. {slots} take figures that wear the run's chip. The three layers are always named the same way:
// rules only (the hard rules R1-R8 and R12 with the card limit: no seller check, no listing check), Wally (the same plus the
// seller check and the listing check) and a bare AI judge (our weak baseline, for reference).
// Every zh-HK line is a draft for the native read.
import { label } from "../i18n/label";

export const P = {
  lead: label("We tested Wally on our own scripted test purchases in a simulated shop. Here is what happened.", "我們在模擬商店用自己的腳本測試購買測試了 Wally，結果如下。"), // NEEDS-REVIEW zh-HK
  noResults: label("No test results could be read, so no numbers are shown.", "未能讀取任何測試結果，因此不顯示數字。"), // NEEDS-REVIEW zh-HK
  someUnreadable: label("A result file could not be read and was left out. The details are under How we know.", "有一個結果檔案無法讀取，已略去。詳情見「我們怎樣知道」。"), // NEEDS-REVIEW zh-HK

  heroSplit: label("Tested on {n} scripted purchases in a simulated shop: {risky} risky and {honest} honest. Nothing real was bought.", "在模擬商店，進行 {n} 宗腳本購買測試：{risky} 宗高風險，{honest} 宗正常。沒有買任何真實貨品。"), // NEEDS-REVIEW zh-HK
  heroTotal: label("Tested on {n} scripted purchases in a simulated shop. Nothing real was bought.", "在模擬商店，進行 {n} 宗腳本購買測試。沒有買任何真實貨品。"), // NEEDS-REVIEW zh-HK

  layersTitle: label("What each layer adds", "每一層加了甚麼"), // NEEDS-REVIEW zh-HK
  rules: label("Rules only", "只用規則"), // NEEDS-REVIEW zh-HK
  rulesDesc: label("Your budget, what it can buy, the dates and the one-off card limit. No seller check, and nobody reads the listing.", "你的預算、可買的類別、日期和一次性卡的上限。沒有賣家檢查，也沒有人閱讀商品頁。"), // NEEDS-REVIEW zh-HK
  wally: label("Wally", "Wally"),
  wallyDesc: label("The same, plus a seller check and a check that reads each listing.", "同樣的規則和上限，再加上賣家檢查和閱讀每個商品頁的檢查。"), // NEEDS-REVIEW zh-HK
  alone: label("Bare AI judge", "單靠 AI 判斷器"), // NEEDS-REVIEW zh-HK
  aloneDesc: label("Our weak baseline, for reference: an AI model decides alone and pays with a card on file. No rules, no card limit.", "我們的弱基線，供參考：由 AI 模型獨自決定，用已儲存的卡付款，沒有規則，也沒有卡的上限。"), // NEEDS-REVIEW zh-HK

  count: label("{k} of {n}", "{k}／{n}"), // NEEDS-REVIEW zh-HK
  tapDetails: label("Tap for details", "按一下看詳情"), // NEEDS-REVIEW zh-HK

  limitTitle: label("Went over the limit", "超出上限"), // NEEDS-REVIEW zh-HK
  limitTail: label("of {n} purchases", "宗（共 {n} 宗購買）"), // NEEDS-REVIEW zh-HK
  limitCaption: label("Went over the limit", "超出上限的購買"), // NEEDS-REVIEW zh-HK

  riskyTitle: label("Stopped before paying", "付款前已攔截"), // NEEDS-REVIEW zh-HK
  riskyTail: label("of {n} risky purchases", "宗（共 {n} 宗高風險購買）"), // NEEDS-REVIEW zh-HK
  riskyCaption: label("Stopped", "已攔截"), // NEEDS-REVIEW zh-HK

  tricksTitle: label("Trick listings", "陷阱商品頁"), // NEEDS-REVIEW zh-HK
  tricksTail: label("of {n} trick listings", "個（共 {n} 個陷阱商品頁）"), // NEEDS-REVIEW zh-HK
  tricksCaption: label("Stopped", "已攔截"), // NEEDS-REVIEW zh-HK

  honestTitle: label("Approved", "已批准"), // NEEDS-REVIEW zh-HK
  honestTail: label("of {n} honest purchases", "宗（共 {n} 宗正常購買）"), // NEEDS-REVIEW zh-HK
  honestCaption: label("Went through", "順利完成"), // NEEDS-REVIEW zh-HK

  speedTitle: label("Speed", "速度"), // NEEDS-REVIEW zh-HK
  speedTail: label("seconds for a typical decision", "秒（一般決定）"), // NEEDS-REVIEW zh-HK
  speedCaption: label("Typical time to decide, in seconds", "一般決定所需時間（秒）"), // NEEDS-REVIEW zh-HK
  speedScope: label("From checking a purchase to making its one-off card. Measured on one laptop.", "由檢查購買到發出一次性卡。於一部手提電腦量度。"), // NEEDS-REVIEW zh-HK
  speedNone: label("Speed was not measured in this run, so there is no number.", "今次運行沒有量度速度，所以沒有數字。"), // NEEDS-REVIEW zh-HK

  wrongTitle: label("Where Wally still gets it wrong", "Wally 仍會出錯的地方"), // NEEDS-REVIEW zh-HK

  howTitle: label("How we know", "我們怎樣知道"), // NEEDS-REVIEW zh-HK
  howIntro: label("For engineers: every count, interval and limit behind the cards above.", "給工程師：以上各卡背後的每個數目、區間及限制。"), // NEEDS-REVIEW zh-HK

  wiringTitle: label("A wiring check, not a result yet", "接線測試，尚未是正式結果"), // NEEDS-REVIEW zh-HK
  wiringBody: label("Some parts of this run were stand-ins, so these numbers only show that the plumbing works. They say nothing yet about the product.", "今次運行有部分是替身，這些數字只證明接駁正常，暫時未能說明產品表現。"), // NEEDS-REVIEW zh-HK
  wiringStamp: label("Wiring check", "接線測試"), // NEEDS-REVIEW zh-HK
} as const;
