// Seal form model (pure): the sentence is for reading, the rows are the rules that get signed. The deterministic compile
// in booth/compile.ts reads a sentence into rows as it is typed (an end date included: the Until row shows the day it
// reads, cut to the longest a budget may run); suggestRules (the booth's reader) does the same job on request and says
// what it read. Nothing here seals: toSealRequest only builds the request after validate() finds nothing wrong.
import type { AskLocale, CompileResult, CompiledRules, SealRequest } from "../../api/types";
import { compileMandate, expiryClamps, mentionsMonth, sellerWords, statedUntilDay } from "../../booth/compile";
import { dollarsToMinor, minorToDollarsText } from "../../domain/money";

/**
 * Reads the sentence into rules with the booth's reader (api.compileRules: the local model, or the fixed rules parser):
 * rules, chip labels, notes and what it left out. null when it cannot. A suggestion only: it never seals.
 */
export type SuggestRules = (text: string, locale: AskLocale) => Promise<CompileResult | null>;

export const CATEGORY_SLUGS = ["apparel", "footwear", "electronics", "groceries"] as const;

const HKT_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const BP_PER_PERCENT = 100;
const MAX_PERCENT = 100;
/** IntentText maxLength in schemas/mandate.schema.json. */
export const SENTENCE_MAX = 280;

export interface RulesForm {
  /** Whole or decimal HK dollars as typed, without the HK$ sign. */
  readonly amount: string;
  readonly categories: readonly string[];
  readonly verifiedOnly: boolean;
  /** YYYY-MM-DD, a day in Hong Kong. */
  readonly until: string;
  /** Optional per-buy rules from the sentence; null when not set. */
  readonly askAbove: string | null;
  readonly cap: string | null;
  readonly share: string | null;
}

/** Keys of i18n/ui.ts; the form screen shows UI[key]. */
export type ErrorKey = "seal.errAmount" | "seal.errFormat" | "seal.errPercent" | "seal.errCategory" | "seal.errUntil" | "seal.errDate";
export type FieldName = "amount" | "categories" | "until" | "askAbove" | "cap" | "share";
export type FormErrors = Partial<Record<FieldName, ErrorKey>>;

/** The Hong Kong calendar day of an instant, as YYYY-MM-DD. */
export function hkDay(iso: string): string {
  return new Date(Date.parse(iso) + HKT_OFFSET_MS).toISOString().slice(0, 10);
}

/** The last second of a Hong Kong day, as RFC 3339 UTC (the credential's validUntil). */
export function endOfHkDay(day: string): string {
  const start = Date.parse(`${day}T00:00:00Z`) - HKT_OFFSET_MS;
  return new Date(start + DAY_MS - 1000).toISOString().replace(".000Z", "Z");
}

function cleanMoney(text: string): string {
  return text.replace(/[\s,]/g, "").replace(/^HK\$/i, "");
}

/** Typed dollars to minor units, or null when it is not an amount. */
export function moneyOf(text: string): number | null {
  return dollarsToMinor(cleanMoney(text));
}

/** The last day of the current Hong Kong month (compile.ts: "this month" ends at month end in Hong Kong). */
export function monthEndDay(now: Date): string {
  const hk = new Date(now.getTime() + HKT_OFFSET_MS);
  return new Date(Date.UTC(hk.getUTCFullYear(), hk.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

export const EMPTY_FORM = (now: Date): RulesForm => ({ amount: "", categories: [], verifiedOnly: true, until: monthEndDay(now), askAbove: null, cap: null, share: null });

export interface SentenceRead {
  readonly form: RulesForm;
  /** True when the sentence named an amount and at least one known category. */
  readonly complete: boolean;
  /** The day Until was cut to when the sentence named a date further off than a budget may run; otherwise null. */
  readonly cappedTo: string | null;
}

/** Reads a sentence into the rows. Rows the sentence says nothing about keep their current value. */
export function applySentence(form: RulesForm, sentence: string, now: Date): SentenceRead {
  const { chips } = compileMandate(sentence, now);
  const chip = <K extends string>(kind: K) => chips.find((c) => c.kind === kind);
  const budget = chip("budget");
  const category = chip("category");
  const amountMinor = budget?.valid && budget.value.kind === "budget" ? budget.value.amountMinor : null;
  const slugs = category?.valid && category.value.kind === "category" ? category.value.slugs : null;
  const stated = statedUntilDay(chips, now); // a length or a date the sentence names, in Hong Kong days
  const sellers = sellerWords(sentence);
  const anySeller = sellers === "any";
  const verified = sellers === "verified";
  const extra = (kind: "askAbove" | "cap"): string | null => {
    const c = chip(kind);
    return c && (c.value.kind === "askAbove" || c.value.kind === "cap") ? minorToDollarsText(c.value.amountMinor) : null;
  };
  const shareChip = chip("share");
  const share = shareChip && shareChip.value.kind === "share" ? String(Math.round(shareChip.value.bp / BP_PER_PERCENT)) : null;
  const next: RulesForm = {
    amount: amountMinor === null ? form.amount : minorToDollarsText(amountMinor),
    categories: slugs ?? form.categories,
    verifiedOnly: anySeller ? false : verified ? true : form.verifiedOnly,
    until: stated ?? (mentionsMonth(sentence) ? monthEndDay(now) : form.until),
    askAbove: extra("askAbove") ?? form.askAbove,
    cap: extra("cap") ?? form.cap,
    share: share ?? form.share,
  };
  const capped = stated !== null && expiryClamps(chips, now).length > 0;
  return { form: next, complete: amountMinor !== null && slugs !== null, cappedTo: capped ? stated : null };
}

/** The rows for rules that are already signed (Top up, Change the rules) or that a model suggested. */
export function formFromRules(rules: CompiledRules, validUntil: string): RulesForm {
  const per = rules.per_purchase;
  return {
    amount: minorToDollarsText(rules.budget.amount_minor),
    categories: [...rules.categories],
    verifiedOnly: rules.seller_check.require_capture,
    until: hkDay(validUntil),
    askAbove: per?.ask_above_minor === undefined ? null : minorToDollarsText(per.ask_above_minor),
    cap: per?.hard_cap_minor === undefined ? null : minorToDollarsText(per.hard_cap_minor),
    share: per?.share_of_remaining_bp === undefined ? null : String(Math.round(per.share_of_remaining_bp / BP_PER_PERCENT)),
  };
}

function amountError(text: string): ErrorKey | undefined {
  if (cleanMoney(text) === "") return "seal.errAmount";
  const minor = moneyOf(text);
  if (minor === null) return "seal.errFormat";
  return minor > 0 ? undefined : "seal.errAmount";
}

function percentError(text: string): ErrorKey | undefined {
  const n = Number(text.trim());
  return /^\d+$/.test(text.trim()) && n >= 1 && n <= MAX_PERCENT ? undefined : "seal.errPercent";
}

export function validate(form: RulesForm, now: Date): FormErrors {
  const untilOk = /^\d{4}-\d{2}-\d{2}$/.test(form.until) && !Number.isNaN(Date.parse(`${form.until}T00:00:00Z`));
  const errors: Readonly<Record<FieldName, ErrorKey | undefined>> = {
    amount: amountError(form.amount),
    categories: form.categories.length === 0 ? "seal.errCategory" : undefined,
    until: !untilOk ? "seal.errDate" : Date.parse(endOfHkDay(form.until)) <= now.getTime() ? "seal.errUntil" : undefined,
    askAbove: form.askAbove === null ? undefined : amountError(form.askAbove),
    cap: form.cap === null ? undefined : amountError(form.cap),
    share: form.share === null ? undefined : percentError(form.share),
  };
  return Object.fromEntries(Object.entries(errors).filter(([, v]) => v !== undefined)) as FormErrors;
}

export function isValid(errors: FormErrors): boolean {
  return Object.keys(errors).length === 0;
}

/** Signed rules from valid rows. Throws on invalid rows: Seal must not be reachable then (fail closed). */
export function toRules(form: RulesForm): CompiledRules {
  const budget = moneyOf(form.amount);
  const [first, ...rest] = form.categories;
  if (budget === null || budget <= 0 || first === undefined) throw new Error("rules are not complete: fix them before sealing");
  const ask = form.askAbove === null ? null : moneyOf(form.askAbove);
  const cap = form.cap === null ? null : moneyOf(form.cap);
  const share = form.share === null ? null : Number.parseInt(form.share, 10) * BP_PER_PERCENT;
  const perPurchase = {
    ...(cap === null ? {} : { hard_cap_minor: cap }),
    ...(share === null ? {} : { share_of_remaining_bp: share }),
    ...(ask === null ? {} : { ask_above_minor: ask }),
  };
  return {
    budget: { amount_minor: budget, currency: "HKD" },
    ...(Object.keys(perPurchase).length > 0 ? { per_purchase: perPurchase } : {}),
    categories: [first, ...rest],
    merchants: { allow: null, deny: [] },
    seller_check: { require_capture: form.verifiedOnly },
  };
}

/** A plain English line when the visitor left the sentence empty (the credential needs one; the engine never reads it). */
export function describeRules(form: RulesForm): string {
  const cats = form.categories.join(", ");
  const sellers = form.verifiedOnly ? "verified sellers only" : "any seller";
  return `HK$${cleanMoney(form.amount)} for ${cats} until ${form.until}, ${sellers}`;
}

export function toSealRequest(sentence: string, form: RulesForm, now: Date): SealRequest {
  const errors = validate(form, now);
  if (!isValid(errors)) throw new Error(`rules are not valid: ${Object.keys(errors).join(", ")}`);
  const text = sentence.trim().slice(0, SENTENCE_MAX);
  return { intentText: text.length > 0 ? text : describeRules(form).slice(0, SENTENCE_MAX), rules: toRules(form), validUntil: endOfHkDay(form.until) };
}
