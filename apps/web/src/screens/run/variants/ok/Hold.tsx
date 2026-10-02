// Variant 2, "Hold to approve": the answer is a gesture. Approve is a press-and-hold with a fill, the same gesture as
// Cancel this budget, so saying yes takes a beat of intent and cannot be a stray tap. No thanks stays a plain tap. A
// signature mark draws when the hold completes. In-page, no sheet.
import { useId, type KeyboardEvent, type ReactElement } from "react";
import { useHold } from "../../../../hooks/useHold";
import { useReducedMotion } from "../../../../hooks/useReducedMotion";
import { RUNX } from "../../../../i18n/runMore";
import { UI } from "../../../../i18n/ui";
import { Button } from "../../../../ui/Button";
import { Icon } from "../../../../ui/icons";
import { useLocale } from "../../../../ui/locale";
import { Card } from "../../../../ui/Surface";
import { Wally } from "../../../../wally/Wally";
import { Countdown, Deal, useOkClock, YesDoes } from "../../components/okParts";
import { plainReason } from "../../model/reason";
import type { OkVariantProps } from "./types";

const R = UI.run;
const HOLD_KEYS = new Set(["Enter", " "]);

function HoldApprove({ disabled, loading, onHeld }: { readonly disabled: boolean; readonly loading: boolean; readonly onHeld: () => void }): ReactElement {
  const { t } = useLocale();
  const reduced = useReducedMotion();
  const hold = useHold(onHeld, reduced);
  const hint = useId();
  const blocked = disabled || loading || hold.done;
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>): void => {
    if (!HOLD_KEYS.has(e.key)) return;
    e.preventDefault();
    if (!e.repeat && !blocked) hold.start();
  };
  return (
    <div className="kv-hold">
      <button
        type="button"
        className="w-btn w-btn--primary w-btn--lg w-btn--block kv-hold__button"
        disabled={blocked}
        aria-describedby={hint}
        data-holding={hold.holding}
        data-motion={reduced ? "reduced" : "full"}
        data-step={hold.step}
        data-done={hold.done || undefined}
        onPointerDown={(e) => {
          if (e.button === 0 && !blocked) hold.start();
        }}
        onPointerUp={hold.cancel}
        onPointerLeave={hold.cancel}
        onPointerCancel={hold.cancel}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => HOLD_KEYS.has(e.key) && hold.cancel()}
        onBlur={hold.cancel}
        onClick={(e) => e.preventDefault()}
      >
        <span className="kv-hold__fill" aria-hidden="true" />
        <span className="w-btn__icon"><Icon name={hold.done ? "check" : "hand"} size={20} /></span>
        <span className="w-btn__label">{t(hold.done ? RUNX.signedOk : RUNX.holdToApprove)}</span>
      </button>
      <p id={hint} className="kv-hold__hint">{t(RUNX.holdHint)}</p>
    </div>
  );
}

export function NeedsOkHold(p: OkVariantProps): ReactElement | null {
  const { t } = useLocale();
  const clock = useOkClock(p.result, p.now);
  const chain = p.result.chain;
  if (!chain) return null;
  const cart = chain.current.cart;
  return (
    <div className="run-stack kv-holdview" data-run-state="needsOk">
      <Card tone="warn" padding="lg" className="run-ask">
        <div className="run-ask__head">
          <Wally state="thinking" size={64} decorative />
          <h2 className="run-ask__title" tabIndex={-1} ref={p.headingRef}>{t(R.needsOkTitle)}</h2>
        </div>
        <p className="run-ask__reason">{t(plainReason(chain.current))}</p>
        <Deal cart={cart} />
        <YesDoes cart={cart} />
        <Countdown clock={clock} />
        <p className="sr-only" aria-live="polite">{clock.announcement}</p>
        <HoldApprove disabled={clock.over || p.answering === "DENY"} loading={p.answering === "APPROVE"} onHeld={() => p.onAnswer("APPROVE")} />
        <Button size="lg" variant="secondary" block disabled={clock.over || p.answering === "APPROVE"} loading={p.answering === "DENY"} onClick={() => p.onAnswer("DENY")}>{t(R.noThanks)}</Button>
        <p className="run-ask__limit"><Icon name="shieldCheck" size={18} /> {t(R.answerLimit)}</p>
      </Card>
      <Button variant="ghost" block onClick={p.onWhy} icon={<Icon name="info" size={20} />}>{t(R.whyAsk)}</Button>
    </div>
  );
}
