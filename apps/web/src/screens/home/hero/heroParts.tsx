// Pieces the Budget hero variants share: the rule tags, the little spent and held figures, the date, and the words for
// the meter. All figures are SIMULATED and the hero shows one chip for them (the scope chip in its corner).
import type { ReactElement, ReactNode } from "react";
import type { Mandate, PacketState } from "../../../api/types";
import { formatHkd } from "../../../domain/money";
import { SIMULATED } from "../../../domain/provenance";
import { UI } from "../../../i18n/ui";
import { Tag, type TagTone } from "../../../ui/Chip";
import { Icon } from "../../../ui/icons";
import { useLocale, type Locale } from "../../../ui/locale";
import { RollingMoney } from "../../../ui/RollingNumber";
import { Fig, Fill, fillText, Money } from "../../../shell/figures";
import { formatDay } from "../../../shell/format";
import { useFromLast } from "../useFromLast";
import "./heroShared.css";

export const PROV = SIMULATED;
const BP_PER_PERCENT = 100;
const KNOWN_CATEGORIES = ["apparel", "footwear", "electronics", "groceries"] as const;
type KnownCategory = (typeof KNOWN_CATEGORIES)[number];
type T = (p: { readonly en: string; readonly zh: string }) => string;

function isKnown(slug: string): slug is KnownCategory {
  return (KNOWN_CATEGORIES as readonly string[]).includes(slug);
}

/** "Clothes" for apparel; an unknown slug shows as written. */
export function categoryName(slug: string, t: T): string {
  return isKnown(slug) ? t(UI[`home.cat.${slug}`]) : slug;
}

/**
 * Whether a budget names every category Wally knows and no other: such a budget has no category rule to list. (A fifth,
 * unknown category beside the four still gets its list, with "only": that is a limit the person should see.)
 */
export function allowsAnyCategory(slugs: readonly string[]): boolean {
  return KNOWN_CATEGORIES.every((known) => slugs.includes(known)) && slugs.every(isKnown);
}

/** The rule tag for what the budget can buy: "Any category" when all four are named, otherwise "Clothes, Shoes only". */
export function categoriesText(slugs: readonly string[], t: T): string {
  if (allowsAnyCategory(slugs)) return t(UI["home.anyCategory"]);
  const names = slugs.map((s) => categoryName(s, t));
  const joined = names.join(t(UI["home.listJoin"]));
  const sentence = fillText(t(UI["home.only"]), { things: joined });
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

export function meterText(packet: PacketState, t: T): string {
  return fillText(t(UI["home.meter"]), { left: formatHkd(packet.remaining_minor), total: formatHkd(packet.budget_minor) });
}

interface RuleTag {
  readonly key: string;
  readonly icon: ReactElement;
  readonly text: ReactNode;
}

function ruleTags(mandate: Mandate, t: T): readonly RuleTag[] {
  const { rules } = mandate;
  const per = rules.per_purchase;
  return [
    ...(mandate.parent === undefined ? [] : [{ key: "mum", icon: <Icon name="shieldCheck" size={14} />, text: t(UI.family.fromMum) }]),
    { key: "what", icon: <Icon name="tag" size={14} />, text: categoriesText(rules.categories, t) },
    { key: "sellers", icon: <Icon name="store" size={14} />, text: t(UI[rules.seller_check.require_capture ? "home.ruleVerified" : "home.ruleAnySeller"]) },
    ...(per?.ask_above_minor === undefined ? [] : [{ key: "ask", icon: <Icon name="hand" size={14} />, text: <Fill text={t(UI["home.ruleAsk"])} slots={{ amount: <Money minor={per.ask_above_minor} prov={PROV} /> }} /> }]),
    ...(per?.hard_cap_minor === undefined ? [] : [{ key: "cap", icon: <Icon name="card" size={14} />, text: <Fill text={t(UI["home.ruleCap"])} slots={{ amount: <Money minor={per.hard_cap_minor} prov={PROV} /> }} /> }]),
    ...(per?.share_of_remaining_bp === undefined ? [] : [{ key: "share", icon: <Icon name="card" size={14} />, text: <Fill text={t(UI["home.ruleShare"])} slots={{ share: <Fig prov={PROV} kind="percent">{`${Math.round(per.share_of_remaining_bp / BP_PER_PERCENT)}%`}</Fig> }} /> }]),
    { key: "signed", icon: <Icon name="lock" size={14} />, text: t(UI["home.ruleSigned"]) },
  ];
}

/** The rules as quiet tags. "on-hero" for the blue card; "neutral" or "primary" on a light surface. */
export function RuleTags({ mandate, tone = "on-hero", className }: { readonly mandate: Mandate; readonly tone?: TagTone; readonly className?: string }): ReactElement {
  const { t } = useLocale();
  return (
    <ul className={className} aria-label={t(UI["seal.rulesTitle"])}>
      {ruleTags(mandate, t).map((r) => (
        <li key={r.key}><Tag tone={tone} size="sm" icon={r.icon}>{r.text}</Tag></li>
      ))}
    </ul>
  );
}

export function MiniStat({ label, minor, className }: { readonly label: string; readonly minor: number; readonly className?: string }): ReactElement {
  return (
    <div className="hero-mini">
      <span className="hero-mini__label">{label}</span>
      <Money minor={minor} prov={PROV} className={className ?? "hero-mini__value"} />
    </div>
  );
}

export function UntilFig({ mandate, locale }: { readonly mandate: Mandate; readonly locale: Locale }): ReactElement {
  return <Fig prov={PROV} kind="time">{formatDay(mandate.valid_until, locale)}</Fig>;
}

/** "Left" label for the amount: a cancelled or ended budget says what was left when it stopped. */
export function leftLabel(status: PacketState["status"]): "home.left" | "home.leftCancelled" | "home.leftEnded" {
  return status === "REVOKED" ? "home.leftCancelled" : status === "EXPIRED" ? "home.leftEnded" : "home.left";
}

export interface HeroProps {
  readonly packet: PacketState;
  readonly mandate: Mandate;
}

/** The amount left: digits roll from what this screen last showed to what the budget holds now. */
export function RollingFig({ minor }: { readonly minor: number }): ReactElement {
  const shown = useFromLast("hero-left", minor);
  return (
    <Fig prov={PROV} kind="money">
      <RollingMoney minor={shown} />
    </Fig>
  );
}

/** The meter value to draw: travels from the last value shown, like the amount. */
export function useMeterValue(remainingMinor: number): number {
  return useFromLast("hero-meter", remainingMinor);
}
