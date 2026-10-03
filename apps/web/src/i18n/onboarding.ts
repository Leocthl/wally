// Words for the first run and the personal touches (lane onboarding): the four steps, the coach marks, the About rows, the
// named greeting and the "For you" tag. User words only: budget, rules, one-off card, Wally. No digits: figures go through
// the formatter and wear a provenance chip. Every zh-HK line is a draft for the native read.
import type { ScenarioId } from "../api/types";
import { label, type LabelPair } from "./label";

export const OB = {
  skip: label("Skip", "略過"), // NEEDS-REVIEW
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
    nicknameHint: label("Optional. Saved on this device only.", "可選填，只儲存在這部裝置。"), // NEEDS-REVIEW
    nicknamePlaceholder: label("Your nickname", "你的暱稱"), // NEEDS-REVIEW
  },

  taste: {
    title: label("What's your style?", "你鍾意咩風格？"), // NEEDS-REVIEW
    lead: label("Pick what fits. Wally shows these first. Nothing here changes how Wally decides.", "揀啱你的。Wally 會先顯示呢啲。呢度嘅選擇唔會影響 Wally 點樣決定。"), // NEEDS-REVIEW
    styles: label("Your style", "你的風格"), // NEEDS-REVIEW
    colours: label("Colours you wear", "你常著的顏色"), // NEEDS-REVIEW
    sizes: label("Your usual sizes", "你常著的尺碼"), // NEEDS-REVIEW
    top: label("Top", "上衣"), // NEEDS-REVIEW
    bottom: label("Bottom", "褲或裙"), // NEEDS-REVIEW
    shoe: label("Shoes (EU)", "鞋（歐碼）"), // NEEDS-REVIEW
    shopFor: label("What do you shop for?", "你通常買咩？"), // NEEDS-REVIEW
    shopForHint: label("These fill in your first budget.", "呢啲會預設做你第一個預算的類別。"), // NEEDS-REVIEW
    style: {
      basics: label("Basics", "基本款"), // NEEDS-REVIEW
      streetwear: label("Streetwear", "街頭潮流"), // NEEDS-REVIEW
      sporty: label("Sporty", "運動風"), // NEEDS-REVIEW
      smart: label("Smart casual", "休閒時尚"), // NEEDS-REVIEW
      cozy: label("Cozy", "舒適暖和"), // NEEDS-REVIEW
    },
    colour: {
      black: label("Black", "黑色"), // NEEDS-REVIEW
      white: label("White", "白色"), // NEEDS-REVIEW
      grey: label("Grey", "灰色"), // NEEDS-REVIEW
      navy: label("Navy", "深藍"), // NEEDS-REVIEW
      olive: label("Olive", "橄欖綠"), // NEEDS-REVIEW
      sand: label("Sand", "沙色"), // NEEDS-REVIEW
      rust: label("Rust", "磚紅"), // NEEDS-REVIEW
      sky: label("Sky", "天藍"), // NEEDS-REVIEW
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
    review: label("Review budget", "檢查預算"), // NEEDS-REVIEW
    skipNote: label("Or skip to use a ready-made budget.", "或者略過，用現成預算。"), // NEEDS-REVIEW
    loading: label("Getting your budget ready", "正在準備你的預算"), // NEEDS-REVIEW
    readyTitle: label("Your budget is ready", "你的預算準備好了"), // NEEDS-REVIEW
    readyBody: label("Wally can shop inside it now. You can top up or cancel it any time under Manage this budget.", "Wally 而家可以喺預算之內購物。你隨時可以喺「管理預算」增加或取消。"), // NEEDS-REVIEW
    sealedBody: label("The rules are signed. Wally can shop now, inside them.", "規則已簽署。Wally 而家可以喺規則之內購物。"), // NEEDS-REVIEW
  },

  tour: {
    ask: {
      title: label("Ask Wally", "問 Wally"), // NEEDS-REVIEW
      body: label("Tap here, or Ask below, to say what you need in your own words.", "喺呢度或者下面撳「問」，用你自己的說話話俾 Wally 知你想買乜。"), // NEEDS-REVIEW
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
    tourAgainHint: label("Hello, your taste and a quick look around.", "打招呼、你的喜好同快速導覽。"), // NEEDS-REVIEW
    forget: label("Forget my profile", "清除我的個人資料"), // NEEDS-REVIEW
    forgetTitle: label("Forget your profile?", "清除你的個人資料？"), // NEEDS-REVIEW
    forgetBody: label("Wally forgets your name and taste on this device. Your budget and receipts stay.", "Wally 會喺呢部裝置忘記你的名同喜好。預算同收據會保留。"), // NEEDS-REVIEW
    forgetConfirm: label("Forget", "清除"), // NEEDS-REVIEW
    keep: label("Keep it", "保留"), // NEEDS-REVIEW
    forgotten: label("Profile forgotten.", "已清除個人資料。"), // NEEDS-REVIEW
    forgottenHere: label("Hidden for now. This browser would not let Wally remove it, so it may come back.", "暫時隱藏。呢個瀏覽器唔俾 Wally 移除，所以可能會再出現。"), // NEEDS-REVIEW
    resetAlso: label("Your name and taste on this device are cleared too.", "你喺呢部裝置嘅名同喜好亦會清除。"), // NEEDS-REVIEW
    stays: label("Stays on this device. Never sent anywhere.", "只留喺呢部裝置，不會傳送出去。"), // NEEDS-REVIEW
  },

  home: {
    hiNamed: (name: string): LabelPair => label(`Hi ${name}, I'm Wally.`, `${name}，你好，我係 Wally。`), // NEEDS-REVIEW
    hi: (name: string): LabelPair => label(`Hi ${name}.`, `${name}，你好。`), // NEEDS-REVIEW
    tryLead: label("Your picks come first. Each one runs the real rules on a simulated shop.", "先睇啱你的。每一個都用真規則，喺模擬商店運行。"), // NEEDS-REVIEW
    forYou: label("For you", "啱你"), // NEEDS-REVIEW
    composer: label("What do you need?", "你需要啲咩？"), // NEEDS-REVIEW
    demo: label("Demo scenarios (for judges)", "示範情境（供評審使用）"), // NEEDS-REVIEW
    demoLead: label("Each one runs the real rules on a simulated shop.", "每一個都用真規則，喺模擬商店運行。"), // NEEDS-REVIEW
  },

  ideas: {
    title: label("Ideas for you", "為你推介"), // NEEDS-REVIEW
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
