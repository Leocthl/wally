// Words for the first run and the personal touches (lane onboarding): the four steps (hello, what Wally can buy, the first
// budget, the quick tour), the coach marks, the About rows, the named greeting and the "For you" tag. User words only: budget,
// rules, one-off card, Wally. No digits: figures go through the formatter and wear a provenance chip. Every zh-HK line is a
// draft for the native read.
import type { ScenarioId } from "../api/types";
import { label, type LabelPair } from "./label";

export const OB = {
  skip: label("Skip", "略過"), // NEEDS-REVIEW
  // Under the Skip link while no budget exists yet: Skip seals the ready-made one, and says so before it does.
  skipNote: label("Skip uses a ready-made {amount} budget for clothes.", "略過會用現成嘅 {amount} 預算買衫。"), // NEEDS-REVIEW
  next: label("Next", "下一步"), // NEEDS-REVIEW
  back: label("Back", "返回"), // NEEDS-REVIEW
  continue: label("Continue", "繼續"), // NEEDS-REVIEW
  done: label("Done", "完成"), // NEEDS-REVIEW
  progress: label("Setup progress", "設定進度"), // NEEDS-REVIEW
  stepOf: (step: string, total: string): LabelPair => label(`Step ${step} of ${total}`, `第 ${step} 步，共 ${total} 步`), // NEEDS-REVIEW
  privacy: label("Saved on this device only. Wally never sends it anywhere.", "只儲存在這部裝置，Wally 不會傳送出去。"), // NEEDS-REVIEW
  optional: label("Optional", "可選填"), // NEEDS-REVIEW

  hello: {
    title: label("Hi, I'm Wally.", "你好，我係 Wally。"), // NEEDS-REVIEW
    lead: label("I shop for you, but only inside a budget you set. Fixed rules check every buy.", "我幫你買嘢，但只會喺你定的預算之內。每次購買都由固定規則檢查。"), // NEEDS-REVIEW
    nickname: label("What should Wally call you?", "Wally 應該點稱呼你？"), // NEEDS-REVIEW
    nicknameHint: label("Optional.", "可選填。"), // NEEDS-REVIEW
    nicknamePlaceholder: label("Your nickname", "你的暱稱"), // NEEDS-REVIEW
  },

  // Step two. One broad, optional question: which kinds of purchase this budget may cover. All four start ticked, which is what
  // "any category" means; the demo shop stocks only some of them, and the step says so. No digits: "four" is a word.
  buy: {
    title: label("What can Wally buy for you?", "Wally 可以幫你買啲咩？"), // NEEDS-REVIEW zh-HK
    lead: label("Tick the kinds of purchase this budget may cover. Fixed rules check every buy against them.", "揀呢個預算可以買嘅類別。每次購買都會由固定規則對照檢查。"), // NEEDS-REVIEW zh-HK
    // The booth already holds a live budget (the live booth seals one when it starts): the ticks cannot change it, so the lead does not say they do.
    leadHeld: label("Tick the kinds of purchase you want Wally's help with. Fixed rules check every buy against your budget.", "揀你想 Wally 幫手買嘅類別。每次購買都會由固定規則對照你嘅預算檢查。"), // NEEDS-REVIEW zh-HK
    group: label("Kinds of purchase", "購買類別"), // NEEDS-REVIEW zh-HK
    // Under the chips. A first budget is still to be made: the ticks start its rules. Nothing ticked reads as any category, and says so.
    hintForm: label("Optional. Leave all four ticked for any category. You can change this on the next step.", "可選填。四樣都揀晒即係任何類別都得。下一步仍然可以改。"), // NEEDS-REVIEW zh-HK
    hintNone: label("Nothing ticked, so your first budget will allow any category.", "全部都冇揀，所以你第一個預算任何類別都得。"), // NEEDS-REVIEW zh-HK
    // The booth already holds a budget, so there is no form to start: the ticks only change what Wally shows first.
    hintHeld: label("Your budget is already set up, so this only changes what Wally shows first.", "你嘅預算已經設定好，所以呢度只會影響 Wally 先顯示嘅內容。"), // NEEDS-REVIEW zh-HK
    // Said on every visit to the step: the budget's rules reach further than the sample shop does.
    shopNote: label("The demo shop stocks only some of these.", "示範商店只有其中部分貨品。"), // NEEDS-REVIEW zh-HK
    // The picks are kept in the profile, on this device. (The budget's rules, which they start, are signed and sent when it is locked in.)
    saved: label("Your picks are saved on this device only.", "你嘅選擇只會儲存喺呢部裝置。"), // NEEDS-REVIEW zh-HK
    kind: {
      groceries: label("Groceries and food", "雜貨同食品"), // NEEDS-REVIEW zh-HK
      apparel: label("Clothes", "衣物"), // NEEDS-REVIEW zh-HK
      footwear: label("Shoes", "鞋"), // NEEDS-REVIEW zh-HK
      electronics: label("Gadgets and electronics", "電子產品同小工具"), // NEEDS-REVIEW zh-HK
    },
  },

  budget: {
    title: label("Your first budget", "你的第一個預算"), // NEEDS-REVIEW
    lead: label("Wally can only spend inside this. You can cancel it any time.", "Wally 只可以喺呢個預算之內買嘢。你隨時可以取消。"), // NEEDS-REVIEW
    howMuch: label("How much?", "預算多少？"), // NEEDS-REVIEW
    custom: label("Custom", "自訂"), // NEEDS-REVIEW
    howLong: label("For how long?", "維持幾耐？"), // NEEDS-REVIEW
    thisMonth: label("This month", "今個月"), // NEEDS-REVIEW
    twoWeeks: label("Two weeks", "兩個星期"), // NEEDS-REVIEW
    pickDate: label("Pick a date", "揀日期"), // NEEDS-REVIEW
    ends: label("Ends {until}", "{until} 結束"), // NEEDS-REVIEW
    cutShort: label("A budget can run for a month at most, so the date is set to the latest day.", "一個預算最長維持一個月，所以日期已設為最遲可揀嘅一日。"), // NEEDS-REVIEW
    cutShortAmount: label("A budget can be {max} at most, the limit of one card, so the amount is set to that.", "一個預算最多 {max}，即一張卡嘅上限，所以金額已設為上限。"), // NEEDS-REVIEW
    review: label("Review budget", "檢查預算"), // NEEDS-REVIEW
    loading: label("Getting your budget ready", "正在準備你的預算"), // NEEDS-REVIEW
    readyTitle: label("Your budget is ready", "你的預算準備好了"), // NEEDS-REVIEW
    readyBody: label("Wally can shop inside it now. You can top up or cancel it any time under Manage this budget.", "Wally 而家可以喺預算之內購物。你隨時可以喺「管理預算」增加或取消。"), // NEEDS-REVIEW
    sealedBody: label("The rules are signed. Wally can shop now, inside them.", "規則已簽署。Wally 而家可以喺規則之內購物。"), // NEEDS-REVIEW
  },

  tour: {
    ask: {
      title: label("Ask Wally", "問 Wally"), // NEEDS-REVIEW
      body: label("Tap here, or the Ask button, to say what you need in your own words.", "喺呢度或者撳「問」，用你自己嘅講法話俾 Wally 知你想買乜。"), // NEEDS-REVIEW
    },
    ideas: {
      title: label("Ideas for you", "為你推介"), // NEEDS-REVIEW
      body: label("Tap an idea and Wally shops for it on a simulated store. Fixed rules decide every buy.", "撳一個推介，Wally 就喺模擬商店幫你買。每次購買都由固定規則決定。"), // NEEDS-REVIEW
    },
    tabs: {
      title: label("Find your way", "點樣搵到嘢"), // NEEDS-REVIEW
      body: label("Budget is home. Wally shows the shopping. Receipts and Proof show every signed decision.", "預算係主頁。Wally 頁顯示購物過程。收據同證明顯示每個已簽署的決定。"), // NEEDS-REVIEW
    },
    label: label("Quick tour", "快速導覽"), // NEEDS-REVIEW
    markOf: (at: string, total: string): LabelPair => label(`${at} of ${total}`, `${at} / ${total}`), // NEEDS-REVIEW
    skip: label("Skip tour", "略過導覽"), // NEEDS-REVIEW
  },

  about: {
    heading: label("Personal", "個人"), // NEEDS-REVIEW
    profile: label("Your profile", "你的個人資料"), // NEEDS-REVIEW
    tourAgain: label("Take the tour again", "再睇一次導覽"), // NEEDS-REVIEW
    tourAgainHint: label("Hello, what you buy and a quick look around.", "打招呼、你想買嘅類別同快速導覽。"), // NEEDS-REVIEW zh-HK
    forget: label("Forget my profile", "清除我的個人資料"), // NEEDS-REVIEW
    forgetTitle: label("Forget your profile?", "清除你的個人資料？"), // NEEDS-REVIEW
    forgetBody: label("Wally forgets your name and what you shop for on this device. Your budget and receipts stay.", "Wally 會喺呢部裝置忘記你的名同你想買嘅類別。預算同收據會保留。"), // NEEDS-REVIEW zh-HK
    forgetConfirm: label("Forget", "清除"), // NEEDS-REVIEW
    keep: label("Keep it", "保留"), // NEEDS-REVIEW
    forgotten: label("Profile forgotten.", "已清除個人資料。"), // NEEDS-REVIEW
    forgottenHere: label("Hidden for now. This browser would not let Wally remove it, so it may come back.", "暫時隱藏。呢個瀏覽器唔俾 Wally 移除，所以可能會再出現。"), // NEEDS-REVIEW
    resetAlso: label("Your name and what you shop for on this device are cleared too.", "你喺呢部裝置嘅名同想買嘅類別亦會清除。"), // NEEDS-REVIEW zh-HK
    stays: label("Stays on this device. Never sent anywhere.", "只儲存在這部裝置，不會傳送出去。"), // NEEDS-REVIEW
  },

  home: {
    hiNamed: (name: string): LabelPair => label(`Hi ${name}, I'm Wally.`, `${name}，你好，我係 Wally。`), // NEEDS-REVIEW
    hi: (name: string): LabelPair => label(`Hi ${name}.`, `${name}，你好。`), // NEEDS-REVIEW
    tryLead: label("Your picks come first. Each one runs the real rules on a simulated shop.", "先睇啱你的。每一個都用真規則，喺模擬商店運行。"), // NEEDS-REVIEW
    forYou: label("For you", "啱你"), // NEEDS-REVIEW
    composer: label("What do you need?", "你需要啲咩？"), // NEEDS-REVIEW
    demo: label("Demo scenarios (for judges)", "示範情境（供評審使用）"), // NEEDS-REVIEW
    // On a friend's phone the same cards are just a demo: no word about judges (the booth, ?booth=1 and presenter mode keep the long label).
    demoPlain: label("Demo scenarios", "示範情境"), // NEEDS-REVIEW
    demoLead: label("Each one runs the real rules on a simulated shop.", "每一個都用真規則，喺模擬商店運行。"), // NEEDS-REVIEW
  },

  ideas: {
    title: label("Ideas for you", "為你推介"), // NEEDS-REVIEW
    // The preview sheet an idea opens before anything is bought. Figures arrive formatted, so no digit lives here.
    from: label("From the demo shop", "來自示範商店"), // NEEDS-REVIEW
    buy: label("Ask Wally to buy this", "叫 Wally 買呢件"), // NEEDS-REVIEW
    checks: label("Wally checks this against your rules before any card is made.", "Wally 會先按你的規則檢查，通過先會發卡。"), // NEEDS-REVIEW
    shipping: label("{price} plus {shipping} shipping", "{price} 加 {shipping} 運費"), // NEEDS-REVIEW
    item: {
      tee: label("Cotton tee", "純棉T恤"), // NEEDS-REVIEW
      socks: label("Ankle socks", "短襪"), // NEEDS-REVIEW
      jacket: label("Denim jacket", "牛仔褸"), // NEEDS-REVIEW
      hoodie: label("Fleece hoodie", "抓毛衛衣"), // NEEDS-REVIEW
      graphic: label("Graphic tee", "圖案T恤"), // NEEDS-REVIEW
      earbuds: label("Wireless earbuds", "藍牙耳機"), // NEEDS-REVIEW
    },
    kind: {
      tee: label("Everyday basics", "日常基本款"), // NEEDS-REVIEW
      socks: label("A small buy", "細額購買"), // NEEDS-REVIEW
      jacket: label("Streetwear", "街頭潮流"), // NEEDS-REVIEW
      hoodie: label("Cozy", "舒適暖和"), // NEEDS-REVIEW
      graphic: label("Streetwear", "街頭潮流"), // NEEDS-REVIEW
      earbuds: label("Electronics", "電子產品"), // NEEDS-REVIEW
    },
  },
} as const;

/** What to type into the Ask field, by shelf item: the words the booth's buttons use. Only items the shelf has. */
export const ASK_EXAMPLES: Readonly<Partial<Record<ScenarioId, LabelPair>>> = {
  normal: label("A plain cotton tee", "我想買件純棉T恤"), // NEEDS-REVIEW
  small: label("Ankle socks", "我要短襪"), // NEEDS-REVIEW
  overflow: label("A denim jacket", "我想買件牛仔褸"), // NEEDS-REVIEW
  injected: label("A graphic tee", "我想買件圖案T恤"), // NEEDS-REVIEW
  flagged: label("A fleece hoodie", "幫我搵件抓毛衛衣"), // NEEDS-REVIEW
  off_category: label("Wireless earbuds", "我想買藍牙耳機"), // NEEDS-REVIEW
};
