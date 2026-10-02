// Variant 2, "Ticket stub": a ticket with a perforation. The top half says what and where (one-off card, last four
// digits, the shop), the stub says how much and for how long. It is printed in from a slot, and when the card is used the
// stub tears away: "one-off" you can see.
import { useRef, type ReactElement } from "react";
import type { CardRecord } from "../../../../api/types";
import { formatHkd } from "../../../../domain/money";
import { SIMULATED } from "../../../../domain/provenance";
import { RUNX } from "../../../../i18n/runMore";
import { UI } from "../../../../i18n/ui";
import { Button } from "../../../../ui/Button";
import { ProvenanceChip, Tag } from "../../../../ui/Chip";
import { cx } from "../../../../ui/cx";
import { Icon } from "../../../../ui/icons";
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

function TicketCard({ p, card, shop }: { readonly p: ApprovedProps; readonly card: CardRecord | undefined; readonly shop: string }): ReactElement {
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
  const amount = formatHkd(card.limit_minor);
  const paid = isPaid(p.result.story);
  const unpaid = ready && !paid;
  return (
    <article ref={el} className={cx("cv-ticket", `cv-ticket--${card.state.toLowerCase()}`, p.fresh && "cv-ticket--enter")} aria-label={t(R.oneOffCard)} data-card-state={card.state}>
      <div className="cv-ticket__main">
        <div className="cv-ticket__top">
          <span className="cv-ticket__label"><Icon name="card" size={18} /> {t(R.oneOffCard)}</span>
          <ProvenanceChip prov={SIMULATED} />
        </div>
        <span className="cv-ticket__digits" data-selectable>
          <span aria-hidden="true">{"•••• "}</span>
          <span className="sr-only">{t(R.cardEnding(card.last4))}</span>
          <span aria-hidden="true">{card.last4}</span>
        </span>
        {card.merchant_lock ? <span className="cv-ticket__lock"><Icon name="lock" size={14} /> {t(RUNX.cardLocked(shop))}</span> : null}
        {!ready ? <span className="cv-ticket__used" aria-hidden="true">{t(card.state === "USED" ? RUNX.stampPaid : card.state === "VOIDED" ? RUNX.stampCancelled : RUNX.stampExpired)}</span> : null}
      </div>
      <div className="cv-ticket__perf" aria-hidden="true" />
      <div className="cv-ticket__stub">
        <div className="cv-ticket__amountcol">
          <span className="cv-ticket__amount" data-selectable>{amount}</span>
          <span className="cv-ticket__once">{t(R.stepCardDetail)}</span>
        </div>
        <div className="cv-ticket__side">
          <Tag tone={ready ? "ok" : card.state === "USED" ? "info" : "neutral"} size="sm" icon={<Icon name={ready ? "check" : card.state === "USED" ? "checkCircle" : "clock"} size={14} />}>
            {t(ready ? R.cardReady : card.state === "USED" ? R.cardUsed : card.state === "VOIDED" ? R.cardVoided : R.cardExpired)}
          </Tag>
          {ready ? <span className="cv-ticket__time" role="timer" aria-live="off">{t(RUNX.endsIn(clock.text))}</span> : null}
        </div>
        {unpaid && p.canPay && (!p.result.busy || p.paying) ? (
          <Button className="cv-ticket__pay" variant="on-hero" size="md" block icon={<Icon name="lock" size={20} />} loading={p.paying} onClick={p.onPay}>{t(R.payNow)}</Button>
        ) : null}
      </div>
    </article>
  );
}

export function ApprovedTicket(p: ApprovedProps): ReactElement | null {
  const { t } = useLocale();
  const chain = p.result.chain;
  if (!chain) return null;
  const cart = chain.current.cart;
  const paid = isPaid(p.result.story);
  return (
    <div className="run-stack cv-tix" data-run-state="approved">
      <header className={cx("cv-head cv-head--centre", p.fresh && "cv-enter")} role="status">
        <Wally state="approved" size={84} decorative />
        <h2 className="cv-head__title" tabIndex={-1} ref={p.headingRef}>{t(paid ? R.paidTitle : R.approvedTitle)}</h2>
        <p className="cv-head__sub">{itemTitle(cart)} {"·"} {shopName(cart)}</p>
        <span className="sr-only">{formatHkd(chain.current.approved_limit_minor ?? cart.total_minor)}</span>
      </header>
      <TicketCard p={p} card={p.result.card} shop={shopName(cart)} />
      <ApprovedRest {...p} payInside />
    </div>
  );
}
