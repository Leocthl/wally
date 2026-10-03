// Plain words for a stop or a question, picked by the engine's own template id (never re-decided here). Figures are
// the engine's recorded inputs, formatted at the edge; the UI never computes a difference or a new number. The
// engine's full sentence, with the rule id and any probability, stays in the "Why?" sheet.
import { isLanguageSkip } from "@wally/core/explain";
import type { Decision } from "../../../api/types";
import { formatHkd } from "../../../domain/money";
import type { LabelPair } from "../../../i18n/label";
import { UI } from "../../../i18n/ui";
import { categoriesLabel } from "./categories";

const R = UI.run;

function minor(inputs: Readonly<Record<string, unknown>>, ...keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const v = inputs[key];
    if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) return v;
  }
  return undefined;
}

function money(value: number | undefined): string | undefined {
  return value === undefined ? undefined : formatHkd(value);
}

type Inputs = Readonly<Record<string, unknown>>;

const strings = (value: unknown): readonly string[] => (Array.isArray(value) ? value.filter((c): c is string => typeof c === "string") : []);

/**
 * The categories the person's budget allows, as an R6 decision recorded them. The engine records them under `categories` (with
 * the offending ones under `off_categories` and reason "category"); the offline mock records the allowed list as `allowed` and
 * keeps the offending item's categories under `categories`. A stop about the shop, not the category, names none.
 */
export function allowedCategories(inputs: Inputs): readonly string[] {
  if (inputs["reason"] === "merchant_denied" || inputs["reason"] === "merchant_not_allowed") return [];
  const named = strings(inputs["allowed"]);
  return named.length > 0 ? named : strings(inputs["categories"]);
}

/** Each template's plain sentence; null when a figure it needs was not recorded (then a figure-free line is used). */
const BY_TEMPLATE: Readonly<Record<string, (i: Inputs, d: Decision) => LabelPair | null>> = {
  "R1.invalid_signature": () => R.reasonR1,
  "R2.revoked": () => R.reasonR2Revoked,
  "R2.expired": () => R.reasonR2Expired,
  "R3.over_remaining": (i, d) => {
    const total = money(minor(i, "total_minor") ?? d.cart.total_minor);
    const left = money(minor(i, "remaining_minor") ?? d.packet.remaining_minor);
    return total && left ? R.reasonR3(total, left) : null;
  },
  "R4.over_cap": (i, d) => {
    const total = money(minor(i, "total_minor") ?? d.cart.total_minor);
    const cap = money(minor(i, "cap_minor", "hard_cap_minor"));
    return total && cap ? R.reasonR4Cap(total, cap) : null;
  },
  "R4.ask_above": (i, d) => {
    const total = money(minor(i, "total_minor") ?? d.cart.total_minor);
    const ask = money(minor(i, "ask_above_minor"));
    return total && ask ? R.reasonR4Ask(total, ask) : null;
  },
  "R5.over_ceiling": (i, d) => {
    const total = money(minor(i, "total_minor") ?? d.cart.total_minor);
    const ceiling = money(minor(i, "ceiling_minor"));
    return total && ceiling ? R.reasonR5(total, ceiling) : null;
  },
  "R6.off_mandate": (i) => {
    // A category stop names the rules it broke ("Your budget is for Clothes only."); a shop stop keeps the general sentence.
    const allowed = allowedCategories(i);
    if (allowed.length === 0) return R.reasonR6;
    const things = categoriesLabel(allowed);
    return R.reasonR6Category(things.en, things.zh);
  },
  "R7.velocity": () => R.reasonR7,
  "R8.max_active": () => R.reasonR8,
  "R9.flagged": () => R.reasonR9Flagged,
  "R9.unverified": () => R.reasonR9Unverified,
  "R10.injection": () => R.reasonR10Injection,
  "R10.seller_risk": () => R.reasonR10Seller,
  "R10.scope": () => R.reasonR10Scope,
  "R10.escalate": () => R.reasonR10Unsure,
  "R10.unavailable": (i) => (isLanguageSkip(i) ? R.reasonR10Language : R.reasonR10Offline),
  "R11.expired": (i) => (i["choice"] === "DENY" ? R.youSaidNo : R.nobodyAnswered),
  "R12.price_drift": () => R.reasonR12,
};

export function templateOf(decision: Decision): string | undefined {
  return decision.explanation?.template_id;
}

/** The checker did not answer because of a fault (it is down, timed out, cut the listing off): Wally "sleeps". Reading English best is not a fault. */
export function checkerIsOffline(decision: Decision): boolean {
  return templateOf(decision) === "R10.unavailable" && !isLanguageSkip(decision.explanation?.inputs ?? {});
}

/** The plain reason for a DENY or an ESCALATE, from the decision's own template and recorded inputs. */
export function plainReason(decision: Decision): LabelPair {
  const template = templateOf(decision);
  const build = template === undefined ? undefined : BY_TEMPLATE[template];
  return (build ? build(decision.explanation?.inputs ?? {}, decision) : null) ?? R.reasonUnknown;
}

const CHIP: Readonly<Record<string, LabelPair>> = {
  R1: R.chipR1, R2: R.chipR2, R3: R.chipR3, R4: R.chipR4, R5: R.chipR5, R6: R.chipR6,
  R7: R.chipR7, R8: R.chipR8, R9: R.chipR9, R10: R.chipR10, R11: R.chipR11, R12: R.chipR12,
};

/** "Budget rule", "Seller check": the quiet name of the rule that decided, without its id. */
export function ruleChip(decision: Decision): LabelPair | undefined {
  const rule = templateOf(decision)?.split(".")[0];
  return rule === undefined ? undefined : CHIP[rule];
}

/**
 * The engine's own sentence in the current language (the rendered lines it recorded), so a figure can never read "?"
 * because the UI guessed an input key. `render` re-renders from the template only when a line is missing.
 */
export function engineLine(decision: Decision, locale: "en" | "zh-HK", render: (id: string, inputs: Inputs, locale: "en" | "zh-HK") => string): string | undefined {
  const e = decision.explanation;
  if (!e) return undefined;
  const recorded = locale === "zh-HK" ? e.rendered_zh_hk : e.rendered;
  return recorded && recorded.length > 0 ? recorded : render(e.template_id, e.inputs, locale);
}
