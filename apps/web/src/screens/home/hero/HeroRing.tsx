// Hero variant "Ring" (axis: data at a glance). A light card with one ring that reads in a blink: how much is left (blue),
// held on one-off cards (teal) and spent (grey). The amount sits in the ring; Wally perches on its edge and his face
// follows the budget's mood.
import type { CSSProperties, ReactElement } from "react";
import { HERO } from "../../../i18n/hero";
import { UI } from "../../../i18n/ui";
import { Tag } from "../../../ui/Chip";
import { Icon } from "../../../ui/icons";
import { useLocale } from "../../../ui/locale";
import { Card } from "../../../ui/Surface";
import { Wally } from "../../../wally/Wally";
import { Money, ScopeChip } from "../../../shell/figures";
import { heroMood, MOOD_POSE, shares } from "../heroModel";
import { useFromLast } from "../useFromLast";
import { leftLabel, meterText, PROV, RollingFig, RuleTags, UntilFig, type HeroProps } from "./heroParts";
import "./heroShared.css";
import "./heroRing.css";

const SIZE = 232;
const THICK = 18;
const RADIUS = (SIZE - THICK) / 2;
const CIRC = 2 * Math.PI * RADIUS;
const GAP = 4;

interface Arc {
  readonly kind: "left" | "held" | "spent";
  readonly from: number;
  readonly share: number;
}

/** Arcs one after another from 12 o'clock, each pulled in by its rounded caps so neighbours do not touch. */
function arcs(left: number, held: number, spent: number): readonly Arc[] {
  const parts = [{ kind: "left", share: left }, { kind: "held", share: held }, { kind: "spent", share: spent }] as const;
  return parts.reduce<readonly Arc[]>((out, p) => {
    const from = out.reduce((n, a) => n + a.share, 0);
    return [...out, { kind: p.kind, from, share: p.share }];
  }, []);
}

function Arcs({ left, held, spent }: { readonly left: number; readonly held: number; readonly spent: number }): ReactElement {
  const visible = arcs(left, held, spent).filter((a) => a.share > 0);
  const whole = visible.length === 1 && (visible[0]?.share ?? 0) >= 0.999;
  return (
    <svg className="hero-b__svg" width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true" focusable="false">
      <circle className="hero-b__track" cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} strokeWidth={THICK} fill="none" />
      {visible.map((a) => {
        const length = whole ? CIRC : Math.max(0, a.share * CIRC - THICK - GAP);
        const start = whole ? 0 : a.from * CIRC + (THICK + GAP) / 2;
        return (
          <circle
            key={a.kind}
            className={`hero-b__arc hero-b__arc--${a.kind}`}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            strokeWidth={THICK}
            fill="none"
            strokeLinecap={whole ? "butt" : "round"}
            strokeDasharray={`${Math.max(length, 0.01).toFixed(2)} ${CIRC.toFixed(2)}`}
            strokeDashoffset={(-start).toFixed(2)}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        );
      })}
    </svg>
  );
}

function Legend({ packet, mandate }: HeroProps): ReactElement {
  const { t, locale } = useLocale();
  return (
    <dl className="hero-b__legend">
      <div className="hero-b__key"><dt><i className="hero-b__dot hero-b__dot--spent" aria-hidden="true" />{t(UI["home.spent"])}</dt><dd><Money minor={packet.spent_minor} prov={PROV} /></dd></div>
      <div className="hero-b__key"><dt><i className="hero-b__dot hero-b__dot--held" aria-hidden="true" />{t(UI["home.held"])}</dt><dd><Money minor={packet.committed_minor} prov={PROV} /></dd></div>
      <div className="hero-b__key"><dt><Icon name="clock" size={14} />{t(HERO.until)}</dt><dd><UntilFig mandate={mandate} locale={locale} /></dd></div>
    </dl>
  );
}

export function HeroRing({ packet, mandate }: HeroProps): ReactElement {
  const { t } = useLocale();
  const mood = heroMood(packet);
  const active = packet.status === "ACTIVE";
  const now = shares(packet);
  const left = useFromLast("ring-left", now.left);
  const held = useFromLast("ring-held", now.held);
  const spent = useFromLast("ring-spent", now.spent);
  const long = packet.remaining_minor >= 1_000_000;
  return (
    <Card padding="lg" className="hero-b" data-chip-scope data-status={packet.status} data-mood={mood} aria-labelledby="home-hero-title">
      <h1 id="home-hero-title" className="hero-b__kicker">{t(UI["home.heading"])}</h1>
      {active ? null : <Tag tone="neutral" size="sm" className="hero-b__status" icon={<Icon name="lock" size={14} />}>{t(UI[`home.status.${packet.status}`])}</Tag>}
      <ScopeChip prov={PROV} className="hero-b__chip" />
      <div
        className="hero-b__ring"
        role="meter"
        aria-label={t(UI["home.left"])}
        aria-valuemin={0}
        aria-valuemax={packet.budget_minor}
        aria-valuenow={Math.min(Math.max(packet.remaining_minor, 0), packet.budget_minor)}
        aria-valuetext={meterText(packet, t)}
        style={{ "--ring": `${SIZE}px` } as CSSProperties}
      >
        <Arcs left={left} held={held} spent={spent} />
        <div className="hero-b__center" data-long={long || undefined}>
          <span className="hero-b__label">{t(UI[leftLabel(packet.status)])}</span>
          <span className="hero-b__amount" data-selectable><RollingFig minor={packet.remaining_minor} /></span>
          <span className="hero-b__of"><Money minor={packet.budget_minor} prov={PROV} /></span>
        </div>
        <Wally state={MOOD_POSE[mood]} size={56} decorative className="hero-b__wally" />
      </div>
      <p className="hero-b__mood" key={mood}>{t(HERO.mood[mood])}</p>
      <Legend packet={packet} mandate={mandate} />
      <RuleTags mandate={mandate} tone="primary" className="hero-b__tags hero-tags" />
    </Card>
  );
}
