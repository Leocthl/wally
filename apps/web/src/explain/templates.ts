// STUB explanation templates: renders the documented examples (docs/01 Stop catalogue) until lane A's explain module
// merges. Same signature as core's Render, so the swap is one line in renderStop.ts. zh-HK lines are drafts for the
// native read owed in C-12. Pure: no I/O, no clock, no LLM prose (D4).
import { isLanguageSkip } from "@wally/core/explain";
import type { TemplateId } from "@wally/core/ports";
import { formatHkd } from "../domain/money";
import { formatHkTime } from "../domain/time";

export type Locale = "en" | "zh-HK";
type Inputs = Readonly<Record<string, unknown>>;

const num = (inputs: Inputs, key: string): number => {
  const v = inputs[key];
  return typeof v === "number" ? v : Number.NaN;
};
const text = (inputs: Inputs, key: string, fallback = ""): string => {
  const v = inputs[key];
  return typeof v === "string" ? v : fallback;
};
const money = (inputs: Inputs, key: string): string => (Number.isFinite(num(inputs, key)) ? formatHkd(num(inputs, key)) : "?");
const time = (inputs: Inputs, key: string): string => {
  const v = text(inputs, key);
  return v ? formatHkTime(v) : "?";
};
const prob = (inputs: Inputs, key: string): string => (Number.isFinite(num(inputs, key)) ? num(inputs, key).toFixed(2) : "?");
const seconds = (inputs: Inputs, key: string): string => {
  const s = num(inputs, key);
  if (!Number.isFinite(s)) return "?";
  // Whole minutes from two minutes up; the F31 window reads as "60 s", the F32 window as "10 min".
  return s >= 120 && s % 60 === 0 ? `${s / 60} min` : `${s} s`;
};
const count = (inputs: Inputs, key: string): string => (Number.isFinite(num(inputs, key)) ? String(num(inputs, key)) : "?");

interface Template {
  readonly en: (i: Inputs) => string;
  readonly zh: (i: Inputs) => string;
}

const stoppedZh = (n: number): string => `已由 R${n} 攔截。`;
const askZh = (n: number): string => `R${n} 要求你確認。`;
const isEscalation = (i: Inputs): boolean => i["verdict"] === "ESCALATE";

export const TEMPLATES: Readonly<Record<TemplateId, Template>> = {
  "R1.invalid_signature": {
    en: () => "Stopped by R1. The signature on your rules did not verify.",
    zh: () => `${stoppedZh(1)}你的規則簽署驗證不通過。`,
  },
  "R2.revoked": {
    en: (i) => `Stopped by R2. Budget cancelled at ${time(i, "revoked_at")}.`,
    zh: (i) => `${stoppedZh(2)}預算已於 ${time(i, "revoked_at")} 取消。`,
  },
  "R2.expired": {
    en: (i) => `Stopped by R2. Budget ended at ${time(i, "valid_until")}.`,
    zh: (i) => `${stoppedZh(2)}預算已於 ${time(i, "valid_until")} 到期。`,
  },
  "R3.over_remaining": {
    en: (i) => `Stopped by R3. Total ${money(i, "total_minor")} is over the ${money(i, "remaining_minor")} left.`,
    zh: (i) => `${stoppedZh(3)}總額 ${money(i, "total_minor")} 超出餘額 ${money(i, "remaining_minor")}。`,
  },
  "R4.over_cap": {
    en: (i) => `Stopped by R4. Total ${money(i, "total_minor")} is over the ${money(i, "cap_minor")} cap.`,
    zh: (i) => `${stoppedZh(4)}總額 ${money(i, "total_minor")} 超出單次上限 ${money(i, "cap_minor")}。`,
  },
  "R4.ask_above": {
    en: (i) => `Escalated by R4. Total ${money(i, "total_minor")} is over your ask-above ${money(i, "ask_above_minor")}.`,
    zh: (i) => `${askZh(4)}總額 ${money(i, "total_minor")} 超出你設定的確認門檻 ${money(i, "ask_above_minor")}。`,
  },
  "R5.over_ceiling": {
    en: (i) => `Stopped by R5. Total ${money(i, "total_minor")} is over the card ceiling of ${money(i, "ceiling_minor")}.`,
    zh: (i) => `${stoppedZh(5)}總額 ${money(i, "total_minor")} 超出卡額上限 ${money(i, "ceiling_minor")}。`,
  },
  "R6.off_mandate": {
    en: (i) => `Stopped by R6. ${text(i, "what", "This purchase")} is outside your rules.`,
    zh: (i) => `${stoppedZh(6)}${text(i, "what", "這項購買")}不在你的規則範圍內。`,
  },
  "R7.velocity": {
    en: (i) => `Stopped by R7. ${count(i, "n")} cards made in ${seconds(i, "window_s")}, the limit is ${count(i, "max")}.`,
    zh: (i) => `${stoppedZh(7)}${seconds(i, "window_s")}內發卡 ${count(i, "n")} 次，上限為 ${count(i, "max")} 次。`,
  },
  "R8.max_active": {
    en: (i) => `Stopped by R8. ${count(i, "active")} cards are active, the card maximum.`,
    zh: (i) => `${stoppedZh(8)}已有 ${count(i, "active")} 張卡生效，達到上限。`,
  },
  "R9.flagged": {
    en: (i) => `Stopped by R9. Seller flagged (${time(i, "captured_at")}).`,
    zh: (i) => `${stoppedZh(9)}賣家已被標記（${time(i, "captured_at")}）。`,
  },
  "R9.unverified": {
    en: () => "Escalated by R9. No record, not proof of safety.",
    zh: () => `${askZh(9)}查無紀錄，不代表安全。`,
  },
  "R10.injection": {
    en: (i) => `Stopped by R10. Injection risk ${prob(i, "p")} over ${prob(i, "threshold")}.`,
    zh: (i) => `${stoppedZh(10)}注入風險 ${prob(i, "p")} 高於 ${prob(i, "threshold")}。`,
  },
  "R10.seller_risk": {
    en: (i) => `${isEscalation(i) ? "Escalated" : "Stopped"} by R10. Seller risk ${prob(i, "p")} over ${prob(i, "threshold")}.`,
    zh: (i) => `${isEscalation(i) ? askZh(10) : stoppedZh(10)}賣家風險 ${prob(i, "p")} 高於 ${prob(i, "threshold")}。`,
  },
  "R10.scope": {
    en: (i) => `Escalated by R10. May be outside ${text(i, "category", "your rules")}.`,
    zh: (i) => `${askZh(10)}可能超出「${text(i, "category", "你的規則")}」範圍。`,
  },
  "R10.escalate": {
    en: (i) => `Escalated by R10. The judge asks you to decide (${prob(i, "p")} over ${prob(i, "threshold")}).`,
    zh: (i) => `${askZh(10)}判斷器建議由你決定（${prob(i, "p")} 高於 ${prob(i, "threshold")}）。`,
  },
  "R10.unavailable": {
    en: (i) =>
      isLanguageSkip(i)
        ? "Escalated by R10. Wally's listing checker reads English best and could not check this listing, so it asks you."
        : "Escalated by R10. The judge could not check this listing, so it asks you.",
    zh: (i) => (isLanguageSkip(i) ? `${askZh(10)}Wally 嘅貨品說明檢查器最啱讀英文，今次未能檢查呢個貨品，所以請你決定。` : `${askZh(10)}判斷器未能檢查這個商品頁，所以交由你決定。`),
  },
  "R11.expired": {
    en: (i) => `Stopped by R11. No answer in ${seconds(i, "window_s")}.`,
    zh: (i) => `${stoppedZh(11)}${seconds(i, "window_s")}內沒有回覆。`,
  },
  "R12.price_drift": {
    en: (i) => `Stopped by R12. Price moved, ${money(i, "approved_minor")} to ${money(i, "seen_minor")}.`,
    zh: (i) => `${stoppedZh(12)}價格已變，${money(i, "approved_minor")} 變為 ${money(i, "seen_minor")}。`,
  },
};

export function renderTemplate(templateId: TemplateId, inputs: Inputs, locale: Locale): string {
  const template = TEMPLATES[templateId];
  // Unknown template: fail closed with a safe sentence that carries no figure.
  if (!template) return locale === "en" ? "Stopped. No explanation template for this rule." : "已攔截。這條規則沒有說明範本。";
  return locale === "en" ? template.en(inputs) : template.zh(inputs);
}
