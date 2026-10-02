// Strings the polish pass added to the Wally screens (lane B). Same rules as ui.ts: no digits (figures arrive already
// formatted), user-facing words only (budget, rules, one-off card, Stopped before paying, Needs your OK), and every
// zh-HK line is a draft marked NEEDS-REVIEW for the native read.
import { label, type LabelPair } from "./label";

export const RUNX = {
  // Stopped before paying
  stampStopped: label("Stopped", "已攔截"), // NEEDS-REVIEW
  noCardTitle: label("No card was made", "沒有發出任何卡"), // NEEDS-REVIEW
  nothingCharged: label("Nothing can be charged.", "不會有任何扣款。"), // NEEDS-REVIEW
  budgetUntouched: (amount: string): LabelPair => label(`${amount} is still in your budget.`, `你的預算仍有 ${amount}。`), // NEEDS-REVIEW
  notBought: label("Not bought", "未有購買"), // NEEDS-REVIEW
  stoppedAt: label("Stopped at the rules check", "喺規則檢查攔截"), // NEEDS-REVIEW

  // The path Wally took, in four words (Stopped before paying)
  pathPick: label("Picked", "已揀"), // NEEDS-REVIEW
  pathRead: label("Read", "已閱讀"), // NEEDS-REVIEW
  pathRules: label("Rules", "規則"), // NEEDS-REVIEW
  pathCard: label("Card", "卡"), // NEEDS-REVIEW
  pathDone: label("done", "完成"), // NEEDS-REVIEW
  pathStopped: label("stopped here", "喺呢度攔截"), // NEEDS-REVIEW
  pathNone: label("no card made", "沒有發卡"), // NEEDS-REVIEW

  // The one-off card
  cardLabel: label("One-off card", "一次性卡"), // NEEDS-REVIEW
  cardEndingLabel: label("Card ending", "卡號尾數"), // NEEDS-REVIEW
  exactly: label("Exactly", "剛好"), // NEEDS-REVIEW
  worksOnceShort: label("Works once", "只可用一次"), // NEEDS-REVIEW
  endsIn: (time: string): LabelPair => label(`Ends in ${time}`, `${time} 後失效`), // NEEDS-REVIEW
  cardLocked: (shop: string): LabelPair => label(`Only at ${shop}`, `只限 ${shop}`), // NEEDS-REVIEW
  stampPaid: label("Paid", "已付款"), // NEEDS-REVIEW
  stampCancelled: label("Cancelled", "已取消"), // NEEDS-REVIEW
  stampExpired: label("Expired", "已過期"), // NEEDS-REVIEW
  madeTitle: label("Wally made a one-off card", "Wally 已發出一次性卡"), // NEEDS-REVIEW

  // Needs your OK
  youAllow: label("If you say yes", "如果你批准"), // NEEDS-REVIEW
  willMake: (amount: string): LabelPair => label(`Wally makes a one-off card for exactly ${amount}.`, `Wally 會發出一張剛好 ${amount} 的一次性卡。`), // NEEDS-REVIEW
  onlyThisShop: (shop: string): LabelPair => label(`It works once, and only at ${shop}.`, `只可用一次，只限 ${shop}。`), // NEEDS-REVIEW
  signedNote: label("Your answer is signed and saved as a receipt.", "你的回覆會簽署並存為收據。"), // NEEDS-REVIEW
  reviewAnswer: label("Review and answer", "查看並回覆"), // NEEDS-REVIEW
  holdToApprove: label("Hold to approve", "按住批准"), // NEEDS-REVIEW
  holdHint: label("Press and hold. Let go early and nothing happens.", "按住不放；提早放手就唔會批准。"), // NEEDS-REVIEW
  signedOk: label("Signed", "已簽署"), // NEEDS-REVIEW
  signing: label("Signing your answer", "正在簽署你的回覆"), // NEEDS-REVIEW
  slipWhat: label("What", "貨品"), // NEEDS-REVIEW
  slipHowMuch: label("How much", "金額"), // NEEDS-REVIEW
  slipThen: label("Then", "之後"), // NEEDS-REVIEW
} as const;
