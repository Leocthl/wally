// DM9 in plain words, the default display mode: the same three columns and the same claims as dm9.ts, one line for one
// line, said without register IDs, rule IDs, model or protocol names. Nothing is added and nothing is softened: the
// developer view (dm9.ts) keeps the exact lines with their IDs. No digits at all, so no figure needs a chip. "Not found",
// never "does not have". The zh-HK lines are drafts owed a native read (C-12).
import { label } from "../i18n/label";
import type { Dm9Column } from "./dm9";

export const DM9_PLAIN: readonly Dm9Column[] = [
  {
    id: "breaks",
    title: label("Where it breaks", "會在哪裡失效"), // NEEDS-REVIEW zh-HK
    lines: [
      label("The card is simulated: we found no public way for an app to ask for a one-off card. The lock to one shop and the purpose are simulated too.", "發卡層屬模擬：我們找不到公開的方法讓應用程式申請一次性卡。商戶鎖定及用途亦屬模擬。"), // NEEDS-REVIEW zh-HK
      label("The listing check cannot read raw web pages, do sums or write text, so listings are put into a fixed form first and the sums are done by code.", "商品檢查不能閱讀原始網頁、計算或寫字，所以商品資料先整理成固定格式，計算由程式負責。"), // NEEDS-REVIEW zh-HK
      label("One model plans and checks, so its mistakes can line up. The budget rules and the card limit use no model.", "同一個模型負責規劃和檢查，錯誤可能同時出現；預算規則與卡的上限不用模型。"), // NEEDS-REVIEW zh-HK
      label("The listing check's settings are assumed, tuned on invented listings by one person. It is weaker on Chinese listings.", "商品檢查的設定屬假設，以虛構商品頁及單一標註者調校；對中文商品頁較弱。"), // NEEDS-REVIEW zh-HK
      label("A shop may hold more than it finally charges, so an honest purchase can be declined. We count that as a wrong block.", "商戶可能預先授權高於實際收費，所以正常購買也可能被拒，我們計作誤攔。"), // NEEDS-REVIEW zh-HK
    ],
    foot: label("Whatever goes wrong, the answer is to stop or to ask you. The listing check can only make a decision stricter.", "無論出什麼問題，結果都是停止或請你確認。商品檢查只會令決定更嚴格。"), // NEEDS-REVIEW zh-HK
  },
  {
    id: "loss",
    title: label("Who bears the loss (a first-draft proposal)", "損失由誰承擔（建議：損失規則初稿）"), // NEEDS-REVIEW zh-HK
    lines: [
      label("Inside the budget rules and approved by the recorded rule: the person who set the budget.", "在預算規則範圍內、按記錄規則批准：由設定預算的人承擔。"), // NEEDS-REVIEW zh-HK
      label("Outside the budget rules, when the receipts prove it: the operator.", "超出預算規則、收據證明違規：由營運方承擔。"), // NEEDS-REVIEW zh-HK
      label("A trick listing that got past the listing check: the operator.", "騙過商品檢查的陷阱商品頁：由營運方承擔。"), // NEEDS-REVIEW zh-HK
      label("A shop that does not deliver: the shop.", "商戶不交貨：由商戶承擔。"), // NEEDS-REVIEW zh-HK
      label("A card network or card issuer error: open, and we asked HKT.", "發卡網絡或發卡機構出錯：未定，已向 HKT 提問。"), // NEEDS-REVIEW zh-HK
    ],
    foot: label("At most the approved amount is at risk, and never more than what is left in the budget. Refunds go through the shop; the dispute fee follows the loss. Not legal advice; the wallet's terms govern.", "最多只會損失已批准的金額，而且不會超過預算餘額。退款經商戶處理；爭議費用隨損失承擔。並非法律意見，以錢包條款為準。"), // NEEDS-REVIEW zh-HK
  },
  {
    id: "path",
    title: label("Path to HKT", "與 HKT 的下一步"), // NEEDS-REVIEW zh-HK
    lines: [
      label("Not found in public sources: a way for an app to get a one-off card, a lock to one shop or purpose, or a loss rule for purchases made by an app.", "公開資料中未找到：讓應用程式取得一次性卡的方法、商戶或用途鎖定，以及應用程式代購的損失規則。"), // NEEDS-REVIEW zh-HK
      label("The ask: a way for an app to make a single-use card with a limit, an expiry, a shop lock and a purpose; cancel it; signed card events; an export for auditors.", "我們的提議：讓應用程式發出附額度、到期日、商戶鎖定及用途的一次性卡；可取消；簽署的卡事件；供審計用的匯出。"), // NEEDS-REVIEW zh-HK
      label("The same rules, signed budget and receipts work on any card network; only the connection to the card changes.", "同一套規則、已簽署的預算與收據可用於任何支付網絡，只需更換與卡的連接。"), // NEEDS-REVIEW zh-HK
      label("The sealed budget is already a verifiable credential, and the agent-ID pilot uses the same kind of credential. We make no claim about that pilot's results.", "已封定的預算本身已是可驗證憑證；代理身份試驗亦使用可驗證憑證。我們不對該試驗的結果作任何聲稱。"), // NEEDS-REVIEW zh-HK
    ],
    foot: label("A one-page proposal, not an HKT commitment. Not affiliated with HKT.", "一頁建議書，並非 HKT 的承諾；與 HKT 並無關連。"), // NEEDS-REVIEW zh-HK
  },
];
