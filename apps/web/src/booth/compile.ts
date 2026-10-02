// Mandate sentence -> compiled rule chips -> rules (docs/01 Example mandates, C-03). A small deterministic parser:
// no model, no network. The chips are the enforced rules; the sentence is display only (docs/06 DM1 talker line).
import type { CompiledRules } from "@laisee/core/generated";
import type { SealRequest } from "../api/types";
import { dollarsToMinor } from "../domain/money";
import { type Prov, SIMULATED } from "../domain/provenance";
import { addMs } from "../domain/time";
import { label, type LabelPair } from "../i18n/label";

export const M0_SENTENCE = "HK$800 this month for clothes, verified sellers only";

export type ChipKind = "budget" | "expiry" | "category" | "sellers" | "share" | "cap" | "askAbove";
export type RuleRef = "R2" | "R3" | "R4" | "R6" | "R9";

export type ChipValue =
  | { readonly kind: "budget"; readonly amountMinor: number | null }
  | { readonly kind: "expiry"; readonly mode: "month_end" | "days"; readonly days: number }
  | { readonly kind: "category"; readonly slugs: readonly string[] }
  | { readonly kind: "sellers"; readonly verifiedOnly: boolean }
  | { readonly kind: "share"; readonly bp: number }
  | { readonly kind: "cap"; readonly amountMinor: number }
  | { readonly kind: "askAbove"; readonly amountMinor: number };

export interface RuleChip {
  readonly kind: ChipKind;
  readonly rule: RuleRef;
  readonly label: LabelPair;
  readonly value: ChipValue;
  readonly valid: boolean;
  readonly error?: LabelPair;
  /** Typed by the delegator inside a SIMULATED demo, so the amounts carry the SIMULATED chip. */
  readonly prov: Prov;
}

export interface CompileResult {
  readonly chips: readonly RuleChip[];
  readonly issues: readonly LabelPair[];
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const HKT_OFFSET_MS = 8 * HOUR_MS;
const BP_PER_WHOLE = 10_000;
/** Whole-packet share written as "half". */
const HALF_BP = 5_000;

const CATEGORY_WORDS: readonly (readonly [RegExp, string])[] = [
  [/\b(clothes|clothing|apparel|fashion|tees?|shirts?|jackets?|hoodies?)\b/i, "apparel"],
  [/\b(shoes?|sneakers?|footwear)\b/i, "footwear"],
  [/\b(electronics?|gadgets?)\b/i, "electronics"],
  [/\b(groceries|grocery)\b/i, "groceries"],
];

const money = (m: RegExpMatchArray | null, group = 1): number | null => {
  const raw = m?.[group];
  return raw ? dollarsToMinor(raw.replaceAll(",", "")) : null;
};

const MSG = {
  budgetMissing: label("No HK$ amount found. Write the packet size, for example HK$800.", "找不到港幣金額。請寫明利是金額，例如 HK$800。"),
  budgetZero: label("The packet must be more than zero.", "利是金額必須大於零。"),
  categoryMissing: label("No known category. Try clothes, shoes, electronics or groceries.", "找不到已知類別。可試衣服、鞋、電子產品或雜貨。"),
  daysBad: label("Days must be a whole number of at least one.", "日數必須是至少一的整數。"),
};

function budgetChip(sentence: string): RuleChip {
  const skip = /(?:ask|confirm|check)[^.;]*?(?:above|over)\s+HK\$\s?[\d,.]+|no single purchase\s+(?:above|over)\s+HK\$\s?[\d,.]+/gi;
  const m = sentence.replace(skip, " ").match(/HK\$\s?(\d[\d,]*(?:\.\d{1,2})?)/i);
  const amountMinor = money(m);
  const valid = amountMinor !== null && amountMinor > 0;
  return {
    kind: "budget", rule: "R3", label: label("Budget", "預算"), value: { kind: "budget", amountMinor }, valid, prov: SIMULATED,
    ...(valid ? {} : { error: amountMinor === 0 ? MSG.budgetZero : MSG.budgetMissing }),
  };
}

function expiryChip(sentence: string): RuleChip {
  const m = sentence.match(/(\d+)\s+days?/i);
  const days = m?.[1] ? Number.parseInt(m[1], 10) : 0;
  const mode = m ? "days" : "month_end";
  const valid = mode === "month_end" || days >= 1;
  return { kind: "expiry", rule: "R2", label: label("Expires", "到期"), value: { kind: "expiry", mode, days }, valid, prov: SIMULATED, ...(valid ? {} : { error: MSG.daysBad }) };
}

function categoryChip(sentence: string): RuleChip {
  const slugs = [...new Set(CATEGORY_WORDS.filter(([re]) => re.test(sentence)).map(([, slug]) => slug))];
  const valid = slugs.length > 0;
  return { kind: "category", rule: "R6", label: label("Category", "類別"), value: { kind: "category", slugs }, valid, prov: SIMULATED, ...(valid ? {} : { error: MSG.categoryMissing }) };
}

function sellersChip(sentence: string): RuleChip {
  // Fail closed: say nothing and sellers must be verified. Only an explicit "any seller" relaxes it.
  const anySeller = /\b(any|unverified)\s+sellers?\b/i.test(sentence);
  return { kind: "sellers", rule: "R9", label: label("Sellers", "賣家"), value: { kind: "sellers", verifiedOnly: !anySeller }, valid: true, prov: SIMULATED };
}

function optionalChips(sentence: string): RuleChip[] {
  const chips: RuleChip[] = [];
  const share = sentence.match(/(?:no single purchase|nothing)[^.;]*?(?:above|over)\s+(half|(\d{1,3})\s?%)\s+of\s+(?:what|the)\s+(?:is\s+)?(?:left|remaining)/i);
  if (share) {
    const bp = share[1]?.toLowerCase() === "half" ? HALF_BP : Math.round((Number.parseInt(share[2] ?? "0", 10) / 100) * BP_PER_WHOLE);
    chips.push({ kind: "share", rule: "R4", label: label("Per purchase, share of what is left", "單次上限，佔餘額比例"), value: { kind: "share", bp }, valid: bp > 0 && bp <= BP_PER_WHOLE, prov: SIMULATED });
  }
  const cap = money(sentence.match(/no single purchase\s+(?:above|over)\s+HK\$\s?(\d[\d,]*(?:\.\d{1,2})?)/i));
  if (cap !== null) chips.push({ kind: "cap", rule: "R4", label: label("Per purchase cap", "單次上限"), value: { kind: "cap", amountMinor: cap }, valid: cap > 0, prov: SIMULATED });
  const ask = money(sentence.match(/(?:ask|confirm|check with)[^.;]*?(?:above|over)\s+HK\$\s?(\d[\d,]*(?:\.\d{1,2})?)/i));
  if (ask !== null) chips.push({ kind: "askAbove", rule: "R4", label: label("Ask me above", "超過即詢問"), value: { kind: "askAbove", amountMinor: ask }, valid: ask > 0, prov: SIMULATED });
  return chips;
}

export function compileMandate(sentence: string, _now: Date): CompileResult {
  const chips = [budgetChip(sentence), expiryChip(sentence), categoryChip(sentence), sellersChip(sentence), ...optionalChips(sentence)];
  return { chips, issues: chips.flatMap((c) => (c.error ? [c.error] : [])) };
}

function chipOf<K extends ChipKind>(chips: readonly RuleChip[], kind: K): Extract<ChipValue, { kind: K }> | undefined {
  return chips.find((c) => c.kind === kind)?.value as Extract<ChipValue, { kind: K }> | undefined;
}

/** Rebuilds the enforced rules from the (possibly edited) chips. Throws when a chip is invalid: Seal must stay disabled. */
export function chipsToRules(chips: readonly RuleChip[]): CompiledRules {
  if (chips.some((c) => !c.valid)) throw new Error("a rule chip is invalid, fix it before sealing (fail closed)");
  const budget = chipOf(chips, "budget")?.amountMinor;
  const slugs = chipOf(chips, "category")?.slugs ?? [];
  const [firstSlug, ...restSlugs] = slugs;
  if (budget == null || firstSlug === undefined) throw new Error("budget and category are required");
  const share = chipOf(chips, "share");
  const cap = chipOf(chips, "cap");
  const ask = chipOf(chips, "askAbove");
  const perPurchase = {
    ...(cap ? { hard_cap_minor: cap.amountMinor } : {}),
    ...(share ? { share_of_remaining_bp: share.bp } : {}),
    ...(ask ? { ask_above_minor: ask.amountMinor } : {}),
  };
  return {
    budget: { amount_minor: budget, currency: "HKD" },
    ...(Object.keys(perPurchase).length > 0 ? { per_purchase: perPurchase } : {}),
    categories: [firstSlug, ...restSlugs],
    merchants: { allow: null, deny: [] },
    seller_check: { require_capture: chipOf(chips, "sellers")?.verifiedOnly ?? true },
  };
}

/** Month end in Hong Kong as RFC 3339 UTC, or N days after the seal moment. */
export function validUntilFor(chips: readonly RuleChip[], now: Date): string {
  const expiry = chipOf(chips, "expiry");
  if (expiry?.mode === "days") return addMs(now.toISOString(), expiry.days * DAY_MS).replace(".000Z", "Z");
  const hk = new Date(now.getTime() + HKT_OFFSET_MS);
  const nextMonthStartHk = Date.UTC(hk.getUTCFullYear(), hk.getUTCMonth() + 1, 1);
  return new Date(nextMonthStartHk - HKT_OFFSET_MS - 1000).toISOString().replace(".000Z", "Z");
}

export function sealRequestFrom(sentence: string, chips: readonly RuleChip[], now: Date): SealRequest {
  return { intentText: sentence, rules: chipsToRules(chips), validUntil: validUntilFor(chips, now) };
}

/** The booth preset sealed on load (docs/06: packet HK$800 [F20]). */
export function m0Request(now: Date): SealRequest {
  return sealRequestFrom(M0_SENTENCE, compileMandate(M0_SENTENCE, now).chips, now);
}
