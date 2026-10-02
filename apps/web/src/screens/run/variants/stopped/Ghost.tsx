// Variant 2, "Ghost card": the card that was not made. Wally, the title and the reason on top; under them a dashed card
// the size of the real one-off card, empty, with a quiet STOPPED stamp. It says "no card, no charge" without a word,
// and it is the mirror of the approved screen, where the real card sits in the same place.
import type { ReactElement } from "react";
import { cartProv } from "../../../../domain/provenance";
import { RUNX } from "../../../../i18n/runMore";
import { UI } from "../../../../i18n/ui";
import { ProvenanceChip, Tag } from "../../../../ui/Chip";
import { cx } from "../../../../ui/cx";
import { Icon } from "../../../../ui/icons";
import { useLocale } from "../../../../ui/locale";
import { Wally } from "../../../../wally/Wally";
import { CardStory } from "../../components/CardStory";
import { Footnote } from "../../components/parts";
import { stopView } from "../../model/stop";
import { ItemLine, StopActions } from "../../components/stopParts";
import type { StopVariantProps } from "./types";
import { formatHkd } from "../../../../domain/money";
import { SIMULATED } from "../../../../domain/provenance";

const R = UI.run;

export function StoppedGhost(p: StopVariantProps): ReactElement | null {
  const { t } = useLocale();
  const view = stopView(p.result);
  if (!view) return null;
  const story = p.result.story.every((s) => s.kind === "drift" || s.kind === "void") ? [] : p.result.story;
  return (
    <div className="run-stack sv-ghost" data-run-state="stopped">
      <section className={cx("sv-ghost__top", p.fresh && "sv-enter")} role="alert">
        <Wally state="stopped" size={92} decorative />
        <h2 className="sv-ghost__title" tabIndex={-1} ref={p.headingRef}>{t(R.stoppedTitle)}</h2>
        <p className="sv-ghost__lead">{t(view.lead)}</p>
        {view.reason ? <p className="sv-ghost__sub">{t(view.reason)}</p> : null}
        <span className="sv-ghost__tags">
          {view.chip ? <Tag tone="stop" icon={<Icon name="hand" size={16} />}>{t(view.chip)}</Tag> : null}
          <ProvenanceChip prov={cartProv(view.cart)} />
        </span>
      </section>
      <article className={cx("sv-ghost__card", p.fresh && "sv-ghost__card--enter")} aria-label={t(RUNX.noCardTitle)}>
        <span className="sv-ghost__label"><Icon name="card" size={18} /> {t(RUNX.cardLabel)}</span>
        <span className="sv-ghost__digits" aria-hidden="true">{"•••• ••••"}</span>
        <span className="sv-ghost__verdict">{t(view.cancelled ? R.cardCancelled : R.noCard)}</span>
        {p.packet ? (
          <span className="sv-ghost__budget">{t(RUNX.budgetUntouched(formatHkd(p.packet.remaining_minor)))} <ProvenanceChip prov={SIMULATED} /></span>
        ) : null}
        <span className="sv-ghost__stamp" aria-hidden="true">{t(RUNX.stampStopped)}</span>
      </article>
      <ItemLine view={view} />
      <CardStory story={story} limitMinor={p.result.card?.limit_minor ?? view.cart.total_minor} />
      <StopActions view={view} onWhy={p.onWhy} onTopUp={p.onTopUp} onAsk={p.onAsk} onCheaper={p.onCheaper} />
      <Footnote />
    </div>
  );
}
