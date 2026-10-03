// Words for the display-mode switch in About. Plain is the default; the switch brings back the technical views.
// Every zh-HK line is a draft for the native read.
import { label } from "./label";

export const MODE = {
  switchLabel: label("Show technical details", "顯示技術細節"), // NEEDS-REVIEW
  switchHint: label("For engineers: exact counts, intervals, rule ids and fingerprints.", "給工程師：確實數目、信賴區間、規則編號及指紋。"), // NEEDS-REVIEW
} as const;
