// Strings for the Wally primitives, character, PWA prompts and the style guide (phase A). Additive: nothing here
// replaces strings.ts. Vocabulary: budget, rules, Seal, one-off card, "Stopped before paying", "Needs your OK",
// Receipts, Proof; the person is "you", the assistant is Wally. No digits here: figures go through the formatter.
// Every zh-HK line is a draft and marked NEEDS-REVIEW for the native read.
import { label } from "./label";

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

  // Lane b-proof: #/receipts. Placeholders in braces are filled with figure elements ({shop} stays text).
  receipts: {
    title: label("Receipts", "收據"), // NEEDS-REVIEW
    lead: label("Every decision Wally makes is a signed receipt.", "Wally 每個決定都有一張已簽署的收據。"), // NEEDS-REVIEW
    filterLabel: label("Show", "顯示"), // NEEDS-REVIEW
    all: label("All", "全部"), // NEEDS-REVIEW
    approved: label("Approved", "已批准"), // NEEDS-REVIEW
    stopped: label("Stopped", "已攔截"), // NEEDS-REVIEW
    needsOk: label("Needs OK", "待確認"), // NEEDS-REVIEW
    cards: label("Cards", "卡"), // NEEDS-REVIEW
    today: label("Today", "今日"), // NEEDS-REVIEW
    yesterday: label("Yesterday", "昨日"), // NEEDS-REVIEW
    emptyTitle: label("No receipts yet", "未有收據"), // NEEDS-REVIEW
    emptyBody: label("When Wally decides on a purchase, its signed receipt shows up here.", "Wally 每次決定買或不買，已簽署的收據都會在這裡出現。"), // NEEDS-REVIEW
    emptyFilter: label("No receipts of this kind yet", "暫時沒有這類收據"), // NEEDS-REVIEW
    showAll: label("Show all receipts", "顯示全部收據"), // NEEDS-REVIEW
    loading: label("Loading receipts", "正在載入收據"), // NEEDS-REVIEW
    stateSealed: label("Rules signed", "規則已簽署"), // NEEDS-REVIEW
    stateApproved: label("Approved", "已批准"), // NEEDS-REVIEW
    stateStopped: label("Stopped before paying", "付款前已攔截"), // NEEDS-REVIEW
    stateNeedsOk: label("Needs your OK", "需要你確認"), // NEEDS-REVIEW
    stateCardMade: label("One-off card", "一次性卡"), // NEEDS-REVIEW
    statePaid: label("Paid", "已付款"), // NEEDS-REVIEW
    stateDeclined: label("Charge declined", "扣款被拒"), // NEEDS-REVIEW
    stateVoided: label("Card cancelled", "卡已取消"), // NEEDS-REVIEW
    stateCardExpired: label("Card expired", "卡已過期"), // NEEDS-REVIEW
    stateRevoked: label("Rules revoked", "規則已撤銷"), // NEEDS-REVIEW
    stateExpired: label("Budget ended", "預算已完結"), // NEEDS-REVIEW
    titleSealed: label("Budget sealed", "預算已鎖定"), // NEEDS-REVIEW
    titleCardFor: label("One-off card for {shop}", "{shop} 的一次性卡"), // NEEDS-REVIEW
    titlePaid: label("Paid at {shop}", "已在 {shop} 付款"), // NEEDS-REVIEW
    titleDeclined: label("Charge declined at {shop}", "{shop} 扣款被拒"), // NEEDS-REVIEW
    titleVoided: label("One-off card cancelled", "一次性卡已取消"), // NEEDS-REVIEW
    titleCardExpired: label("One-off card expired unused", "一次性卡未用已過期"), // NEEDS-REVIEW
    titleRevoked: label("You revoked your rules", "你已撤銷規則"), // NEEDS-REVIEW
    titleExpired: label("Your budget ended", "你的預算已完結"), // NEEDS-REVIEW
    moreItems: label("and {n} more", "及另外 {n} 件"), // NEEDS-REVIEW
    declineOverLimit: label("The shop asked for more than the card allows. The limit held.", "商戶要求的金額超出卡額，上限守住了。"), // NEEDS-REVIEW
    declineCardUsed: label("The card was already used. It works once.", "此卡已用過，只可用一次。"), // NEEDS-REVIEW
    declineCardVoided: label("The card had been cancelled.", "此卡已取消。"), // NEEDS-REVIEW
    declineCardExpired: label("The card had expired.", "此卡已過期。"), // NEEDS-REVIEW
    declineUnknownCard: label("The card was not recognised.", "無法識別此卡。"), // NEEDS-REVIEW
    declineMerchant: label("A different shop tried to charge it.", "另一間商戶嘗試扣款。"), // NEEDS-REVIEW
    declineOther: label("The rail declined the charge.", "發卡層拒絕了扣款。"), // NEEDS-REVIEW
    bodyApproved: label("Approved. A one-off card for exactly {amount} can be made.", "已批准，可發出剛好 {amount} 的一次性卡。"), // NEEDS-REVIEW
    bodySealed: label("You sealed a budget of {amount} and signed your rules.", "你鎖定了 {amount} 的預算並簽署了規則。"), // NEEDS-REVIEW
    bodyCardMade: label("A one-off card with a limit of exactly {amount}. It works once.", "一次性卡，額度剛好 {amount}，只可用一次。"), // NEEDS-REVIEW
    bodyPaid: label("The shop charged {amount} on the one-off card.", "商戶以一次性卡扣款 {amount}。"), // NEEDS-REVIEW
    bodyVoided: label("The unused card was cancelled. Its money is back in your budget.", "未用的卡已取消，款項已回到你的預算。"), // NEEDS-REVIEW
    bodyCardExpired: label("The card was not used in time, so it expired. Its money is back in your budget.", "此卡未在時限內使用，已過期，款項已回到你的預算。"), // NEEDS-REVIEW
    bodyRevoked: label("Your rules no longer let Wally buy anything. Unused cards were cancelled.", "你的規則已不再容許 Wally 購物，未用的卡已取消。"), // NEEDS-REVIEW
    bodyExpired: label("Your budget reached its end date. Wally cannot buy with it any more.", "你的預算已到期，Wally 不能再用它購物。"), // NEEDS-REVIEW
    resolves: label("This closes an earlier receipt.", "這張收據了結了較早的一張。"), // NEEDS-REVIEW
    seeEarlier: label("See the earlier receipt", "查看較早的收據"), // NEEDS-REVIEW
    moneyTitle: label("Money", "金額"), // NEEDS-REVIEW
    subtotal: label("Subtotal", "小計"), // NEEDS-REVIEW
    shipping: label("Shipping", "運費"), // NEEDS-REVIEW
    fees: label("Fees", "手續費"), // NEEDS-REVIEW
    fxFee: label("FX fee", "匯兌費"), // NEEDS-REVIEW
    total: label("Total", "總額"), // NEEDS-REVIEW
    checksTitle: label("What Wally checked", "Wally 檢查了甚麼"), // NEEDS-REVIEW
    checkPass: label("Passed", "通過"), // NEEDS-REVIEW
    checkStop: label("Stopped here", "在此攔截"), // NEEDS-REVIEW
    checkAsk: label("Asked you", "要你確認"), // NEEDS-REVIEW
    rulesNotAi: label("Fixed rules decided this, not the AI.", "由固定規則決定，不是 AI。"), // NEEDS-REVIEW
    openInWally: label("Open in Wally", "在 Wally 打開"), // NEEDS-REVIEW
    details: label("Details", "詳情"), // NEEDS-REVIEW
    detailsRule: label("Rule", "規則"), // NEEDS-REVIEW
    detailsResult: label("Result", "結果"), // NEEDS-REVIEW
    rawEntry: label("Raw entry", "原始紀錄"), // NEEDS-REVIEW
    rawNote: label("As signed, pretty-printed. The card handle is hidden here.", "按簽署內容排版顯示，卡的內部代號已隱藏。"), // NEEDS-REVIEW
    entryHash: label("Entry hash", "紀錄雜湊"), // NEEDS-REVIEW
    prevHash: label("Previous hash", "上一筆雜湊"), // NEEDS-REVIEW
    signature: label("Signature", "簽署"), // NEEDS-REVIEW
    signer: label("Signed by", "簽署者"), // NEEDS-REVIEW
    receiptNo: label("Receipt", "收據"), // NEEDS-REVIEW
    rules: {
      R1: label("Your signed rules are genuine", "你簽署的規則真確"), // NEEDS-REVIEW
      R2: label("Your rules are still active", "你的規則仍然有效"), // NEEDS-REVIEW
      R3: label("Fits the budget left", "未超出剩餘預算"), // NEEDS-REVIEW
      R4: label("Under your per-purchase limit", "未超出每次購買上限"), // NEEDS-REVIEW
      R5: label("Under the card ceiling", "未超出卡額上限"), // NEEDS-REVIEW
      R6: label("A shop and category you allow", "屬你允許的商戶及類別"), // NEEDS-REVIEW
      R7: label("Not too many cards in a short time", "短時間內沒有發太多卡"), // NEEDS-REVIEW
      R8: label("Not too many cards open at once", "同時有效的卡不算多"), // NEEDS-REVIEW
      R9: label("Seller checked against scam reports", "已查核賣家詐騙紀錄"), // NEEDS-REVIEW
      R9NoRecord: label("No scam record found for the seller (not proof of safety)", "賣家查無詐騙紀錄（不代表安全）"), // NEEDS-REVIEW
      R10scope: label("The item fits what you asked for", "貨品符合你的要求"), // NEEDS-REVIEW
      R10injection: label("The listing text gives no orders", "商品文字沒有夾帶指令"), // NEEDS-REVIEW
      R10seller: label("The seller looks low risk", "賣家風險低"), // NEEDS-REVIEW
      R10escalate: label("Nothing needed your OK", "沒有需要你確認的地方"), // NEEDS-REVIEW
      R10: label("The judge read the listing", "判斷器已閱讀商品頁"), // NEEDS-REVIEW
      R11: label("You answered in time", "你及時回覆"), // NEEDS-REVIEW
      R12: label("The price held at checkout", "結帳時價格不變"), // NEEDS-REVIEW
    },
  },

  // Lane b-proof: #/evidence ("Why trust Wally?"). Figures stay in the evidence components with their chips.
  evidenceUi: {
    title: label("Why trust Wally?", "為甚麼可以信任 Wally？"), // NEEDS-REVIEW
    lead: label("Results from our own test runs, with every count, interval and limit. Lower is better on every rate.", "我們自己測試運行的結果，列出每個數目、區間及限制。每個比率都是越低越好。"), // NEEDS-REVIEW
    back: label("Proof", "證明"), // NEEDS-REVIEW
    headlineTitle: label("In this run, the full pipeline against a model-only gate", "今次運行：完整流程對比純模型把關"), // NEEDS-REVIEW
    headlineNote: label("Where the full pipeline is worse is shown as plainly as where it is better.", "完整流程較差的地方，會和較好的地方一樣清楚列出。"), // NEEDS-REVIEW
    acceptanceShort: label("Targets", "目標"), // NEEDS-REVIEW
    numbersTitle: label("The numbers", "數字"), // NEEDS-REVIEW
    judgeSection: label("The judge on its own", "判斷器本身"), // NEEDS-REVIEW
    humanSection: label("By hand, and seen with our own eyes", "人手操作及親眼所見"), // NEEDS-REVIEW
    showing: label("Showing", "顯示"), // NEEDS-REVIEW
  },

  // Lane b-proof: #/presenter (stage and booth big screen). Placeholders in braces take figure elements.
  presenterUi: {
    controls: label("Presenter controls", "講者控制"), // NEEDS-REVIEW
    step: label("Step", "下一步"), // NEEDS-REVIEW
    skip: label("Skip", "略過"), // NEEDS-REVIEW
    reset: label("Reset", "重設"), // NEEDS-REVIEW
    mode: label("Mode", "模式"), // NEEDS-REVIEW
    simulated: label("SIMULATED", "模擬"), // NEEDS-REVIEW
    real: label("REAL", "真實"), // NEEDS-REVIEW
    realOff: label("no capture yet", "未有擷取紀錄"), // NEEDS-REVIEW
    language: label("Language", "語言"), // NEEDS-REVIEW
    both: label("Both", "雙語"), // NEEDS-REVIEW
    end: label("End of script", "腳本完結"), // NEEDS-REVIEW
    next: label("Next", "下一步"), // NEEDS-REVIEW
    shortcuts: label("Space or Right arrow: next step. R: reset.", "空白鍵或右方向鍵：下一步。R：重設。"), // NEEDS-REVIEW
    ready: label("Ready. Step seals the budget.", "準備好。按「下一步」鎖定預算。"), // NEEDS-REVIEW
    budgetLeft: label("Budget left", "預算剩餘"), // NEEDS-REVIEW
    ofBudget: label("of {amount}", "總額 {amount}"), // NEEDS-REVIEW
    held: label("Held on cards", "卡上預留"), // NEEDS-REVIEW
    spent: label("Spent", "已使用"), // NEEDS-REVIEW
    cardsTitle: label("One-off cards", "一次性卡"), // NEEDS-REVIEW
    noCards: label("No card yet. A card exists only after an approval.", "未有卡。獲批後才會發卡。"), // NEEDS-REVIEW
    cardOnce: label("Works once, for {amount} only", "只可用一次，限 {amount}"), // NEEDS-REVIEW
    cardActive: label("Ready to use", "可以使用"), // NEEDS-REVIEW
    cardUsed: label("Used", "已使用"), // NEEDS-REVIEW
    cardVoided: label("Cancelled", "已取消"), // NEEDS-REVIEW
    cardExpired: label("Expired", "已過期"), // NEEDS-REVIEW
    sealedTitle: label("Budget sealed", "預算已鎖定"), // NEEDS-REVIEW
    sealedBody: label("You signed these rules. Fixed rules, not the AI, decide every purchase.", "你簽署了這些規則。每次購買都由固定規則決定，不是 AI。"), // NEEDS-REVIEW
    yourWords: label("In your words", "你的原話"), // NEEDS-REVIEW
    ruleBudget: label("Budget {amount}", "預算 {amount}"), // NEEDS-REVIEW
    ruleCategories: label("Only these kinds of things", "只限這些類別"), // NEEDS-REVIEW
    ruleSellers: label("Sellers checked against scam reports first", "賣家先查核詐騙紀錄"), // NEEDS-REVIEW
    ruleCap: label("Each purchase at most {amount}", "每次購買最多 {amount}"), // NEEDS-REVIEW
    ruleAsk: label("Asks you above {amount}", "超過 {amount} 要你確認"), // NEEDS-REVIEW
    ruleUntil: label("Valid until {time} (Hong Kong time)", "有效至 {time}（香港時間）"), // NEEDS-REVIEW
    shopping: label("Wally is shopping", "Wally 正在幫你買"), // NEEDS-REVIEW
    madeCard: label("Wally made a one-off card", "Wally 已發出一次性卡"), // NEEDS-REVIEW
    stopped: label("Stopped before paying", "付款前已攔截"), // NEEDS-REVIEW
    needsOk: label("Needs your OK", "需要你確認"), // NEEDS-REVIEW
    failedRun: label("Something failed, so nothing was bought. No card was made.", "過程出錯，所以沒有購買，也沒有發卡。"), // NEEDS-REVIEW
    noCardMade: label("No card was made. Nothing can be charged.", "沒有發卡，不會有任何扣款。"), // NEEDS-REVIEW
    exactly: label("A one-off card for exactly {amount}", "剛好 {amount} 的一次性卡"), // NEEDS-REVIEW
    atCheckout: label("At checkout", "結帳時"), // NEEDS-REVIEW
    beatPaid: label("Paid {amount}: exactly the card limit.", "已扣款 {amount}，剛好是卡額。"), // NEEDS-REVIEW
    beatRetry: label("The reply timed out; the retry used the same key, so the rail charged once: {amount}.", "回覆逾時；重試用同一個鍵，發卡層只扣款一次：{amount}。"), // NEEDS-REVIEW
    beatTried: label("The shop tried {amount}.", "商戶嘗試扣款 {amount}。"), // NEEDS-REVIEW
    beatVoided: label("Card cancelled. The budget gets its limit back.", "卡已取消，額度退回預算。"), // NEEDS-REVIEW
    beatExpired: label("Card expired unused. The budget gets its limit back.", "卡未用已過期，額度退回預算。"), // NEEDS-REVIEW
    proofTitle: label("Receipts and proof", "收據及證明"), // NEEDS-REVIEW
    latest: label("Latest receipts", "最新收據"), // NEEDS-REVIEW
    realTitle: label("The one real card decline", "唯一一次真實卡拒絕"), // NEEDS-REVIEW
    realCode: label("Decline code", "拒絕代碼"), // NEEDS-REVIEW
    realNote: label("Replayed from the real-card test: read only, redacted, never a live rail.", "重播真卡測試：只讀、已遮蓋，絕非真實發卡層。"), // NEEDS-REVIEW
    deck: label("Slides carry this beat.", "此環節由投影片展示。"), // NEEDS-REVIEW
  },

  // Lane b-proof: #/proof. The reason lines copy the offline verifier page's wording (apps/verifier/src/reasons.ts).
  proof: {
    title: label("Proof", "證明"), // NEEDS-REVIEW
    lead: label("Check that no receipt changed after it was signed.", "檢查收據簽署後有沒有被改動。"), // NEEDS-REVIEW
    idleTitle: label("Ready to check {n} receipts", "準備檢查 {n} 張收據"), // NEEDS-REVIEW
    idleBody: label("Each receipt is signed and linked to the one before it.", "每張收據都已簽署，並連住上一張。"), // NEEDS-REVIEW
    verify: label("Verify receipts", "驗證收據"), // NEEDS-REVIEW
    verifyAgain: label("Verify again", "再驗證"), // NEEDS-REVIEW
    checking: label("Checking every receipt", "正在檢查每張收據"), // NEEDS-REVIEW
    passTitle: label("Receipts verified.", "收據已驗證。"), // NEEDS-REVIEW
    passBody: label("{n} entries, all intact.", "{n} 筆紀錄，全部完整。"), // NEEDS-REVIEW
    passHere: label("Checked on this device.", "已在此裝置驗證。"), // NEEDS-REVIEW
    passServer: label("Checked by the booth server. You can check again yourself with the offline verifier.", "由攤位伺服器檢查。你可以用離線驗證器自己再查。"), // NEEDS-REVIEW
    stale: label("New receipts since this check. Verify again to include them.", "檢查後有新收據，請再驗證。"), // NEEDS-REVIEW
    head: label("Latest receipt", "最新收據"), // NEEDS-REVIEW
    checkpointMatch: label("matches the saved checkpoint", "與已儲存的檢查點相符"), // NEEDS-REVIEW
    checkpointMismatch: label("does not match the saved checkpoint", "與已儲存的檢查點不符"), // NEEDS-REVIEW
    checkpointNone: label("no saved checkpoint to compare yet", "未有已儲存的檢查點可比較"), // NEEDS-REVIEW
    failTitle: label("Broken at receipt {seq}", "第 {seq} 張收據出錯"), // NEEDS-REVIEW
    failUnknown: label("This receipt failed a check this screen does not know yet.", "這張收據未通過一項本畫面未認識的檢查。"), // NEEDS-REVIEW
    failAfter: label("Receipts after it are not checked: a break stops the chain.", "之後的收據不會再檢查：斷開後整條鏈都不可信。"), // NEEDS-REVIEW
    code: label("Code", "代碼"), // NEEDS-REVIEW
    changed: label("In the copy, {what} went from {before} to {after}.", "副本中，{what}由 {before} 改成 {after}。"), // NEEDS-REVIEW
    changedRaw: label("In the copy, {what} changed.", "副本中，{what}被改動。"), // NEEDS-REVIEW
    fieldTotal: label("the cart total of receipt {seq}", "第 {seq} 張收據的購物車總額"), // NEEDS-REVIEW
    fieldLimit: label("the card limit of receipt {seq}", "第 {seq} 張收據的卡額"), // NEEDS-REVIEW
    fieldAmount: label("the amount charged on receipt {seq}", "第 {seq} 張收據的扣款金額"), // NEEDS-REVIEW
    fieldBudget: label("the budget on receipt {seq}", "第 {seq} 張收據的預算"), // NEEDS-REVIEW
    fieldOther: label("a value on receipt {seq}", "第 {seq} 張收據的一個數值"), // NEEDS-REVIEW
    tamperedNote: label("You are looking at a tampered copy. Your stored receipts are untouched.", "你正在看被竄改的副本，已儲存的收據原封不動。"), // NEEDS-REVIEW
    tamper: label("Try to tamper", "試吓竄改"), // NEEDS-REVIEW
    tamperHint: label("Changes one digit in a copy, then checks the copy.", "在副本改一個數字，然後檢查副本。"), // NEEDS-REVIEW
    restore: label("Restore", "還原"), // NEEDS-REVIEW
    restoreHint: label("Puts the original back and checks again.", "換回原本的收據，再檢查一次。"), // NEEDS-REVIEW
    checked: label("Checked", "已檢查"), // NEEDS-REVIEW
    notChecked: label("Not checked in this mode", "此模式未檢查"), // NEEDS-REVIEW
    how: label("How is this checked?", "怎樣檢查？"), // NEEDS-REVIEW
    openVerifier: label("Open the offline verifier", "打開離線驗證器"), // NEEDS-REVIEW
    exportReceipts: label("Export receipts", "匯出收據"), // NEEDS-REVIEW
    exportTitle: label("Export for the offline verifier", "匯出給離線驗證器"), // NEEDS-REVIEW
    exportBody: label("Three files, one for each box on the verifier page. The stored receipts, never a tampered copy.", "三個檔案，對應驗證頁的三個欄位。匯出的是已儲存的收據，不會是竄改副本。"), // NEEDS-REVIEW
    exportLog: label("Receipts (log, JSONL)", "收據（紀錄，JSONL）"), // NEEDS-REVIEW
    exportKeys: label("Public keys (JSON)", "公鑰（JSON）"), // NEEDS-REVIEW
    exportCheckpoint: label("Checkpoint (JSON)", "檢查點（JSON）"), // NEEDS-REVIEW
    exportFailed: label("Export did not work. Try again.", "匯出失敗，請再試。"), // NEEDS-REVIEW
    whyTrust: label("Why trust Wally?", "為甚麼可以信任 Wally？"), // NEEDS-REVIEW
    railSimulated: label("The rail is SIMULATED.", "發卡層為模擬。"), // NEEDS-REVIEW
    demoKeyServer: label("Demo shortcut: the booth server holds your demo key and signs for you. A real deployment keeps that key on your phone.", "示範捷徑：攤位伺服器持有你的示範金鑰並代你簽署。正式使用時，金鑰會留在你的手機。"), // NEEDS-REVIEW
    demoKeyDevice: label("Demo shortcut: this page holds every demo key, yours included. A real deployment keeps your key apart, on your phone.", "示範捷徑：此頁持有所有示範金鑰，包括你的。正式使用時，你的金鑰會分開存放在你的手機。"), // NEEDS-REVIEW
    emptyTitle: label("Nothing to check yet", "未有可檢查的收據"), // NEEDS-REVIEW
    emptyBody: label("Receipts appear after Wally's first decision.", "Wally 作出第一個決定後就會有收據。"), // NEEDS-REVIEW
    chainLabel: label("Receipt chain", "收據鏈"), // NEEDS-REVIEW
    howTitle: label("How is this checked?", "怎樣檢查？"), // NEEDS-REVIEW
    howChainTitle: label("A chain of receipts", "一條收據鏈"), // NEEDS-REVIEW
    howChainBody: label("Each receipt carries the fingerprint (hash) of the one before it. Change one byte anywhere and every fingerprint after it stops matching. Edits, reordering and missing receipts all show.", "每張收據都帶有上一張的指紋（雜湊）。任何地方改動一個位元組，之後的指紋全部對不上。改動、調換次序或缺少收據都會被發現。"), // NEEDS-REVIEW
    howSignTitle: label("Signatures", "簽署"), // NEEDS-REVIEW
    howSignBody: label("The rules engine signs every receipt with its key. Your rules, revokes and OKs carry your signature. A receipt nobody signed fails.", "規則引擎用自己的金鑰簽署每張收據；你的規則、撤銷及確認都帶有你的簽署。沒有簽署的收據不會通過。"), // NEEDS-REVIEW
    howKeysTitle: label("Who holds which key", "誰持有哪條金鑰"), // NEEDS-REVIEW
    howKeysBody: label("The engine key signs receipts. Your key signs your rules. Only public keys are needed to check.", "引擎金鑰簽署收據；你的金鑰簽署你的規則。檢查只需要公鑰。"), // NEEDS-REVIEW
    howCheckpointTitle: label("The saved checkpoint", "已儲存的檢查點"), // NEEDS-REVIEW
    howCheckpointBody: label("The latest fingerprint is saved apart from the receipts, so cutting receipts off the end is caught too.", "最新的指紋與收據分開儲存，所以從尾部刪走收據也會被發現。"), // NEEDS-REVIEW
    howNotTitle: label("What it does not prove", "這不能證明甚麼"), // NEEDS-REVIEW
    howNotBody: label("It does not prove the shop delivered, that a price was fair, or that the model judged a listing well. It proves the receipts were not edited, reordered or cut short after they were written.", "這不能證明商戶已交貨、價錢合理，或模型對商品頁的判斷正確。它證明收據寫下後沒有被改動、調換次序或截短。"), // NEEDS-REVIEW
    howYourself: label("Check it yourself: the offline verifier runs in any browser with no network.", "你可以自己檢查：離線驗證器在任何瀏覽器都能運行，無需網絡。"), // NEEDS-REVIEW
    checks: {
      SCHEMA: label("format", "格式"), // NEEDS-REVIEW
      SEQ: label("order", "次序"), // NEEDS-REVIEW
      PREV_HASH: label("links", "連結"), // NEEDS-REVIEW
      PAYLOAD_HASH: label("contents", "內容"), // NEEDS-REVIEW
      ENTRY_HASH: label("headers", "標頭"), // NEEDS-REVIEW
      SIGNATURE: label("engine signatures", "引擎簽署"), // NEEDS-REVIEW
      PAYLOAD_SIGNATURE: label("your signatures", "你的簽署"), // NEEDS-REVIEW
      TRUNCATED: label("checkpoint", "檢查點"), // NEEDS-REVIEW
      KEYS: label("keys", "金鑰"), // NEEDS-REVIEW
      NO_DECISION: label("every card has an approval", "每張卡都有批准"), // NEEDS-REVIEW
      DUPLICATE: label("nothing used twice", "沒有重複使用"), // NEEDS-REVIEW
      CONSENT: label("your OKs", "你的確認"), // NEEDS-REVIEW
      OVERSPEND: label("money adds up", "金額相符"), // NEEDS-REVIEW
      AFTER_REVOKE: label("nothing after a revoke", "撤銷後沒有發卡"), // NEEDS-REVIEW
    },
    reasons: {
      SCHEMA: label("This entry is not in the log format: an unreadable line, a wrong field, or an entry in the wrong place.", "此紀錄不符合格式：無法讀取、欄位錯誤或位置不對。"), // NEEDS-REVIEW
      SEQ: label("Entries are missing, repeated or out of order.", "紀錄有缺失、重複或次序錯亂。"), // NEEDS-REVIEW
      PREV_HASH: label("The link to the previous entry is broken.", "與上一筆紀錄的連結已斷開。"), // NEEDS-REVIEW
      PAYLOAD_HASH: label("The content of this entry changed after it was written.", "此紀錄的內容於寫入後被改動。"), // NEEDS-REVIEW
      ENTRY_HASH: label("The header of this entry (time, kind, ids or hashes) changed after it was written.", "此紀錄的標頭（時間、類別、編號或雜湊）於寫入後被改動。"), // NEEDS-REVIEW
      SIGNATURE: label("The engine signature does not verify against a listed engine key.", "引擎簽署未能以已列出的引擎公鑰驗證。"), // NEEDS-REVIEW
      PAYLOAD_SIGNATURE: label("A delegator signature (mandate credential, revocation or escalation answer) does not verify, or names another mandate.", "委託人簽署（授權憑證、撤銷或升級回覆）未能驗證，或屬於另一份授權。"), // NEEDS-REVIEW
      TRUNCATED: label("The log does not reach or match the head checkpoint: it was cut short or rewritten.", "紀錄與最新檢查點不符：已被截短或改寫。"), // NEEDS-REVIEW
      KEYS: label("The public keys cannot anchor trust: no delegator key, or the delegator key is also an engine key. Nothing was checked.", "公鑰無法作為信任依據：沒有委託人公鑰，或委託人公鑰同時列為引擎公鑰。未有進行任何檢查。"), // NEEDS-REVIEW
      NO_DECISION: label("A card was minted or charged without an approval for it earlier in this log.", "此紀錄中沒有較早的批准，卻發出或扣款了一張卡。"), // NEEDS-REVIEW
      DUPLICATE: label("Something that may happen once happened twice: a decision id, a card for one approval, or one consent used again.", "只可發生一次的事發生了兩次：決定編號、同一批准的卡，或同一同意被再用。"), // NEEDS-REVIEW
      CONSENT: label("An approval claims the delegator's consent, but there is no signed, in-time yes from the delegator for this exact cart.", "此批准聲稱已得委託人同意，但沒有委託人就這個購物車及時簽署的同意。"), // NEEDS-REVIEW
      OVERSPEND: label("The money does not add up: a limit, a charge or the total goes past what was approved or sealed.", "金額不符：上限、扣款或總額超出已批准或封存的數目。"), // NEEDS-REVIEW
      AFTER_REVOKE: label("A card was minted after the mandate was revoked or expired.", "授權已撤銷或到期後仍發出了卡。"), // NEEDS-REVIEW
    },
  },

  simulated: label("Simulated. No money moves.", "模擬示範，沒有真錢轉移。"), // NEEDS-REVIEW
  simulatedShort: label("Simulated", "模擬"), // NEEDS-REVIEW
} as const;

export type UiKey = keyof typeof UI;
