// Needs your OK: the reason in plain words, the item, shop and amount, a countdown to the answer window's end (real
// time, announced at the start and the end only), and Approve / No thanks. An answer can clear a question (seller not
// checked, listing unclear, over your ask-first amount) but never a fixed rule; the screen says so before you answer.
import { useEffect, useRef, type ReactElement, type Ref } from "react";
import { formatHkd } from "../../../domain/money";
import { cartProv } from "../../../domain/provenance";
import { UI } from "../../../i18n/ui";
import { Button } from "../../../ui/Button";
import { ProvenanceChip } from "../../../ui/Chip";
import { haptic } from "../../../ui/haptics";
import { Icon } from "../../../ui/icons";
import { useLocale } from "../../../ui/locale";
import { Card } from "../../../ui/Surface";
import { Wally } from "../../../wally/Wally";
import { useSecondsLeft } from "../hooks";
import { itemTitle, shopName } from "../model/item";
import { plainReason } from "../model/reason";
import type { Result } from "../model/screen";

const R = UI.run;
const MS_PER_S = 1000;

export interface NeedsOkProps {
  readonly result: Result;
  readonly headingRef: Ref<HTMLHeadingElement>;
  readonly answering: "APPROVE" | "DENY" | null;
  readonly onAnswer: (choice: "APPROVE" | "DENY") => void;
  readonly onWhy: () => void;
  readonly now?: () => number;
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

export function NeedsOk({ result, headingRef, answering, onAnswer, onWhy, now }: NeedsOkProps): ReactElement | null {
  const { t } = useLocale();
  const chain = result.chain;
  const esc = result.escalation;
  const left = useSecondsLeft(esc?.state === "OPEN" ? esc.expiresAt : undefined, now);
  const windowS = esc ? Math.max(1, Math.round((Date.parse(esc.expiresAt) - Date.parse(esc.openedAt)) / MS_PER_S)) : 0;
  const announcement = useAnnouncement(left, windowS);
  if (!chain) return null;
  const cart = chain.current.cart;
  const closed = esc !== undefined && esc.state !== "OPEN";
  const over = left === 0 || closed;
  const ratio = left === undefined || windowS === 0 ? 0 : left / windowS;
  return (
    <div className="run-stack" data-run-state="needsOk">
      <Card tone="warn" padding="lg" className="run-ask">
        <div className="run-ask__head">
          <Wally state={chain.current.explanation?.template_id === "R10.unavailable" ? "offline" : "thinking"} size={64} decorative />
          <h2 className="run-ask__title" tabIndex={-1} ref={headingRef}>{t(R.needsOkTitle)}</h2>
        </div>
        <p className="run-ask__reason">{t(plainReason(chain.current))}</p>
        <div className="run-ask__deal">
          <span className="run-ask__item">{itemTitle(cart)}</span>
          <span className="run-ask__shop">{shopName(cart)}</span>
          <span className="run-ask__amount"><span data-selectable>{formatHkd(cart.total_minor)}</span> <ProvenanceChip prov={cartProv(cart)} /></span>
        </div>
        {esc && left !== undefined ? (
          <div className="run-countdown" data-over={over || undefined}>
            <div className="run-countdown__row">
              <span>{t(R.timeToAnswer)}</span>
              <span role="timer" aria-live="off" className="run-countdown__left">{over ? t(R.timesUp) : t(R.secondsLeft(String(left)))}</span>
            </div>
            <span className="run-countdown__track" aria-hidden="true"><span className="run-countdown__fill" style={{ transform: `scaleX(${ratio.toFixed(3)})` }} /></span>
          </div>
        ) : null}
        <p className="sr-only" aria-live="polite">{announcement}</p>
        <p className="run-ask__limit"><Icon name="shieldCheck" size={18} /> {t(R.answerLimit)}</p>
        <div className="run-ask__buttons">
          <Button size="lg" block disabled={over || answering === "DENY"} loading={answering === "APPROVE"} onClick={() => onAnswer("APPROVE")} icon={<Icon name="check" size={20} />}>{t(R.approve)}</Button>
          <Button size="lg" variant="secondary" block disabled={over || answering === "APPROVE"} loading={answering === "DENY"} onClick={() => onAnswer("DENY")}>{t(R.noThanks)}</Button>
        </div>
      </Card>
      <Button variant="ghost" block onClick={onWhy} icon={<Icon name="info" size={20} />}>{t(R.whyAsk)}</Button>
    </div>
  );
}
