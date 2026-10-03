// One pure line builder per template id (docs/00-context Stops; docs/01 Stop catalogue; docs/02 section 8).
// Text = rule prefix + fragment from recorded inputs. Every zh-HK string is a draft owed a native read
// (docs/04 Microcopy, C-12): each carries a NEEDS-REVIEW marker.
import { JUDGE_REASON_UNSUPPORTED_LANGUAGE, type TemplateId } from "../ports";
import {
  formatCount,
  formatDuration,
  formatHkd,
  formatHkt,
  formatList,
  formatProbability,
  formatText,
  type Locale,
} from "./format";

export type TemplateInputs = Readonly<Record<string, unknown>>;
export type Verdict = "DENY" | "ESCALATE";

type Fragment = (i: TemplateInputs, locale: Locale) => string;

export interface TemplateSpec {
  /** Prefix used when inputs.verdict is absent. */
  readonly defaultVerdict: Verdict;
  readonly fragment: Fragment;
}

/** Reads one recorded input without trusting the object's shape. */
export function field(inputs: TemplateInputs, key: string): unknown {
  return inputs !== null && typeof inputs === "object" && Object.hasOwn(inputs, key) ? inputs[key] : undefined;
}

const zhOr = (locale: Locale, en: string, zh: string): string => (locale === "zh-HK" ? zh : en);

const r1: Fragment = (i, l) => {
  const binding = field(i, "binding");
  if (typeof binding === "string" && binding !== "ok") {
    return zhOr(l, "This cart is not covered by the mandate.", "這個購物車不在授權範圍內。"); // NEEDS-REVIEW zh-HK
  }
  if (field(i, "proof") === "not_checked") {
    return zhOr(l, "The mandate signature was not checked.", "授權簽署未經檢查。"); // NEEDS-REVIEW zh-HK
  }
  return zhOr(l, "The mandate signature did not verify.", "授權簽署未能驗證。"); // NEEDS-REVIEW zh-HK
};

const r2Revoked: Fragment = (i, l) => {
  const status = field(i, "status");
  if (typeof status === "string" && status !== "REVOKED") {
    const s = formatText(status);
    return zhOr(l, `The budget is not active (status ${s}).`, `預算未生效（狀態 ${s}）。`); // NEEDS-REVIEW zh-HK
  }
  return zhOr(l, "The mandate was revoked.", "授權已被撤銷。"); // NEEDS-REVIEW zh-HK
};

const r2Expired: Fragment = (i, l) => {
  if (field(i, "not_yet_valid") === true) {
    const from = formatHkt(field(i, "valid_from"));
    return zhOr(l, `Mandate is not valid until ${from}.`, `授權要到 ${from} 才生效。`); // NEEDS-REVIEW zh-HK
  }
  const until = formatHkt(field(i, "valid_until"));
  return zhOr(l, `Mandate expired at ${until}.`, `授權已於 ${until} 到期。`); // NEEDS-REVIEW zh-HK
};

const r3: Fragment = (i, l) => {
  const total = formatHkd(field(i, "total_minor"));
  if (field(i, "currency_mismatch") === true) {
    const c = formatText(field(i, "currency"));
    return zhOr(l, `Cart currency ${c} does not match the budget (HKD).`, `購物車貨幣 ${c} 與預算（HKD）不符。`); // NEEDS-REVIEW zh-HK
  }
  if (field(i, "total_mismatch") === true) {
    const parts = formatHkd(field(i, "computed_total_minor"));
    return zhOr(l, `Total ${total} does not match its parts (${parts}).`, `總額 ${total} 與明細（${parts}）不符。`); // NEEDS-REVIEW zh-HK
  }
  const left = formatHkd(field(i, "remaining_minor"));
  return zhOr(l, `Total ${total} is over the ${left} left.`, `總額 ${total} 超過剩餘的 ${left}。`); // NEEDS-REVIEW zh-HK
};

const r4Cap: Fragment = (i, l) => {
  const total = formatHkd(field(i, "total_minor"));
  const cap = formatHkd(field(i, "cap_minor"));
  return zhOr(l, `Total ${total} is over the ${cap} per-purchase cap.`, `總額 ${total} 超過每次購買上限 ${cap}。`); // NEEDS-REVIEW zh-HK
};

const r4Ask: Fragment = (i, l) => {
  const total = formatHkd(field(i, "total_minor"));
  const ask = formatHkd(field(i, "ask_above_minor"));
  return zhOr(l, `Total ${total} is over the ${ask} ask-first amount.`, `總額 ${total} 超過需先問你的金額 ${ask}。`); // NEEDS-REVIEW zh-HK
};

const r5: Fragment = (i, l) => {
  const total = formatHkd(field(i, "total_minor"));
  const ceiling = formatHkd(field(i, "ceiling_minor"));
  return zhOr(l, `Total ${total} is over the ${ceiling} card ceiling.`, `總額 ${total} 超過每張卡 ${ceiling} 的上限。`); // NEEDS-REVIEW zh-HK
};

const r6: Fragment = (i, l) => {
  const reason = field(i, "reason");
  const domain = formatText(field(i, "domain"));
  if (reason === "merchant_denied") {
    return zhOr(l, `Merchant ${domain} is on the deny list.`, `商戶 ${domain} 在禁止名單上。`); // NEEDS-REVIEW zh-HK
  }
  if (reason === "merchant_not_allowed") {
    return zhOr(l, `Merchant ${domain} is not on the allow list.`, `商戶 ${domain} 不在允許名單上。`); // NEEDS-REVIEW zh-HK
  }
  const off = formatList(field(i, "off_categories"));
  const allowed = formatList(field(i, "categories"));
  return zhOr(l, `Category ${off} is outside ${allowed}.`, `類別 ${off} 不在 ${allowed} 之內。`); // NEEDS-REVIEW zh-HK
};

const r7: Fragment = (i, l) => {
  const n = formatCount(field(i, "mints_in_window"));
  const max = formatCount(field(i, "max_mints"));
  const window = formatDuration(field(i, "window_s"), l);
  return zhOr(l, `${n} mints in ${window} already; the limit is ${max}.`, `${window}內已發出 ${n} 張卡，上限是 ${max} 張。`); // NEEDS-REVIEW zh-HK
};

const r8: Fragment = (i, l) => {
  const n = formatCount(field(i, "active_cards"));
  const max = formatCount(field(i, "max_active"));
  return zhOr(l, `${n} cards are active; the rail allows ${max}.`, `已有 ${n} 張卡生效，發卡層最多容許 ${max} 張。`); // NEEDS-REVIEW zh-HK
};

const r9Flagged: Fragment = (i, l) => {
  const at = formatHkt(field(i, "captured_at"));
  return zhOr(l, `Seller flagged on Scameter (${at}).`, `賣家在防騙視伏器被標記（${at}）。`); // NEEDS-REVIEW zh-HK
};

const r9Unverified: Fragment = (i, l) => {
  if (field(i, "state") === "NOT_CHECKED") {
    return zhOr(l, "Seller not checked on Scameter.", "賣家未經防騙視伏器檢查。"); // NEEDS-REVIEW zh-HK
  }
  if (field(i, "stale") === true) {
    const age = formatDuration(field(i, "max_capture_age_s"), l);
    return zhOr(l, `Scameter check is older than ${age}.`, `防騙視伏器檢查已超過 ${age}。`); // NEEDS-REVIEW zh-HK
  }
  return zhOr(l, "No record, not proof of safety.", "沒有紀錄不代表安全。"); // NEEDS-REVIEW zh-HK
};

const riskLine = (enLabel: string, zhLabel: string, key: string): Fragment => (i, l) => {
  const p = formatProbability(field(i, key));
  const t = formatProbability(field(i, "threshold"));
  return zhOr(l, `${enLabel} ${p} is at or over ${t}.`, `${zhLabel} ${p}，達到或超過 ${t}。`); // NEEDS-REVIEW zh-HK
};

const r10Scope: Fragment = (i, l) => {
  const cats = formatList(field(i, "categories"));
  const p = formatProbability(field(i, "p_in_scope"));
  const t = formatProbability(field(i, "threshold"));
  return zhOr(l, `May be outside ${cats} (in scope ${p}, under ${t}).`, `可能不屬於 ${cats}（相符度 ${p}，低於 ${t}）。`); // NEEDS-REVIEW zh-HK
};

const r10Escalate: Fragment = (i, l) => {
  const p = formatProbability(field(i, "p_escalate"));
  const t = formatProbability(field(i, "threshold"));
  return zhOr(l, `The judge leans to asking you first (${p}, limit ${t}).`, `評審傾向先問你（${p}，門檻 ${t}）。`); // NEEDS-REVIEW zh-HK
};

function unavailableReason(i: TemplateInputs, l: Locale): string {
  if (field(i, "input_truncated") === true) return zhOr(l, "listing cut off", "商品描述被截斷"); // NEEDS-REVIEW zh-HK
  const status = field(i, "status");
  if (status === "TIMEOUT") return zhOr(l, "timed out", "逾時"); // NEEDS-REVIEW zh-HK
  if (status === "ERROR") return zhOr(l, "error", "錯誤"); // NEEDS-REVIEW zh-HK
  if (status === "OK") return zhOr(l, "malformed answer", "答案格式錯誤"); // NEEDS-REVIEW zh-HK
  return zhOr(l, "unknown status", "狀態不明"); // NEEDS-REVIEW zh-HK
}

/** The adapter did not ask its model because the listing is in a language the model does not read (a cut-off listing keeps its own line). */
const isLanguageSkip = (i: TemplateInputs): boolean =>
  field(i, "reason") === JUDGE_REASON_UNSUPPORTED_LANGUAGE && field(i, "input_truncated") !== true;

const r10Unavailable: Fragment = (i, l) => {
  if (isLanguageSkip(i)) {
    return zhOr(
      l,
      "Wally's listing checker reads English best and could not check this listing, so it asks you.",
      "Wally 嘅貨品說明檢查器最啱讀英文，今次未能檢查呢個貨品，所以請你決定。", // NEEDS-REVIEW zh-HK
    );
  }
  const reason = unavailableReason(i, l);
  return zhOr(l, `The judge gave no usable answer (${reason}), so you decide.`, `評審未能給出可用答案（${reason}），由你決定。`); // NEEDS-REVIEW zh-HK
};

const r11: Fragment = (i, l) => {
  const problem = field(i, "answer_problem");
  if (typeof problem === "string") {
    const p = formatText(problem);
    return zhOr(l, `The escalation answer was not valid (${p}).`, `確認回覆無效（${p}）。`); // NEEDS-REVIEW zh-HK
  }
  if (field(i, "choice") === "DENY") return zhOr(l, "You said no.", "你已拒絕。"); // NEEDS-REVIEW zh-HK
  const window = formatDuration(field(i, "window_s"), l);
  return zhOr(l, `No answer in ${window}.`, `${window}內沒有回覆。`); // NEEDS-REVIEW zh-HK
};

const r12: Fragment = (i, l) => {
  const before = formatHkd(field(i, "approved_total_minor"));
  const after = formatHkd(field(i, "checkout_total_minor"));
  return zhOr(l, `Price moved, ${before} to ${after}.`, `價格由 ${before} 變為 ${after}。`); // NEEDS-REVIEW zh-HK
};

const deny = (fragment: Fragment): TemplateSpec => ({ defaultVerdict: "DENY", fragment });
const escalate = (fragment: Fragment): TemplateSpec => ({ defaultVerdict: "ESCALATE", fragment });

export const TEMPLATES: Readonly<Record<TemplateId, TemplateSpec>> = Object.freeze({
  "R1.invalid_signature": deny(r1),
  "R2.revoked": deny(r2Revoked),
  "R2.expired": deny(r2Expired),
  "R3.over_remaining": deny(r3),
  "R4.over_cap": deny(r4Cap),
  "R4.ask_above": escalate(r4Ask),
  "R5.over_ceiling": deny(r5),
  "R6.off_mandate": deny(r6),
  "R7.velocity": deny(r7),
  "R8.max_active": deny(r8),
  "R9.flagged": deny(r9Flagged),
  "R9.unverified": escalate(r9Unverified),
  "R10.injection": deny(riskLine("Injection risk", "指令注入風險", "p_injection_risk")), // NEEDS-REVIEW zh-HK
  "R10.seller_risk": deny(riskLine("Seller risk", "賣家風險", "p_high_risk")), // NEEDS-REVIEW zh-HK
  "R10.scope": escalate(r10Scope),
  "R10.escalate": escalate(r10Escalate),
  "R10.unavailable": escalate(r10Unavailable),
  "R11.expired": deny(r11),
  "R12.price_drift": deny(r12),
});

/** Template ids in schema order (decision.schema.json $defs.TemplateId). */
export const TEMPLATE_IDS: readonly TemplateId[] = Object.freeze(Object.keys(TEMPLATES) as TemplateId[]);
