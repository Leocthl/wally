// Words for the Budget hero: Wally's one-line mood and the small labels around the amount. No digits: figures go through
// the formatter and wear a provenance chip. Every zh-HK line is a draft for the native read.
import { label, type LabelPair } from "./label";

export const HERO = {
  hi: label("Hi, I'm Wally.", "你好，我係 Wally。"), // NEEDS-REVIEW
  mood: {
    fresh: label("Ready when you are.", "隨時開始。"), // NEEDS-REVIEW
    going: label("Shopping inside your rules.", "喺你的規則入面買嘢。"), // NEEDS-REVIEW
    waiting: label("I need your OK on a buy.", "有一單要你確認。"), // NEEDS-REVIEW
    usedUp: label("The whole budget is used.", "預算已經用晒。"), // NEEDS-REVIEW
    cancelled: label("This budget is cancelled.", "呢個預算已取消。"), // NEEDS-REVIEW
    ended: label("This budget has ended.", "呢個預算已到期。"), // NEEDS-REVIEW
  },
  until: label("Until", "有效至"), // NEEDS-REVIEW
  tryNow: label("Try a buy", "試買一件"), // NEEDS-REVIEW
  tryTitle: label("Try it now", "即刻試吓"), // NEEDS-REVIEW
} as const satisfies Readonly<Record<string, LabelPair | Readonly<Record<string, LabelPair>>>>;

export type HeroMood = keyof typeof HERO.mood;
