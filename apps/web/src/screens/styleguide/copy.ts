// Copy for the style guide's sample screens (static, SIMULATED). Vocabulary from the lead: budget, rules, Seal,
// one-off card, "Stopped before paying", "Needs your OK", Receipts, Proof; Wally is the assistant, the person is "you".
// Figures are passed in already formatted, so no digit lives in a string. Every zh-HK line is NEEDS-REVIEW.
import { label, type LabelPair } from "../../i18n/label";

export const C = {
  hi: (name: string): LabelPair => label(`Hi, ${name}`, `${name}，你好`), // NEEDS-REVIEW
  budgetLeft: label("Budget left", "預算剩餘"), // NEEDS-REVIEW
  ofBudget: (total: string, until: string): LabelPair => label(`of your ${total} budget · until ${until}`, `總預算 ${total} · 有效至 ${until}`), // NEEDS-REVIEW
  ruleClothes: label("Clothes only", "只限衣物"), // NEEDS-REVIEW
  ruleVerified: label("Verified sellers", "只限認證賣家"), // NEEDS-REVIEW
  ruleSigned: label("Signed rules", "已簽署規則"), // NEEDS-REVIEW
  recent: label("Recent", "最近"), // NEEDS-REVIEW
  seeAll: label("See all", "查看全部"), // NEEDS-REVIEW
  jacket: label("Denim jacket", "牛仔褸"), // NEEDS-REVIEW
  sneakers: label("Running shoes", "跑鞋"), // NEEDS-REVIEW
  tee: label("White tee", "白色T恤"), // NEEDS-REVIEW
  approved: label("Approved", "已批准"), // NEEDS-REVIEW
  stoppedShort: label("Stopped before paying", "付款前已攔截"), // NEEDS-REVIEW
  needsOk: label("Needs your OK", "需要你確認"), // NEEDS-REVIEW
  oneOffCard: label("One-off card", "一次性卡"), // NEEDS-REVIEW
  tryAsking: label("Try asking", "試吓問"), // NEEDS-REVIEW
  suggestTee: (max: string): LabelPair => label(`A white tee under ${max}`, `${max} 以下的白色T恤`), // NEEDS-REVIEW
  suggestSocks: label("Running socks", "跑步襪"), // NEEDS-REVIEW
  suggestGift: label("A small gift", "一份小禮物"), // NEEDS-REVIEW
  askPlaceholder: label("Ask Wally to buy...", "叫 Wally 幫你買..."), // NEEDS-REVIEW
  askLabel: label("What should Wally buy?", "想 Wally 幫你買甚麼？"), // NEEDS-REVIEW
  voice: label("Speak", "語音輸入"), // NEEDS-REVIEW
  send: label("Send", "傳送"), // NEEDS-REVIEW
  ask: label("Ask", "問 Wally"), // NEEDS-REVIEW
  settings: label("Settings", "設定"), // NEEDS-REVIEW
  account: label("You", "你"), // NEEDS-REVIEW

  shopping: label("Wally is shopping", "Wally 正在幫你買"), // NEEDS-REVIEW
  forYou: label("For your budget", "按你的預算"), // NEEDS-REVIEW
  inclShipping: (amount: string): LabelPair => label(`${amount} with shipping`, `連運費 ${amount}`), // NEEDS-REVIEW
  verifiedSeller: label("Verified seller", "認證賣家"), // NEEDS-REVIEW
  stepPicked: label("Picked an item", "揀好貨品"), // NEEDS-REVIEW
  stepPickedDetail: label("Wally picks from shops you allow", "Wally 只會喺你允許的店舖揀"), // NEEDS-REVIEW
  stepRead: label("Read the listing", "睇過商品資料"), // NEEDS-REVIEW
  stepReadDetail: label("Wally reads it as data, never as orders", "Wally 只當資料，不當指令"), // NEEDS-REVIEW
  stepRules: label("Checked your rules", "已核對你的規則"), // NEEDS-REVIEW
  stepRulesDetail: label("Fixed rules, not the AI, decide", "由固定規則決定，不是 AI"), // NEEDS-REVIEW
  stepCard: label("Made a one-off card", "發出一次性卡"), // NEEDS-REVIEW
  stepCardDetail: label("Works once, for this amount only", "只可用一次，只限這個金額"), // NEEDS-REVIEW
  stepsLabel: label("What Wally did", "Wally 做了甚麼"), // NEEDS-REVIEW
  timesSimulated: label("Times are from a simulated run", "時間來自模擬運行"), // NEEDS-REVIEW

  madeCard: label("Wally made a one-off card", "Wally 已發出一次性卡"), // NEEDS-REVIEW
  worksOnce: (amount: string): LabelPair => label(`Works once, for ${amount} only`, `只可用一次，限 ${amount}`), // NEEDS-REVIEW
  lockedTo: (shop: string): LabelPair => label(`Only at ${shop}`, `只限 ${shop}`), // NEEDS-REVIEW
  cardEnding: (last4: string): LabelPair => label(`Card ending ${last4}`, `卡號尾數 ${last4}`), // NEEDS-REVIEW
  payNow: label("Pay now", "立即付款"), // NEEDS-REVIEW
  whyApproved: label("Why was this approved?", "點解會批准？"), // NEEDS-REVIEW
  rulesDecided: label("Fixed rules decided this, not the AI.", "由固定規則決定，不是 AI。"), // NEEDS-REVIEW

  overBy: (total: string, left: string, shipping: string): LabelPair =>
    label(`${total} is over the ${left} left. Shipping ${shipping} is included.`, `${total} 超出剩餘的 ${left}，已包括運費 ${shipping}。`), // NEEDS-REVIEW
  budgetRule: label("Budget rule", "預算規則"), // NEEDS-REVIEW
  noCard: label("No card was made", "沒有發出任何卡"), // NEEDS-REVIEW
  noCardBody: label("Nothing can be charged. Your budget is untouched.", "不可能有任何扣款，你的預算原封不動。"), // NEEDS-REVIEW
  cheaper: label("See cheaper options", "睇更平嘅選擇"), // NEEDS-REVIEW
  topUp: label("Top up budget", "增加預算"), // NEEDS-REVIEW
  why: label("Why?", "點解？"), // NEEDS-REVIEW
  whyTitle: label("Why Wally stopped", "Wally 點解攔截"), // NEEDS-REVIEW
  whyApprovedTitle: label("Why this was approved", "點解會批准"), // NEEDS-REVIEW
  ruleBudget: label("Budget", "預算"), // NEEDS-REVIEW
  ruleSeller: label("Seller", "賣家"), // NEEDS-REVIEW
  ruleListing: label("Listing text", "商品文字"), // NEEDS-REVIEW
  ruleCategory: label("Category", "類別"), // NEEDS-REVIEW
  pass: label("Pass", "通過"), // NEEDS-REVIEW
  fail: label("Over the limit", "超出上限"), // NEEDS-REVIEW

  proof: label("Proof", "證明"), // NEEDS-REVIEW
  verifiedCount: (n: string): LabelPair => label(`All ${n} receipts check out`, `${n} 張收據全部核實`), // NEEDS-REVIEW
  verifiedHere: label("Verified on this device. Nothing was sent anywhere.", "已在這部裝置核實，沒有傳送任何資料。"), // NEEDS-REVIEW
  brokenAt: (n: string): LabelPair => label(`Broken at receipt ${n}`, `第 ${n} 張收據出錯`), // NEEDS-REVIEW
  brokenBody: label("Someone changed a receipt after it was signed. The proof catches it.", "有人在簽署後改動了收據，證明即時發現。"), // NEEDS-REVIEW
  tamper: label("Try to tamper", "試吓竄改"), // NEEDS-REVIEW
  restore: label("Restore", "還原"), // NEEDS-REVIEW
  lastReceipts: label("Latest receipts", "最新收據"), // NEEDS-REVIEW
  rulesSealed: label("Rules sealed", "規則已鎖定"), // NEEDS-REVIEW
  signedBy: label("Signed on this device", "在這部裝置簽署"), // NEEDS-REVIEW
} as const;
