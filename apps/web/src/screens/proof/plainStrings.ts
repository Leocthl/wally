// Plain-mode words for Proof and Receipts. Shared with the offline checker page: the event labels, the 14 reasons, the
// verdict and the row words come from one list, so both pages say the same thing. Placeholders in braces take elements
// ({n} a receipt number, {fp} the first characters of a fingerprint). No hash, JSON, seq, payload, engine, mandate,
// packet, mint, reason code or rule id appears here, apart from the two names the checker's own page uses (the saved
// checkpoint, and the signature in two reasons). Every zh-HK line is a draft for the native read.
import { label } from "../../i18n/label";

export const PLAIN = {
  lead: label("Every step Wally takes is written down as a receipt. Check that nobody changed one.", "Wally 的每一步都會寫成一張收據。檢查有沒有人改動過其中一張。"), // NEEDS-REVIEW
  checking: label("Checking your receipts", "正在檢查你的收據"), // NEEDS-REVIEW

  // The status card
  passTitle: label("All {n} receipts are untouched", "全部 {n} 張收據都完好無缺"), // NEEDS-REVIEW
  passTitleOne: label("Your receipt is untouched", "你的收據完好無缺"), // NEEDS-REVIEW
  passBody: label("Nothing was changed, removed or moved since Wally wrote them.", "自 Wally 寫下後，沒有任何收據被改動、刪走或調動。"), // NEEDS-REVIEW
  passBodyOne: label("Nothing was changed or removed since Wally wrote it.", "自 Wally 寫下後，這張收據沒有被改動或刪走。"), // NEEDS-REVIEW
  wherePhone: label("Checked on this phone just now.", "剛剛已在這部手機檢查。"), // NEEDS-REVIEW
  whereBooth: label("Checked by the booth laptop just now.", "剛剛由展位電腦檢查。"), // NEEDS-REVIEW
  skipSignatures: label("This demo mode does not check the signatures.", "此示範模式不檢查簽署。"), // NEEDS-REVIEW
  skipOther: label("Some checks do not run in this demo mode.", "此示範模式有些檢查不會執行。"), // NEEDS-REVIEW
  stale: label("New receipts since this check. Check again to include them.", "檢查後有新收據，請再檢查一次。"), // NEEDS-REVIEW
  idleTitle: label("{n} receipts, signed and linked", "{n} 張收據，已簽署並連在一起"), // NEEDS-REVIEW
  idleTitleOne: label("{n} receipt, signed", "{n} 張收據，已簽署"), // NEEDS-REVIEW
  idleBody: label("Check that none changed.", "檢查有沒有任何一張被改動。"), // NEEDS-REVIEW
  idleBodyOne: label("Check that it did not change.", "檢查它有沒有被改動。"), // NEEDS-REVIEW
  check: label("Check receipts", "檢查收據"), // NEEDS-REVIEW
  checkAgain: label("Check again", "再檢查"), // NEEDS-REVIEW
  failTitle: label("Receipt {n} was changed", "第 {n} 張收據被改動"), // NEEDS-REVIEW
  failUnknown: label("This receipt failed a check this screen does not know yet.", "這張收據未通過一項本畫面未認識的檢查。"), // NEEDS-REVIEW
  failBefore: label("Receipts before it are untouched.", "它之前的收據完好。"), // NEEDS-REVIEW
  failAfter: label("Receipts after it were not checked, because one change breaks the rest.", "之後的收據不會再檢查，因為一處改動會令之後的都不可信。"), // NEEDS-REVIEW

  // The timeline
  timelineTitle: label("Your receipts, in order", "你的收據，按次序"), // NEEDS-REVIEW
  receiptNo: label("Receipt {n}", "第 {n} 張收據"), // NEEDS-REVIEW (the same words as RECEIPT_NO in receiptNo.ts, which Home uses without this table; a test pins them equal)
  untouched: label("Untouched", "完好"), // NEEDS-REVIEW
  changed: label("Changed", "已被改動"), // NEEDS-REVIEW
  notChecked: label("Not checked", "未檢查"), // NEEDS-REVIEW
  showDetails: label("Show the details", "顯示詳情"), // NEEDS-REVIEW
  detailNumber: label("This is receipt {n}.", "這是第 {n} 張收據。"), // NEEDS-REVIEW
  detailLocked: label("Locked to receipt {n} by its fingerprint {fp}.", "以指紋 {fp} 鎖定在第 {n} 張收據上。"), // NEEDS-REVIEW
  detailFirst: label("It is the first receipt, so nothing comes before it.", "這是第一張收據，之前沒有其他收據。"), // NEEDS-REVIEW
  detailWritten: label("Written at {time}, Hong Kong time.", "寫於 {time}（香港時間）。"), // NEEDS-REVIEW
  detailSignedWally: label("Signed by Wally. Key ending {key}.", "由 Wally 簽署。金鑰尾碼 {key}。"), // NEEDS-REVIEW
  detailSignedBoth: label("Signed by Wally, and also by you. Key ending {key}.", "由 Wally 簽署，亦由你簽署。金鑰尾碼 {key}。"), // NEEDS-REVIEW
  detailFailed: label("The check that failed: {code}", "未通過的檢查：{code}"), // NEEDS-REVIEW

  // The changed copy, flagged wherever it is on screen
  bannerTitle: label("You are looking at a changed copy of the receipts. The stored originals are untouched.", "你正在看收據的已改動副本。已儲存的原本收據原封不動。"), // NEEDS-REVIEW
  bannerRestore: label("Restore the original", "還原原本的收據"), // NEEDS-REVIEW
  bannerChange: label("On receipt {n}, {what} went from {before} to {after}.", "第 {n} 張收據的{what}由 {before} 改成 {after}。"), // NEEDS-REVIEW
  bannerChangeRaw: label("On receipt {n}, {what} was changed.", "第 {n} 張收據的{what}被改動。"), // NEEDS-REVIEW
  sheetChanged: label("This receipt was changed in the copy you are looking at. The stored original is untouched.", "這張收據在你正在看的副本中被改動。已儲存的原本收據原封不動。"), // NEEDS-REVIEW

  // Try changing one receipt
  tamper: label("Try changing one receipt", "試改動一張收據"), // NEEDS-REVIEW
  tamperHint: label("We change one digit in a copy, then check the copy. Your real receipts are never touched.", "我們在副本改動一個數字，再檢查副本。你真正的收據絕不會被改動。"), // NEEDS-REVIEW
  restore: label("Put it back", "還原"), // NEEDS-REVIEW
  restoreHint: label("Puts the original back and checks again.", "換回原本的收據，再檢查一次。"), // NEEDS-REVIEW
  explain: label("We changed {what} on receipt {n} in a copy, from {before} to {after}, and the check caught it, because each receipt is locked to the one before it. Your real receipts were not touched.", "我們在副本中把第 {n} 張收據的{what}由 {before} 改成 {after}，檢查即時發現，因為每張收據都與上一張鎖在一起。你真正的收據原封不動。"), // NEEDS-REVIEW
  explainRaw: label("We changed {what} on receipt {n} in a copy, and the check caught it, because each receipt is locked to the one before it. Your real receipts were not touched.", "我們在副本中改動了第 {n} 張收據的{what}，檢查即時發現，因為每張收據都與上一張鎖在一起。你真正的收據原封不動。"), // NEEDS-REVIEW
  fields: {
    total: label("the cart total", "購物車總額"), // NEEDS-REVIEW
    limit: label("the card limit", "卡額"), // NEEDS-REVIEW
    amount: label("the amount charged", "扣款金額"), // NEEDS-REVIEW
    budget: label("the budget", "預算"), // NEEDS-REVIEW
    other: label("a value", "一個數值"), // NEEDS-REVIEW
  },

  // Links and footer
  openChecker: label("Open the offline checker", "打開離線檢查器"), // NEEDS-REVIEW
  saveCopy: label("Save a copy of the receipts", "儲存收據副本"), // NEEDS-REVIEW
  demoKeyServer: label("Demo shortcut: the booth laptop signs for you here. In a real version your signing key stays on your phone.", "示範捷徑：這裡由展位電腦代你簽署。正式版本中，你的簽署金鑰會留在你的手機。"), // NEEDS-REVIEW
  demoKeyDevice: label("Demo shortcut: this page holds every demo key, yours included. In a real version your key stays on your phone.", "示範捷徑：此頁持有所有示範金鑰，包括你的。正式版本中，你的金鑰會留在你的手機。"), // NEEDS-REVIEW

  // How is this checked?
  how: {
    lockTitle: label("Each receipt is locked to the one before it", "每張收據都鎖在上一張之上"), // NEEDS-REVIEW
    lockBody: label("Change a single digit on one receipt and the lock on the next one no longer fits. Edits, swapped order and missing receipts all show.", "只要改動其中一張的一個數字，下一張的鎖就對不上。改動、調換次序或缺少收據，全部都會被發現。"), // NEEDS-REVIEW
    signTitle: label("Wally signs, and you sign your choices", "Wally 簽署，你簽署自己的決定"), // NEEDS-REVIEW
    signBody: label("Wally signs every receipt. You sign your own choices: your budget rules, a cancellation and each OK. A receipt nobody signed fails the check.", "Wally 簽署每一張收據；你的預算規則、取消預算和每次確認，則由你簽署。沒有人簽署的收據通不過檢查。"), // NEEDS-REVIEW
    endTitle: label("Receipts cut off the end are noticed too", "從尾部刪走收據也會被發現"), // NEEDS-REVIEW
    endBody: label("Wally also keeps a note of the newest receipt, apart from the list. If receipts are cut off the end, the note no longer matches.", "Wally 另外記下最新一張收據，與收據清單分開存放。如果尾部的收據被刪走，記錄就會對不上。"), // NEEDS-REVIEW
    yourself: label("Check it yourself: the offline checker runs in any browser with no network.", "你可以自己檢查：離線檢查器在任何瀏覽器都能運行，無需網絡。"), // NEEDS-REVIEW
  },

  // Save a copy of the receipts (the files the offline checker takes)
  save: {
    title: label("Save the receipts", "儲存收據"), // NEEDS-REVIEW
    body: label("Three files for the offline checker, one for each box on its page. They are your real receipts, never the changed copy.", "三個檔案給離線檢查器，對應它頁面上的三個欄位。這些是你真正的收據，絕不是改動過的副本。"), // NEEDS-REVIEW
    receipts: label("Receipts file", "收據檔案"), // NEEDS-REVIEW
    keys: label("Public keys file", "公開金鑰檔案"), // NEEDS-REVIEW
    checkpoint: label("Saved checkpoint file", "已儲存檢查點檔案"), // NEEDS-REVIEW
    failed: label("Saving did not work. Try again.", "儲存失敗，請再試。"), // NEEDS-REVIEW
    parent: label("Mum's budget file", "媽媽的預算檔案"), // NEEDS-REVIEW
    parentNote: label("Mum's budget is checked when yours is sealed. It is not in the receipts, so the offline checker cannot check this link. Open this file to read Mum's rules.", "媽媽的預算在鎖定你的預算時已檢查，並不在收據之內，所以離線檢查器檢查不到這個連結。打開此檔案可查看媽媽的規則。"), // NEEDS-REVIEW
  },

  // One label for each kind of receipt
  events: {
    sealed: label("Budget sealed", "預算已鎖定"), // NEEDS-REVIEW
    approved: label("Approved", "已批准"), // NEEDS-REVIEW
    youSaidYes: label("You said yes", "你已批准"), // NEEDS-REVIEW
    stopped: label("Stopped before paying", "付款前已攔截"), // NEEDS-REVIEW
    youSaidNo: label("You said no", "你已拒絕"), // NEEDS-REVIEW
    noAnswer: label("No answer in time", "未有及時回覆"), // NEEDS-REVIEW
    priceChanged: label("Price changed at checkout", "結帳時價格有變"), // NEEDS-REVIEW
    asked: label("Wally asked for your OK", "Wally 請你確認"), // NEEDS-REVIEW
    cardMade: label("One-off card made", "已發出一次性卡"), // NEEDS-REVIEW
    charged: label("Charged", "已扣款"), // NEEDS-REVIEW
    declined: label("Charge declined", "扣款被拒"), // NEEDS-REVIEW
    voided: label("Card cancelled", "卡已取消"), // NEEDS-REVIEW
    cardExpired: label("Card expired", "卡已過期"), // NEEDS-REVIEW
    revoked: label("You cancelled the budget", "你已取消預算"), // NEEDS-REVIEW
    ended: label("Budget ended", "預算已到期"), // NEEDS-REVIEW
    other: label("A receipt", "一張收據"), // NEEDS-REVIEW
  },

  // Why a receipt failed, one sentence per code
  reasons: {
    SCHEMA: label("This receipt is not written the way Wally writes them, or is in the wrong place.", "這張收據的寫法不是 Wally 的格式，或位置不對。"), // NEEDS-REVIEW
    SEQ: label("Some receipts are missing, repeated or out of order.", "有收據缺失、重複或次序錯亂。"), // NEEDS-REVIEW
    PREV_HASH: label("This receipt no longer fits the one before it.", "這張收據與上一張對不上。"), // NEEDS-REVIEW
    PAYLOAD_HASH: label("What this receipt says was changed after it was written.", "這張收據的內容在寫下後被改動。"), // NEEDS-REVIEW
    ENTRY_HASH: label("The label on this receipt (its time or ids) was changed after it was written.", "這張收據的標示（時間或編號）在寫下後被改動。"), // NEEDS-REVIEW
    SIGNATURE: label("Wally's signature on this receipt is not valid.", "這張收據上 Wally 的簽署無效。"), // NEEDS-REVIEW
    PAYLOAD_SIGNATURE: label("Your signature (on the budget rules, a cancellation or an OK) is not valid, or belongs to another budget.", "你的簽署（預算規則、取消預算或確認）無效，或屬於另一個預算。"), // NEEDS-REVIEW
    TRUNCATED: label("Receipts are missing from the end, or were rewritten: the list does not match the saved checkpoint.", "收據在尾部缺失或被改寫：與已儲存的檢查點不符。"), // NEEDS-REVIEW
    KEYS: label("The keys given cannot be trusted, so nothing was checked.", "所給的金鑰不可信，所以沒有檢查任何東西。"), // NEEDS-REVIEW
    NO_DECISION: label("A card was made or charged with no earlier approval for it.", "有卡在沒有較早批准的情況下發出或扣款。"), // NEEDS-REVIEW
    DUPLICATE: label("Something that can only happen once happened twice.", "只可發生一次的事發生了兩次。"), // NEEDS-REVIEW
    CONSENT: label("Wally went ahead without your signed OK where one was needed.", "需要你簽署確認的地方，Wally 沒有取得就繼續。"), // NEEDS-REVIEW
    OVERSPEND: label("The money does not add up: a card or charge went past what was approved or what the budget allows.", "金額不符：有卡或扣款超出已批准或預算容許的數目。"), // NEEDS-REVIEW
    AFTER_REVOKE: label("A card was made or approved after the budget was cancelled or ended, or outside its dates.", "預算取消或到期後，或在有效日期以外，仍發卡或批准。"), // NEEDS-REVIEW
  },
} as const;
