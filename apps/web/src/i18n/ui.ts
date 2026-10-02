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

  simulated: label("Simulated. No money moves.", "模擬示範，沒有真錢轉移。"), // NEEDS-REVIEW
  simulatedShort: label("Simulated", "模擬"), // NEEDS-REVIEW
} as const;

export type UiKey = keyof typeof UI;
