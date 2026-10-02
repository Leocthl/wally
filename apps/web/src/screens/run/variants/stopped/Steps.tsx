// Variant 3, "Where it stopped": the same four steps the person watched while Wally was shopping, now settled. The first
// two are done, the rules check is where it stopped (the reason sits inside that step), and the card step says no card
// was made. Nothing jumps: the shopping screen turns into this one.
import type { ReactElement } from "react";
import { UI } from "../../../../i18n/ui";
import { RUNX } from "../../../../i18n/runMore";
import { cartProv } from "../../../../domain/provenance";
import { ProvenanceChip, Tag } from "../../../../ui/Chip";
import { cx } from "../../../../ui/cx";
import { Icon } from "../../../../ui/icons";
import { useLocale } from "../../../../ui/locale";
import { Steps, type StepItem } from "../../../../ui/Steps";
import { Card } from "../../../../ui/Surface";
import { CardStory } from "../../components/CardStory";
import { Footnote } from "../../components/parts";
import { itemTitle } from "../../model/item";
import { stopView } from "../../model/stop";
import { ItemLine, SafeStrip, StopActions } from "../../components/stopParts";
import type { StopVariantProps } from "./types";

const R = UI.run;

export function StoppedSteps(p: StopVariantProps): ReactElement | null {
  const { t } = useLocale();
  const view = stopView(p.result);
  if (!view) return null;
  const story = p.result.story.every((s) => s.kind === "drift" || s.kind === "void") ? [] : p.result.story;
  const steps: readonly StepItem[] = [
    { id: "pick", title: t(R.stepPick), detail: t(R.stepPicked(itemTitle(view.cart))), status: "done" },
    { id: "read", title: t(R.stepRead), detail: t(R.stepReadDetail), status: "done" },
    {
      id: "rules",
      title: t(R.stepRules),
      detail: (
        <span className="sv-steps__why">
          <span>{t(view.lead)}</span>
          {view.reason ? <span>{t(view.reason)}</span> : null}
          {view.chip ? <Tag tone="stop" size="sm" icon={<Icon name="hand" size={14} />}>{t(view.chip)}</Tag> : null}
        </span>
      ),
      status: "stop",
    },
    { id: "card", title: t(R.stepCard), detail: t(view.cancelled ? R.cardCancelled : R.stepCardNone), status: "waiting" },
  ];
  return (
    <div className="run-stack sv-steps" data-run-state="stopped">
      <section className={cx("sv-steps__banner", p.fresh && "sv-enter")} role="alert">
        <h2 className="sv-steps__title" tabIndex={-1} ref={p.headingRef}>{t(R.stoppedTitle)}</h2>
        <span className="sv-steps__hint">{t(RUNX.stoppedAt)} <ProvenanceChip prov={cartProv(view.cart)} /></span>
      </section>
      <Card className="sv-steps__card">
        <ItemLine view={view} />
        <Steps label={t(R.stepsLabel)} items={steps} />
      </Card>
      <SafeStrip view={view} packet={p.packet} />
      <CardStory story={story} limitMinor={p.result.card?.limit_minor ?? view.cart.total_minor} />
      <StopActions view={view} onWhy={p.onWhy} onTopUp={p.onTopUp} onAsk={p.onAsk} onCheaper={p.onCheaper} />
      <Footnote />
    </div>
  );
}
