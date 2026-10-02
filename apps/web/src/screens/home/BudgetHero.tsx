// The budget card: what is left in big type, of the total and until when, a meter, spent and held on cards, and the
// rules as quiet tags. All figures are SIMULATED and share one chip in the card's corner.
import type { ReactElement, ReactNode } from "react";
import type { Mandate, PacketState } from "../../api/types";
import { formatHkd } from "../../domain/money";
import { SIMULATED } from "../../domain/provenance";
import { UI } from "../../i18n/ui";
import { Tag } from "../../ui/Chip";
import { ProgressBar } from "../../ui/Data";
import { Icon } from "../../ui/icons";
import { useLocale, type Locale } from "../../ui/locale";
import { Card } from "../../ui/Surface";
import { Fig, Fill, fillText, Money, ScopeChip } from "../../shell/figures";
import { formatDay } from "../../shell/format";

const PROV = SIMULATED;
const BP_PER_PERCENT = 100;
const KNOWN_CATEGORIES = ["apparel", "footwear", "electronics", "groceries"] as const;
type KnownCategory = (typeof KNOWN_CATEGORIES)[number];

function isKnown(slug: string): slug is KnownCategory {
  return (KNOWN_CATEGORIES as readonly string[]).includes(slug);
}

/** "Clothes" for apparel; an unknown slug shows as written. */
export function categoryName(slug: string, t: (p: { readonly en: string; readonly zh: string }) => string): string {
  return isKnown(slug) ? t(UI[`home.cat.${slug}`]) : slug;
}

export function categoriesText(slugs: readonly string[], t: (p: { readonly en: string; readonly zh: string }) => string): string {
  const names = slugs.map((s) => categoryName(s, t));
  const joined = names.join(t(UI["home.listJoin"]));
  const sentence = fillText(t(UI["home.only"]), { things: joined });
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

interface RuleTag {
  readonly key: string;
  readonly icon: ReactElement;
  readonly text: ReactNode;
}

function ruleTags(mandate: Mandate, t: (p: { readonly en: string; readonly zh: string }) => string): readonly RuleTag[] {
  const { rules } = mandate;
  const per = rules.per_purchase;
  return [
    { key: "what", icon: <Icon name="tag" size={14} />, text: categoriesText(rules.categories, t) },
    { key: "sellers", icon: <Icon name="store" size={14} />, text: t(UI[rules.seller_check.require_capture ? "home.ruleVerified" : "home.ruleAnySeller"]) },
    ...(per?.ask_above_minor === undefined ? [] : [{ key: "ask", icon: <Icon name="hand" size={14} />, text: <Fill text={t(UI["home.ruleAsk"])} slots={{ amount: <Money minor={per.ask_above_minor} prov={PROV} /> }} /> }]),
    ...(per?.hard_cap_minor === undefined ? [] : [{ key: "cap", icon: <Icon name="card" size={14} />, text: <Fill text={t(UI["home.ruleCap"])} slots={{ amount: <Money minor={per.hard_cap_minor} prov={PROV} /> }} /> }]),
    ...(per?.share_of_remaining_bp === undefined ? [] : [{ key: "share", icon: <Icon name="card" size={14} />, text: <Fill text={t(UI["home.ruleShare"])} slots={{ share: <Fig prov={PROV} kind="percent">{`${Math.round(per.share_of_remaining_bp / BP_PER_PERCENT)}%`}</Fig> }} /> }]),
    { key: "signed", icon: <Icon name="lock" size={14} />, text: t(UI["home.ruleSigned"]) },
  ];
}

export function meterText(packet: PacketState, t: (p: { readonly en: string; readonly zh: string }) => string): string {
  return fillText(t(UI["home.meter"]), { left: formatHkd(packet.remaining_minor), total: formatHkd(packet.budget_minor) });
}

function MiniStat({ label, minor }: { readonly label: string; readonly minor: number }): ReactElement {
  return (
    <div className="home-hero__mini">
      <span className="home-hero__mini-label">{label}</span>
      <Money minor={minor} prov={PROV} className="home-hero__mini-value" />
    </div>
  );
}

export interface BudgetHeroProps {
  readonly packet: PacketState;
  readonly mandate: Mandate;
}

function until(mandate: Mandate, locale: Locale): ReactElement {
  return <Fig prov={PROV} kind="time">{formatDay(mandate.valid_until, locale)}</Fig>;
}

export function BudgetHero({ packet, mandate }: BudgetHeroProps): ReactElement {
  const { t, locale } = useLocale();
  const active = packet.status === "ACTIVE";
  return (
    <Card tone="hero" padding="lg" className="home-hero" data-chip-scope data-status={packet.status} aria-labelledby="home-hero-title">
      <h1 id="home-hero-title" className="home-hero__kicker">{t(UI["home.heading"])}</h1>
      {active ? null : <Tag tone="on-hero" size="sm" className="home-hero__status" icon={<Icon name="lock" size={14} />}>{t(UI[`home.status.${packet.status}`])}</Tag>}
      <ScopeChip prov={PROV} className="home-hero__chip" />
      <div className="w-stat w-stat--xl w-stat--on-hero home-hero__stat">
        <span className="w-stat__label">{t(UI[packet.status === "REVOKED" ? "home.leftCancelled" : packet.status === "EXPIRED" ? "home.leftEnded" : "home.left"])}</span>
        <span className="w-stat__row">
          <span className="w-stat__value" data-selectable><Money minor={packet.remaining_minor} prov={PROV} /></span>
        </span>
        <span className="w-stat__sub">
          <span><Fill text={t(UI["home.of"])} slots={{ total: <Money minor={packet.budget_minor} prov={PROV} />, until: until(mandate, locale) }} /></span>
        </span>
      </div>
      <ProgressBar tone="on-hero" role="meter" value={packet.remaining_minor} max={packet.budget_minor} label={t(UI["home.left"])} valueText={meterText(packet, t)} className="home-hero__meter" />
      <div className="home-hero__minis">
        <MiniStat label={t(UI["home.spent"])} minor={packet.spent_minor} />
        <MiniStat label={t(UI["home.held"])} minor={packet.committed_minor} />
      </div>
      <ul className="home-hero__tags" aria-label={t(UI["seal.rulesTitle"])}>
        {ruleTags(mandate, t).map((r) => (
          <li key={r.key}><Tag tone="on-hero" size="sm" icon={r.icon}>{r.text}</Tag></li>
        ))}
      </ul>
    </Card>
  );
}
