// The budget hero. Wally stands beside a speech bubble that says in one line what the budget is doing (ready, shopping
// inside the rules, waiting for your OK, all used, cancelled, ended), and the card below carries the figures: what is
// left in rolling digits, of the total and until when, a meter, spent and held on cards, and the rules as quiet tags.
// All figures are SIMULATED and share one chip in the card's corner. The mood is a pure function of the packet.
import type { ReactElement } from "react";
import { HERO } from "../../i18n/hero";
import { OB } from "../../i18n/onboarding";
import { UI } from "../../i18n/ui";
import { useNickname } from "../../state/useProfile";
import { Tag } from "../../ui/Chip";
import { ProgressBar } from "../../ui/Data";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { Card } from "../../ui/Surface";
import { Wally } from "../../wally/Wally";
import { Fill, Money, ScopeChip } from "../../shell/figures";
import { greetingFor, heroMood, MOOD_POSE } from "./heroModel";
import { leftLabel, meterText, MiniStat, PROV, RollingFig, RuleTags, UntilFig, useMeterValue, type HeroProps } from "./hero/heroParts";
import { useHeroMotion } from "./useHeroMotion";
import "./hero.css";

export { categoriesText, categoryName, meterText } from "./hero/heroParts";
export type { HeroProps as BudgetHeroProps } from "./hero/heroParts";

export function BudgetHero({ packet, mandate }: HeroProps): ReactElement {
  const { t, locale } = useLocale();
  const mood = heroMood(packet);
  const nickname = useNickname();
  const greeting = greetingFor(mood, nickname);
  const { welcome, moodSeq } = useHeroMotion(mood);
  const active = packet.status === "ACTIVE";
  const meter = useMeterValue(packet.remaining_minor);
  return (
    <div className="home-hero" data-mood={mood} data-welcome={welcome || undefined}>
      <div className="home-hero__greet">
        <Wally state={MOOD_POSE[mood]} size={76} decorative className="home-hero__wally" />
        <p className="home-hero__bubble" key={moodSeq} data-pop={welcome || moodSeq > 0 || undefined}>
          {greeting === "none" ? null : <span className="home-hero__hi">{t(greeting === "intro" ? HERO.hi : greeting === "introNamed" ? OB.home.hiNamed(nickname) : OB.home.hi(nickname))}</span>}
          <span className="home-hero__mood">{t(HERO.mood[mood])}</span>
        </p>
      </div>
      <Card tone="hero" padding="lg" className="home-hero__card" data-chip-scope data-status={packet.status} aria-labelledby="home-hero-title">
        <h1 id="home-hero-title" className="home-hero__kicker">{t(UI["home.heading"])}</h1>
        {active ? null : <Tag tone="on-hero" size="sm" className="home-hero__status" icon={<Icon name="lock" size={14} />}>{t(UI[`home.status.${packet.status}`])}</Tag>}
        <ScopeChip prov={PROV} className="home-hero__chip" />
        <div className="w-stat w-stat--xl w-stat--on-hero home-hero__stat">
          <span className="w-stat__label">{t(UI[leftLabel(packet.status)])}</span>
          <span className="w-stat__row">
            <span className="w-stat__value" data-selectable><RollingFig minor={packet.remaining_minor} /></span>
          </span>
          <span className="w-stat__sub">
            <span><Fill text={t(UI["home.of"])} slots={{ total: <Money minor={packet.budget_minor} prov={PROV} />, until: <UntilFig mandate={mandate} locale={locale} /> }} /></span>
          </span>
        </div>
        <ProgressBar tone="on-hero" role="meter" value={meter} max={packet.budget_minor} label={t(UI["home.left"])} valueText={meterText(packet, t)} className="home-hero__meter" />
        <div className="home-hero__minis">
          <MiniStat label={t(UI["home.spent"])} minor={packet.spent_minor} />
          <MiniStat label={t(UI["home.held"])} minor={packet.committed_minor} />
        </div>
        <RuleTags mandate={mandate} className="home-hero__tags hero-tags" />
      </Card>
    </div>
  );
}
