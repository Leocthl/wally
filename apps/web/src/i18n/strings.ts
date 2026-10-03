// The two shared lines that outlived the first UI (the rest of this table was unused and is gone): the prototype footer
// (About, Proof, style guide) and the SIMULATED rail badge (Presenter). Every other string lives in ui.ts.
// test/branding.test.tsx pins that no card brand is named in the UI source. EN first, zh-HK second.
import { label } from "./label";

export const S = {
  railBadge: label("SIMULATED rail. No money moves.", "模擬發卡層，冇款項轉移"),
  footer: label("Prototype built at HacKU.", "HacKU 參賽原型。"),
} as const;
