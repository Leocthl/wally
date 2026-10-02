// Hero variant "Action first" (axis: what comes first). A compact card with the amount and a small ring that holds
// Wally, then, in the first screenful, a row of one-tap buys and stops to try. The budget is read in a second, the demo
// starts in a third.
import type { ReactElement } from "react";
import type { ScenarioId } from "../../../api/types";
import { HERO } from "../../../i18n/hero";
import { UI } from "../../../i18n/ui";
import { cx } from "../../../ui/cx";
import { Tag } from "../../../ui/Chip";
import { Ring } from "../../../ui/Data";
import { Icon } from "../../../ui/icons";
import { useLocale } from "../../../ui/locale";
import { Card } from "../../../ui/Surface";
import { Wally } from "../../../wally/Wally";
import { Fill, Money, ScopeChip } from "../../../shell/figures";
import { heroMood, MOOD_POSE } from "../heroModel";
import { TRY_ITEMS, type TryItem } from "../tryCatalog";
import { leftLabel, meterText, PROV, RollingFig, RuleTags, UntilFig, useMeterValue, type HeroProps } from "./heroParts";
import "./heroShared.css";
import "./heroAction.css";

const QUICK: readonly TryItem["id"][] = ["normal", "flagged", "unverified", "off_category", "injected", "overshoot"];

export interface HeroActionProps extends HeroProps {
  readonly onRun?: (id: ScenarioId) => void;
  readonly busy?: boolean;
}

export function HeroAction({ packet, mandate, onRun, busy = false }: HeroActionProps): ReactElement {
  const { t, locale } = useLocale();
  const mood = heroMood(packet);
  const active = packet.status === "ACTIVE";
  const meter = useMeterValue(packet.remaining_minor);
  const tiles = QUICK.flatMap((id) => TRY_ITEMS.filter((i) => i.id === id));
  return (
    <div className="hero-c">
      <Card tone="hero" padding="md" className="hero-c__card" data-chip-scope data-status={packet.status} aria-labelledby="home-hero-title">
        <h1 id="home-hero-title" className="hero-c__kicker">{t(UI["home.heading"])}</h1>
        {active ? null : <Tag tone="on-hero" size="sm" className="hero-c__status" icon={<Icon name="lock" size={14} />}>{t(UI[`home.status.${packet.status}`])}</Tag>}
        <ScopeChip prov={PROV} className="hero-c__chip" />
        <div className="hero-c__main">
          <div className="w-stat w-stat--lg w-stat--on-hero hero-c__stat">
            <span className="w-stat__label">{t(UI[leftLabel(packet.status)])}</span>
            <span className="w-stat__row"><span className="w-stat__value" data-selectable><RollingFig minor={packet.remaining_minor} /></span></span>
            <span className="w-stat__sub"><span><Fill text={t(UI["home.of"])} slots={{ total: <Money minor={packet.budget_minor} prov={PROV} />, until: <UntilFig mandate={mandate} locale={locale} /> }} /></span></span>
          </div>
          <Ring tone="on-hero" size={84} thickness={9} value={meter} max={packet.budget_minor} label={t(UI["home.left"])} valueText={meterText(packet, t)} className="hero-c__ring">
            <Wally state={MOOD_POSE[mood]} size={48} decorative />
          </Ring>
        </div>
        <RuleTags mandate={mandate} className="hero-c__tags hero-tags" />
      </Card>
      <section className="hero-c__try" aria-labelledby="hero-c-try">
        <h2 id="hero-c-try" className="hero-c__try-title">{t(HERO.tryTitle)}</h2>
        <ul className="hero-c__tiles">
          {tiles.map((s) => (
            <li key={s.id}>
              <button type="button" className={cx("hero-c__tile", `hero-c__tile--${s.tone}`)} data-quick={s.id} disabled={busy || !onRun} onClick={() => onRun?.(s.id)}>
                <span className="hero-c__tile-icon"><Icon name={s.icon} size={20} /></span>
                <span className="hero-c__tile-title">{t(UI[`home.sc.${s.id}`])}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
