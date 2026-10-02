// DM9 card text (docs/00 Canonical demo: where it breaks, who holds the loss, path to HKT). Static template strings from
// docs/07 Honesty slide and Hard Q&A, docs/01 Loss rule v0 and docs/09; claims stay inside those docs. "Not found",
// never "does not have". Register IDs in brackets; no other digits. zh-HK lines are drafts owed a native read (C-12).
import { label, type LabelPair } from "../i18n/label";

export interface Dm9Column {
  readonly id: "breaks" | "loss" | "path";
  readonly title: LabelPair;
  readonly lines: readonly LabelPair[];
  readonly foot: LabelPair;
}

export const DM9: readonly Dm9Column[] = [
  {
    id: "breaks",
    title: label("Where it breaks", "會在哪裡失效"), // NEEDS-REVIEW zh-HK
    lines: [
      label("The rail is SIMULATED: no issuing API found [F1]. Merchant lock and purpose are SIMULATED too.", "發卡層屬模擬：未找到發卡 API [F1]；商戶鎖定及用途亦屬模擬。"), // NEEDS-REVIEW zh-HK
      label("Laya cannot read raw pages, do arithmetic or write text [F11c], so listings are structured and arithmetic is code.", "Laya 不能閱讀原始網頁、計數或寫字 [F11c]，所以商品資料經結構化，計算由程式負責。"), // NEEDS-REVIEW zh-HK
      label("One model plans and judges, so their errors can line up. The rules and the rail limit use no model.", "規劃與判斷用同一模型，錯誤可能同時出現；規則與發卡上限不用模型。"), // NEEDS-REVIEW zh-HK
      label("Judge thresholds are ASSUMED [F36, F50], fitted on invented listings by one annotator; Chinese input is weak.", "判斷門檻屬假設 [F36, F50]，以虛構商品頁及單一標註者調校；中文輸入較弱。"), // NEEDS-REVIEW zh-HK
      label("A merchant may pre-authorise above the charge [F2.preauth]: a legitimate purchase can be declined and counts as a false block.", "商戶可預先授權高於實際收費 [F2.preauth]：合法購買可能被拒，計作誤攔。"), // NEEDS-REVIEW zh-HK
    ],
    foot: label("Every failure path ends in DENY or ESCALATE: the judge can only tighten.", "所有出錯情況都以拒絕或轉交確認收場：判斷器只會收緊。"), // NEEDS-REVIEW zh-HK
  },
  {
    id: "loss",
    title: label("Who holds the loss (proposal: first-draft loss rule)", "損失由誰承擔（建議：損失規則初稿）"), // NEEDS-REVIEW zh-HK
    lines: [
      label("Inside the budget rules, approved by the recorded rule: the delegator.", "預算規則範圍內、按記錄規則批准：由授權人承擔。"), // NEEDS-REVIEW zh-HK
      label("Outside the budget rules, a breach the log proves: the operator.", "超出預算規則、紀錄證明違規：由營運方承擔。"), // NEEDS-REVIEW zh-HK
      label("An injected listing that passed the judge: the operator.", "植入指令而騙過判斷器的商品頁：由營運方承擔。"), // NEEDS-REVIEW zh-HK
      label("Merchant non-delivery: the merchant.", "商戶不交貨：由商戶承擔。"), // NEEDS-REVIEW zh-HK
      label("Rail or issuer error: open, asked of HKT.", "發卡層或發卡機構出錯：未定，已向 HKT 提問。"), // NEEDS-REVIEW zh-HK
    ],
    foot: label("At most the sealed amount is at risk (I2, R3). Refunds go through the merchant; the dispute fee follows the loss [F2, F3.dispute_fee]. Not legal advice; the wallet's terms govern.", "最多只會損失已封定的金額（I2、R3）。退款經商戶處理；爭議費用隨損失承擔 [F2, F3.dispute_fee]。並非法律意見，以錢包條款為準。"), // NEEDS-REVIEW zh-HK
  },
  {
    id: "path",
    title: label("Path to HKT", "與 HKT 的下一步"), // NEEDS-REVIEW zh-HK
    lines: [
      label("Not found in public sources: an issuing API for delegates, a merchant lock or purpose [F1], a loss rule for delegated purchases [F3.dispute_fee].", "公開資料中未找到：代理發卡 API、商戶鎖定或用途 [F1]、代理購買的損失規則 [F3.dispute_fee]。"), // NEEDS-REVIEW zh-HK
      label("The ask: a delegate API to make a single-use token with limit, expiry, merchant lock and purpose; revoke; signed card events; an audit export.", "我們的提議：代理 API，可發出附額度、到期、商戶鎖定及用途的一次性代碼；可撤銷；簽署的卡事件；審計匯出。"), // NEEDS-REVIEW zh-HK
      label("The same engine, credential and log run on any rail; only the rail adapter changes [F19].", "同一套規則引擎、憑證與紀錄可用於任何支付渠道，只需更換渠道接口 [F19]。"), // NEEDS-REVIEW zh-HK
      label("The sealed budget is already a verifiable credential with did:key identities [F19]; the agent-ID pilot uses DIDs and verifiable credentials [F8]. No claim about that pilot's results.", "已鎖定的預算本身已是使用 did:key 身份的可驗證憑證 [F19]；代理身份試驗採用 DID 及可驗證憑證 [F8]。不對該試驗結果作任何聲稱。"), // NEEDS-REVIEW zh-HK
    ],
    foot: label("A one-page proposal, not an HKT commitment. Not affiliated with HKT.", "一頁建議書，並非 HKT 的承諾；與 HKT 並無關連。"), // NEEDS-REVIEW zh-HK
  },
];

export const DM8 = {
  title: label("Model-only gate against the full pipeline", "純模型把關與完整流程比較"), // NEEDS-REVIEW zh-HK
  deeper: label("The full evidence screen has every metric, interval and limit.", "完整證據頁列出所有指標、區間及限制。"), // NEEDS-REVIEW zh-HK
  openFull: label("Open the evidence screen", "打開證據頁"), // NEEDS-REVIEW zh-HK
} as const;
