// Step two, What can Wally buy for you? One broad, optional question: which kinds of purchase this budget may cover. Four chips for
// the engine's categories, all ticked at the start (that is what "any category" means); the person unticks what they do not want.
// What is ticked starts the first budget's form on the next step (the person reviews and signs it there). Nothing here reaches the
// planner, the judge or the rules engine. The step says that the demo shop stocks only some of the four: the rules reach further
// than the sample shelf does.
import { useId, type ReactElement } from "react";
import { useBoothContext } from "../../hooks/useBooth";
import { OB } from "../../i18n/onboarding";
import { SHOP_IDS, type ShopId } from "../../state/shopping";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { ChipGroup } from "./controls";
import { holdsLiveBudget } from "./liveBudget";
import { StepFrame, type SkipControl } from "./StepFrame";

export interface BuyStepProps {
  /** The kinds ticked now: all four until the person unticks one. */
  readonly ticked: readonly ShopId[];
  readonly onTicked: (next: readonly ShopId[]) => void;
  readonly onBack: () => void;
  readonly onNext: () => void;
  readonly dir: "fwd" | "back";
  readonly skip: SkipControl;
}

export function BuyStep({ ticked, onTicked, onBack, onNext, dir, skip }: BuyStepProps): ReactElement {
  const { t } = useLocale();
  const { state } = useBoothContext();
  const hintId = useId();
  // A booth that already holds a live budget has no form to start: the ticks only change what Wally shows first.
  const hint = holdsLiveBudget(state) ? OB.buy.hintHeld : ticked.length === 0 ? OB.buy.hintNone : OB.buy.hintForm;
  return (
    <StepFrame
      step="buy"
      wally="thinking"
      title={t(OB.buy.title)}
      dir={dir}
      skip={skip}
      actions={
        <div className="onb-actions__row">
          <Button variant="secondary" size="lg" icon={<Icon name="chevronLeft" size={20} />} onClick={onBack} data-back>{t(OB.back)}</Button>
          <Button size="lg" className="onb-actions__grow" iconEnd={<Icon name="chevronRight" size={20} />} onClick={onNext} data-next>{t(OB.next)}</Button>
        </div>
      }
    >
      <div className="onb-body">
        <p className="onb-lead">{t(OB.buy.lead)}</p>
        <div className="onb-block">
          <ChipGroup
            label={t(OB.buy.group)}
            options={SHOP_IDS.map((id) => ({ id, label: t(OB.buy.kind[id]) }))}
            selected={ticked}
            onChange={onTicked}
            describedBy={hintId}
          />
          <p className="onb-hint" id={hintId} aria-live="polite" data-buy-hint>{t(hint)}</p>
        </div>
        <p className="onb-note" data-buy-note><Icon name="info" size={16} /> <span>{t(OB.buy.shopNote)}</span></p>
        <p className="onb-privacy"><Icon name="lock" size={16} /> {t(OB.privacy)}</p>
      </div>
    </StepFrame>
  );
}
