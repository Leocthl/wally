// The two shared lines that outlived the first UI (the rest of this table was unused and is gone): the prototype footer
// (About, Proof, style guide) and the SIMULATED rail badge (Presenter). Every other string lives in ui.ts.
// test/branding.test.tsx pins that HKT, Tap & Go and Mastercard are named in this file only. EN first, zh-HK second.
import { label } from "./label";

export const S = {
  railBadge: label("SIMULATED rail. No money moves.", "模擬發卡層，沒有款項轉移"),
  footer: label("Prototype. Not affiliated with HKT, Tap & Go or Mastercard.", "原型作品。與 HKT、Tap & Go 及 Mastercard 並無關連。"),
} as const;
