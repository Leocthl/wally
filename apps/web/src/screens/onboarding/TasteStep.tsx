// Step two, Your taste: style chips, colour swatches, usual sizes and what the person shops for. All optional. What they
// shop for starts the first budget's form (categories and amount, which the person then reviews and signs); the rest only
// changes what Wally shows first. Nothing here reaches the planner, the judge or the rules engine.
import type { ReactElement } from "react";
import { OB } from "../../i18n/onboarding";
import { useBoothContext } from "../../hooks/useBooth";
import { mergeProfile, type Profile } from "../../state/profile";
import { COLOUR_IDS, SHOE_SIZES, SHOP_IDS, SIZE_LETTERS, STYLE_IDS } from "../../state/taste";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { categoryName } from "../home/BudgetHero";
import { ChipGroup, SizeRow, SwatchGrid } from "./controls";
import { StepFrame, type SkipControl } from "./StepFrame";

export interface TasteStepProps {
  /** The taste so far (a profile; its nickname is not used here). */
  readonly taste: Profile;
  readonly onTaste: (next: Profile) => void;
  readonly onBack: () => void;
  readonly onNext: () => void;
  readonly dir: "fwd" | "back";
  readonly skip: SkipControl;
}

export function TasteStep({ taste, onTaste, onBack, onNext, dir, skip }: TasteStepProps): ReactElement {
  const { t } = useLocale();
  // What they shop for fills in the first budget's form; a booth that already holds a budget has no such form.
  const { state } = useBoothContext();
  return (
    <StepFrame
      step="taste"
      wally="thinking"
      title={t(OB.taste.title)}
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
        <p className="onb-lead">{t(OB.taste.lead)}</p>
        <div className="onb-block">
          <h2 className="onb-label" id="onb-styles">{t(OB.taste.styles)}</h2>
          <ChipGroup
            label={t(OB.taste.styles)}
            options={STYLE_IDS.map((id) => ({ id, label: t(OB.taste.style[id]) }))}
            selected={taste.styles}
            onChange={(styles) => onTaste(mergeProfile(taste, { styles }))}
          />
        </div>
        <div className="onb-block">
          <h2 className="onb-label" id="onb-colours">{t(OB.taste.colours)}</h2>
          <SwatchGrid
            label={t(OB.taste.colours)}
            options={COLOUR_IDS.map((id) => ({ id, label: t(OB.taste.colour[id]) }))}
            selected={taste.colours}
            onChange={(colours) => onTaste(mergeProfile(taste, { colours }))}
          />
        </div>
        <div className="onb-block">
          <h2 className="onb-label" id="onb-sizes">{t(OB.taste.sizes)}</h2>
          <SizeRow label={t(OB.taste.top)} options={SIZE_LETTERS} value={taste.sizes.top} onChange={(top) => onTaste(mergeProfile(taste, { sizes: { ...taste.sizes, top } }))} />
          <SizeRow label={t(OB.taste.bottom)} options={SIZE_LETTERS} value={taste.sizes.bottom} onChange={(bottom) => onTaste(mergeProfile(taste, { sizes: { ...taste.sizes, bottom } }))} />
          <SizeRow label={t(OB.taste.shoe)} options={SHOE_SIZES} value={taste.sizes.shoe} onChange={(shoe) => onTaste(mergeProfile(taste, { sizes: { ...taste.sizes, shoe } }))} />
        </div>
        <div className="onb-block">
          <h2 className="onb-label" id="onb-shop">{t(OB.taste.shopFor)}</h2>
          {state.mandate === null ? <p className="onb-hint">{t(OB.taste.shopForHint)}</p> : null}
          <ChipGroup
            label={t(OB.taste.shopFor)}
            options={SHOP_IDS.map((id) => ({ id, label: categoryName(id, t) }))}
            selected={taste.shopFor}
            onChange={(shopFor) => onTaste(mergeProfile(taste, { shopFor }))}
          />
        </div>
        <p className="onb-privacy"><Icon name="lock" size={16} /> {t(OB.privacy)}</p>
      </div>
    </StepFrame>
  );
}
