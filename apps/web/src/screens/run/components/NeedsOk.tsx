// Needs your OK: the question rises as a sheet, the way a phone asks for a permission. Inside it: the plain reason, the
// deal, what yes will do, the clock (real time, announced at the start and the end only) and the two answers pinned at the
// bottom. An answer can clear a question (seller not checked, listing unclear, over your ask-first amount) but never a
// fixed rule, and the sheet says so, and that the answer is signed. Close the sheet and a quiet card on the page keeps the
// question open ("Review and answer"). Pressing an answer closes the sheet; the card says the answer is being signed.
import { useState, type ReactElement, type Ref } from "react";
import { RUNX } from "../../../i18n/runMore";
import { UI } from "../../../i18n/ui";
import { Button } from "../../../ui/Button";
import { Icon } from "../../../ui/icons";
import { useLocale } from "../../../ui/locale";
import { Sheet } from "../../../ui/Overlay";
import { Card } from "../../../ui/Surface";
import { Wally } from "../../../wally/Wally";
import { checkerIsOffline, plainReason } from "../model/reason";
import type { Result } from "../model/screen";
import { Countdown, Deal, useOkClock, YesDoes } from "./okParts";

const R = UI.run;

export interface NeedsOkProps {
  readonly result: Result;
  readonly headingRef: Ref<HTMLHeadingElement>;
  readonly answering: "APPROVE" | "DENY" | null;
  readonly onAnswer: (choice: "APPROVE" | "DENY") => void;
  readonly onWhy: () => void;
  readonly now?: () => number;
}

export function NeedsOk({ result, headingRef, answering, onAnswer, onWhy, now }: NeedsOkProps): ReactElement | null {
  const { t } = useLocale();
  const [open, setOpen] = useState(true);
  const clock = useOkClock(result, now);
  const chain = result.chain;
  if (!chain) return null;
  const cart = chain.current.cart;
  const reason = t(plainReason(chain.current));
  const answer = (choice: "APPROVE" | "DENY"): void => {
    setOpen(false);
    onAnswer(choice);
  };
  const sheetOpen = open && !clock.over;
  return (
    <div className="run-stack" data-run-state="needsOk">
      <Card tone="warn" padding="lg" className="run-ask">
        <div className="run-ask__head">
          <Wally state={checkerIsOffline(chain.current) ? "offline" : "thinking"} size={64} decorative />
          <h2 className="run-ask__title" tabIndex={-1} ref={sheetOpen ? undefined : headingRef}>{t(R.needsOkTitle)}</h2>
        </div>
        <p className="run-ask__reason">{reason}</p>
        <Deal cart={cart} />
        {answering ? (
          <p className="run-ask__signing" role="status"><span className="w-spinner" aria-hidden="true" /> {t(RUNX.signing)}</p>
        ) : clock.over ? (
          <p className="run-ask__signing" role="status">{t(R.timesUp)}</p>
        ) : (
          <Button size="lg" block onClick={() => setOpen(true)} icon={<Icon name="chat" size={20} />}>{t(RUNX.reviewAnswer)}</Button>
        )}
      </Card>
      <Button variant="ghost" block onClick={onWhy} icon={<Icon name="info" size={20} />}>{t(R.whyAsk)}</Button>
      <Sheet
        open={sheetOpen}
        onClose={() => setOpen(false)}
        title={t(R.needsOkTitle)}
        description={reason}
        footer={
          <>
            <Button size="lg" block disabled={answering !== null} onClick={() => answer("APPROVE")} icon={<Icon name="check" size={20} />}>{t(R.approve)}</Button>
            <Button size="lg" variant="secondary" block disabled={answering !== null} onClick={() => answer("DENY")}>{t(R.noThanks)}</Button>
            <p className="run-ask__fine"><Icon name="shieldCheck" size={16} /> {t(R.answerLimit)} {t(RUNX.signedNote)}</p>
          </>
        }
      >
        <div className="run-ok-body">
          <Deal cart={cart} />
          <YesDoes cart={cart} />
          <Countdown clock={clock} />
          <p className="sr-only" aria-live="polite">{clock.announcement}</p>
        </div>
      </Sheet>
    </div>
  );
}
