// Shared by the Needs your OK layouts: the answer window's clock (real time, announced at the start and the end only),
// the countdown line that drains smoothly, the deal summary, and what saying yes will do. An answer can clear a question
// but never a fixed rule; the screen says so before you answer.
import { useEffect, useRef, type ReactElement } from "react";
import { formatHkd } from "../../../domain/money";
import { cartProv } from "../../../domain/provenance";
import { RUNX } from "../../../i18n/runMore";
import { UI } from "../../../i18n/ui";
import { ProvenanceChip } from "../../../ui/Chip";
import { haptic } from "../../../ui/haptics";
import { Icon } from "../../../ui/icons";
import { useLocale } from "../../../ui/locale";
import { useSecondsLeft } from "../hooks";
import { itemTitle, shopName } from "../model/item";
import type { Result } from "../model/screen";
import type { Cart, EscalationView } from "../../../api/types";

const R = UI.run;
const MS_PER_S = 1000;

export interface OkClock {
  readonly esc: EscalationView | undefined;
  /** Whole seconds left, or undefined when there is no open question. */
  readonly left: number | undefined;
  readonly windowS: number;
  /** The window is over, or the question was already answered or expired. */
  readonly over: boolean;
  /** 1 at the start of the window, 0 at its end. */
  readonly ratio: number;
  readonly announcement: string;
}

/** Announces the window once when it opens and once when it ends; the ticking number itself stays silent. */
function useAnnouncement(left: number | undefined, windowS: number): string {
  const { t } = useLocale();
  const said = useRef<"none" | "start" | "end">("none");
  useEffect(() => {
    if (left === 0 && said.current !== "end") {
      said.current = "end";
      haptic("warning");
    } else if (left !== undefined && left > 0 && said.current === "none") said.current = "start";
  }, [left]);
  if (left === undefined) return "";
  return left === 0 ? t(R.timesUp) : t(R.answerStart(String(windowS)));
}

export function useOkClock(result: Result, now?: () => number): OkClock {
  const esc = result.escalation;
  const left = useSecondsLeft(esc?.state === "OPEN" ? esc.expiresAt : undefined, now);
  const windowS = esc ? Math.max(1, Math.round((Date.parse(esc.expiresAt) - Date.parse(esc.openedAt)) / MS_PER_S)) : 0;
  const announcement = useAnnouncement(left, windowS);
  const closed = esc !== undefined && esc.state !== "OPEN";
  const over = left === 0 || closed;
  const ratio = left === undefined || windowS === 0 ? 0 : left / windowS;
  return { esc, left, windowS, over, ratio, announcement };
}

/** "Time to answer" and the seconds left, over a line that drains once a second without stepping. */
export function Countdown({ clock }: { readonly clock: OkClock }): ReactElement | null {
  const { t } = useLocale();
  if (!clock.esc || clock.left === undefined) return null;
  return (
    <div className="run-countdown" data-over={clock.over || undefined}>
      <div className="run-countdown__row">
        <span>{t(R.timeToAnswer)}</span>
        <span role="timer" aria-live="off" className="run-countdown__left">{clock.over ? t(R.timesUp) : t(R.secondsLeft(String(clock.left)))}</span>
      </div>
      <span className="run-countdown__track" aria-hidden="true"><span className="run-countdown__fill" style={{ transform: `scaleX(${clock.ratio.toFixed(3)})` }} /></span>
    </div>
  );
}

/** What is being asked about: the item, the shop, the amount with its chip. */
export function Deal({ cart }: { readonly cart: Cart }): ReactElement {
  return (
    <div className="run-ask__deal">
      <span className="run-ask__item">{itemTitle(cart)}</span>
      <span className="run-ask__shop">{shopName(cart)}</span>
      <span className="run-ask__amount"><span data-selectable>{formatHkd(cart.total_minor)}</span> <ProvenanceChip prov={cartProv(cart)} /></span>
    </div>
  );
}

/** The two things yes does, in plain words, so the person knows what they are signing. */
export function YesDoes({ cart }: { readonly cart: Cart }): ReactElement {
  const { t } = useLocale();
  const amount = formatHkd(cart.total_minor);
  return (
    <div className="run-yes">
      <h3 className="run-yes__title">{t(RUNX.youAllow)}</h3>
      <ul className="run-yes__list">
        <li><Icon name="card" size={18} /> <span>{t(RUNX.willMake(amount))}</span></li>
        <li><Icon name="lock" size={18} /> <span>{t(RUNX.onlyThisShop(shopName(cart)))}</span></li>
      </ul>
    </div>
  );
}
