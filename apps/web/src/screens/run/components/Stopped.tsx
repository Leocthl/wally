// Stopped before paying: one calm card. Wally with his shield and the title on one line, the plain reason from the
// engine's template and recorded inputs, the thing that was not bought (price struck through), and the four-step path
// with the stop marked at the rules check. Under it a green strip says no card was made and the budget is untouched, then
// what to do next. Red is only the rule's name, the shield and the struck price. role="alert" on the card.
import type { ReactElement, Ref } from "react";
import type { PacketState } from "../../../api/types";
import { UI } from "../../../i18n/ui";
import { Tag } from "../../../ui/Chip";
import { cx } from "../../../ui/cx";
import { Icon } from "../../../ui/icons";
import { useLocale } from "../../../ui/locale";
import { Wally } from "../../../wally/Wally";
import { stopView } from "../model/stop";
import type { Result } from "../model/screen";
import { CardStory } from "./CardStory";
import { Footnote } from "./parts";
import { ItemLine, SafeStrip, StopActions, StopPath } from "./stopParts";

const R = UI.run;

export { isBudgetStop } from "../model/stop";

export interface StoppedProps {
  readonly result: Result;
  readonly fresh: boolean;
  readonly headingRef: Ref<HTMLHeadingElement>;
  readonly onWhy: () => void;
  readonly onTopUp: () => void;
  readonly onAsk: () => void;
  /** Present only when the client offers alternatives. */
  readonly onCheaper?: () => void;
  /** What is left in the budget, for the safe strip. */
  readonly packet?: PacketState | null;
}

export function Stopped({ result, fresh, headingRef, onWhy, onTopUp, onAsk, onCheaper, packet }: StoppedProps): ReactElement | null {
  const { t } = useLocale();
  const view = stopView(result);
  if (!view) return null;
  // A story that only says why the card was cancelled repeats the card above; show it when it adds earlier attempts.
  const story = result.story.every((s) => s.kind === "drift" || s.kind === "void") ? [] : result.story;
  // A question that ended (you said no, nobody answered) is not a rules-check stop: the path would say it was.
  const path = result.answer === undefined;
  return (
    <div className="run-stack run-stop" data-run-state="stopped">
      <section className={cx("run-stop__card", fresh && "run-stop__card--enter")} role="alert">
        <div className="run-stop__head">
          <Wally state="stopped" size={68} decorative />
          <div className="run-stop__titles">
            <h2 className="run-stop__title" tabIndex={-1} ref={headingRef}>{t(R.stoppedTitle)}</h2>
            {view.chip ? <span className="run-stop__tags"><Tag tone="stop" size="sm" icon={<Icon name="hand" size={14} />}>{t(view.chip)}</Tag></span> : null}
          </div>
        </div>
        <p className="run-stop__lead">{t(view.lead)}</p>
        {view.reason ? <p className="run-stop__sub">{t(view.reason)}</p> : null}
        <ItemLine view={view} />
        {path ? <StopPath fresh={fresh} /> : null}
      </section>
      <SafeStrip view={view} packet={packet} />
      <CardStory story={story} limitMinor={result.card?.limit_minor ?? view.cart.total_minor} />
      <StopActions view={view} onWhy={onWhy} onTopUp={onTopUp} onAsk={onAsk} onCheaper={onCheaper} />
      <Footnote />
    </div>
  );
}
