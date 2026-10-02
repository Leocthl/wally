// Variant 3, "Live card": time and action first. A compact dark card with a ring that drains while the card is ready,
// the amount beside it, and Pay now inside the card. Once the card is used, cancelled or expired the ring becomes a
// plain mark and the button goes.
import { useRef, type ReactElement } from "react";
import type { CardRecord } from "../../../../api/types";
import { formatHkd } from "../../../../domain/money";
import { SIMULATED } from "../../../../domain/provenance";
import { RUNX } from "../../../../i18n/runMore";
import { UI } from "../../../../i18n/ui";
import { Button } from "../../../../ui/Button";
import { ProvenanceChip } from "../../../../ui/Chip";
import { cx } from "../../../../ui/cx";
import { Icon, type IconName } from "../../../../ui/icons";
import { useLocale } from "../../../../ui/locale";
import { Card, Skeleton } from "../../../../ui/Surface";
import { Wally } from "../../../../wally/Wally";
import type { ApprovedProps } from "../../components/Approved";
import { itemTitle, shopName } from "../../model/item";
import { isPaid } from "../../model/story";
import { useCardClock, useDeclineShake } from "../../../console/cardHooks";
import { declinesOf } from "../../components/Approved";
import { ApprovedRest } from "./parts";

const R = UI.run;
const RING = 2 * Math.PI * 16;

function Ring({ ratio, text, ready, icon }: { readonly ratio: number; readonly text: string; readonly ready: boolean; readonly icon: IconName }): ReactElement {
  return (
    <span className="cv-ring" aria-hidden="true">
      <svg viewBox="0 0 36 36" focusable="false">
        <circle className="cv-ring__track" cx="18" cy="18" r="16" fill="none" strokeWidth="3" />
        {ready ? <circle className="cv-ring__fill" cx="18" cy="18" r="16" fill="none" strokeWidth="3" strokeLinecap="round" strokeDasharray={RING.toFixed(2)} strokeDashoffset={(RING * (1 - ratio)).toFixed(2)} transform="rotate(-90 18 18)" /> : null}
      </svg>
      <span className="cv-ring__centre">{ready ? text : <Icon name={icon} size={22} />}</span>
    </span>
  );
}

function LiveCard({ p, card, shop }: { readonly p: ApprovedProps; readonly card: CardRecord | undefined; readonly shop: string }): ReactElement {
  const { t } = useLocale();
  const el = useRef<HTMLElement>(null);
  const clock = useCardClock(card);
  useDeclineShake(el, declinesOf(p.result));
  if (!card) {
    return (
      <Card as="article" tone="ticket" padding="lg" aria-busy="true">
        <Skeleton width="50%" height="1.25rem" />
        <Skeleton width="75%" height="2.5rem" />
      </Card>
    );
  }
  const ready = card.state === "ACTIVE";
  const paid = isPaid(p.result.story);
  const icon: IconName = card.state === "USED" ? "check" : card.state === "VOIDED" ? "close" : "clock";
  return (
    <article ref={el} className={cx("cv-live", `cv-live--${card.state.toLowerCase()}`, p.fresh && "cv-live--enter")} aria-label={t(R.oneOffCard)} data-card-state={card.state}>
      <div className="cv-live__row">
        <Ring ratio={clock.ratio} text={clock.text} ready={ready} icon={icon} />
        <div className="cv-live__text">
          <span className="cv-live__label"><Icon name="card" size={16} /> {t(R.oneOffCard)} <ProvenanceChip prov={SIMULATED} /></span>
          <span className="cv-live__amount" data-selectable>{formatHkd(card.limit_minor)}</span>
          <span className="cv-live__once">{t(R.stepCardDetail)}</span>
        </div>
      </div>
      <div className="cv-live__meta">
        <span data-selectable>
          <span aria-hidden="true">{"•••• "}</span>
          <span className="sr-only">{t(R.cardEnding(card.last4))}</span>
          <span aria-hidden="true">{card.last4}</span>
        </span>
        {card.merchant_lock ? <span><Icon name="lock" size={14} /> {t(RUNX.cardLocked(shop))}</span> : null}
        {ready ? <span role="timer" aria-live="off">{t(RUNX.endsIn(clock.text))}</span> : <span>{t(card.state === "USED" ? R.cardUsed : card.state === "VOIDED" ? R.cardVoided : R.cardExpired)}</span>}
      </div>
      {ready && !paid && p.canPay && (!p.result.busy || p.paying) ? (
        <Button variant="on-hero" size="lg" block icon={<Icon name="lock" size={20} />} loading={p.paying} onClick={p.onPay}>{t(R.payNow)}</Button>
      ) : null}
    </article>
  );
}

export function ApprovedLive(p: ApprovedProps): ReactElement | null {
  const { t } = useLocale();
  const chain = p.result.chain;
  if (!chain) return null;
  const cart = chain.current.cart;
  const paid = isPaid(p.result.story);
  return (
    <div className="run-stack cv-liveview" data-run-state="approved">
      <header className={cx("cv-head", p.fresh && "cv-enter")} role="status">
        <Wally state="approved" size={56} decorative />
        <div className="cv-head__text">
          <h2 className="cv-head__title" tabIndex={-1} ref={p.headingRef}>{t(paid ? R.paidTitle : R.approvedTitle)}</h2>
          <p className="cv-head__sub">{itemTitle(cart)} {"·"} {shopName(cart)}</p>
          <span className="sr-only">{formatHkd(chain.current.approved_limit_minor ?? cart.total_minor)}</span>
        </div>
      </header>
      <LiveCard p={p} card={p.result.card} shop={shopName(cart)} />
      <ApprovedRest {...p} payInside />
    </div>
  );
}
