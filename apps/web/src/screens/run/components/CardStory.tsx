// The card's story at checkout, one row per rail answer (docs/06 DM2): charged more -> declined, limit held; exact
// charge -> charged; used again -> declined; wrong shop -> declined; price changed -> approval cancelled; timeout ->
// retried once, charged once. Icon + words, never colour alone. Every amount here is SIMULATED (the rail is).
import { useId, type ReactElement } from "react";
import { formatHkd } from "../../../domain/money";
import { SIMULATED } from "../../../domain/provenance";
import type { LabelPair } from "../../../i18n/label";
import { UI } from "../../../i18n/ui";
import { ProvenanceChip } from "../../../ui/Chip";
import { Icon, type IconName } from "../../../ui/icons";
import { useLocale } from "../../../ui/locale";
import type { StoryItem, StoryKind } from "../model/story";

const R = UI.run;

const ICON: Readonly<Record<StoryKind, IconName>> = {
  overshoot: "hand",
  exact: "checkCircle",
  retry: "refresh",
  replay: "hand",
  wrong_shop: "store",
  declined: "hand",
  drift: "alert",
  void: "close",
  expire: "clock",
};

function line(item: StoryItem, limitMinor: number): LabelPair {
  const amount = item.amountMinor === undefined ? undefined : formatHkd(item.amountMinor);
  switch (item.kind) {
    case "overshoot":
      return amount ? R.beatOvershoot(amount, formatHkd(limitMinor)) : R.beatDeclined;
    case "exact":
      return R.beatExact(amount ?? formatHkd(limitMinor));
    case "retry":
      return R.beatRetry(amount ?? formatHkd(limitMinor));
    case "replay":
      return R.beatReplay;
    case "wrong_shop":
      return R.beatWrongShop;
    case "declined":
      return R.beatDeclined;
    case "drift":
      return R.beatDrift;
    case "void":
      return R.beatVoid;
    case "expire":
      return R.beatExpire;
  }
}

export function CardStory({ story, limitMinor }: { readonly story: readonly StoryItem[]; readonly limitMinor: number }): ReactElement | null {
  const { t } = useLocale();
  const id = useId();
  if (story.length === 0) return null;
  return (
    <section className="run-story" aria-labelledby={id}>
      <div className="run-story__head">
        <h3 id={id} className="run-section-title">{t(R.storyTitle)}</h3>
        <ProvenanceChip prov={SIMULATED} />
      </div>
      <ol className="run-story__list">
        {story.map((item) => (
          <li key={item.key} className="run-story__item" data-tone={item.tone} data-kind={item.kind}>
            <span className="run-story__icon"><Icon name={ICON[item.kind]} size={18} /></span>
            <span className="run-story__text">{t(line(item, limitMinor))}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
