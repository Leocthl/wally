// Short plain-language chip labels in English and zh-HK, produced in code from the validated rules (never by the
// model), so the Seal screen can show one chip per rule without extra logic. Dates are shown in Hong Kong time.
import type { CompiledRules } from "@laisee/core/generated";
import type { DEFAULT_CATEGORIES } from "./config";

export type ChipKind = "budget" | "expiry" | "category" | "sellers" | "cap" | "askAbove" | "share" | "velocity";

export interface RuleLabel {
  readonly kind: ChipKind;
  /** Rule the chip enforces (docs/02 section 7). */
  readonly rule: "R2" | "R3" | "R4" | "R6" | "R7" | "R9";
  readonly en: string;
  readonly zhHK: string;
}

const HKT_OFFSET_MS = 8 * 3_600_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const HALF_BP = 5_000;

const hkd = (minor: number): string => (minor % 100 === 0 ? `HK$${minor / 100}` : `HK$${(minor / 100).toFixed(2)}`);

function untilLabel(validUntil: string): Pick<RuleLabel, "en" | "zhHK"> {
  const hk = new Date(Date.parse(validUntil) + HKT_OFFSET_MS);
  const day = hk.getUTCDate();
  const month = hk.getUTCMonth();
  return { en: `Until ${day} ${MONTHS[month] ?? ""}`, zhHK: `至${month + 1}月${day}日` };
}

function categoryLabel(slugs: readonly string[], names: typeof DEFAULT_CATEGORIES): Pick<RuleLabel, "en" | "zhHK"> {
  const en = slugs.map((s) => names[s]?.en ?? s.replace(/_/g, " "));
  const zh = slugs.map((s) => names[s]?.zhHK ?? s.replace(/_/g, " "));
  const enList = en.length <= 1 ? (en[0] ?? "") : `${en.slice(0, -1).join(", ")} and ${en.at(-1)?.toLowerCase() ?? ""}`;
  return { en: `${enList} only`, zhHK: `只限${zh.join("及")}` };
}

function perLabel(windowS: number): Pick<RuleLabel, "en" | "zhHK"> {
  if (windowS === 3_600) return { en: "an hour", zhHK: "每小時" };
  if (windowS === 86_400) return { en: "a day", zhHK: "每日" };
  if (windowS === 604_800) return { en: "a week", zhHK: "每星期" };
  return { en: `per ${Math.round(windowS / 60)} minutes`, zhHK: `每${Math.round(windowS / 60)}分鐘` };
}

export function labelsFor(rules: CompiledRules, validUntil: string, names: typeof DEFAULT_CATEGORIES): readonly RuleLabel[] {
  const budget = hkd(rules.budget.amount_minor);
  const labels: RuleLabel[] = [
    { kind: "budget", rule: "R3", en: `${budget} budget`, zhHK: `預算 ${budget}` },
    { kind: "expiry", rule: "R2", ...untilLabel(validUntil) },
    { kind: "category", rule: "R6", ...categoryLabel(rules.categories, names) },
    rules.seller_check.require_capture
      ? { kind: "sellers", rule: "R9", en: "Verified sellers only", zhHK: "只限已驗證賣家" }
      : { kind: "sellers", rule: "R9", en: "Any seller", zhHK: "任何賣家" },
  ];
  const purchase = rules.per_purchase;
  if (purchase?.hard_cap_minor !== undefined) {
    labels.push({ kind: "cap", rule: "R4", en: `Max ${hkd(purchase.hard_cap_minor)} per purchase`, zhHK: `每次最多 ${hkd(purchase.hard_cap_minor)}` });
  }
  if (purchase?.share_of_remaining_bp !== undefined) {
    const bp = purchase.share_of_remaining_bp;
    labels.push(
      bp === HALF_BP
        ? { kind: "share", rule: "R4", en: "Max half of what is left per purchase", zhHK: "每次最多用餘額一半" }
        : { kind: "share", rule: "R4", en: `Max ${bp / 100}% of what is left per purchase`, zhHK: `每次最多用餘額的${bp / 100}%` },
    );
  }
  if (purchase?.ask_above_minor !== undefined) {
    labels.push({ kind: "askAbove", rule: "R4", en: `Ask me above ${hkd(purchase.ask_above_minor)}`, zhHK: `超過 ${hkd(purchase.ask_above_minor)} 先問我` });
  }
  if (rules.velocity !== undefined) {
    const per = perLabel(rules.velocity.window_s);
    labels.push({ kind: "velocity", rule: "R7", en: `At most ${rules.velocity.max_mints} purchases ${per.en}`, zhHK: `${per.zhHK}最多 ${rules.velocity.max_mints} 次` });
  }
  return labels;
}
