// The one-off card, drawn as a card: the exact amount big, the SIMULATED chip, the shop it is locked to, a live "ends
// in" clock with a thin life line, and a stamp once it is used, cancelled or expired. No card number, CVV or printed
// expiry exists (I8): the rail gives four digits. Shared by Wally's screen and Budget, so it looks the same in both.
// Motion: a new card is dealt in and catches the light once; a decline shakes it; the stamp lands when the state changes.
import { useRef, type ReactElement } from "react";
import type { CardRecord } from "../../api/types";
import { SIMULATED } from "../../domain/provenance";
import type { LabelPair } from "../../i18n/label";
import { RUNX } from "../../i18n/runMore";
import { UI } from "../../i18n/ui";
import { Tag, type TagTone } from "../../ui/Chip";
import { cx } from "../../ui/cx";
import { Icon, type IconName } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { Skeleton } from "../../ui/Surface";
import { Fig, Fill, Money, ScopeChip } from "../../shell/figures";
import { useCardClock, useChanged, useDeclineShake } from "./cardHooks";
import "../../design/ui/run-extra.css";
import "./oneOffCard.css";

const R = UI.run;

interface StateLook {
  readonly text: LabelPair;
  readonly tone: TagTone;
  readonly icon: IconName;
  readonly stamp: LabelPair;
}

const STATE: Readonly<Record<CardRecord["state"], StateLook>> = {
  ACTIVE: { text: R.cardReady, tone: "ok", icon: "check", stamp: RUNX.stampPaid },
  USED: { text: R.cardUsed, tone: "info", icon: "checkCircle", stamp: RUNX.stampPaid },
  VOIDED: { text: R.cardVoided, tone: "neutral", icon: "close", stamp: RUNX.stampCancelled },
  EXPIRED: { text: R.cardExpired, tone: "neutral", icon: "clock", stamp: RUNX.stampExpired },
};

export interface OneOffCardProps {
  readonly card: CardRecord | undefined;
  /** The shop's name, for the lock line (the card itself holds only a host name). */
  readonly shop: string;
  /** Deal the card in with the light sweep: a card that has just been made. */
  readonly enter?: boolean;
  /** How many declines the card has answered; a rise while mounted shakes the card. */
  readonly declines?: number;
  /** A smaller card for lists (Budget). */
  readonly compact?: boolean;
}

export function OneOffCard({ card, shop, enter = false, declines = 0, compact = false }: OneOffCardProps): ReactElement {
  const { t } = useLocale();
  const el = useRef<HTMLElement>(null);
  const clock = useCardClock(card);
  useDeclineShake(el, declines);
  const changed = useChanged(card?.state);
  if (!card) {
    return (
      <article className="oc oc--wait" aria-busy="true" aria-label={t(R.oneOffCard)}>
        <Skeleton width="45%" height="1.125rem" />
        <Skeleton width="70%" height="2.5rem" radius="md" />
      </article>
    );
  }
  const look = STATE[card.state];
  const ready = card.state === "ACTIVE";
  return (
    <article
      ref={el}
      className={cx("oc", `oc--${card.state.toLowerCase()}`, compact && "oc--compact", enter && "oc--enter")}
      aria-label={t(R.oneOffCard)}
      data-card-state={card.state}
      data-chip-scope
    >
      <span className="oc__sheen" aria-hidden="true" />
      <span className="oc__label"><Icon name="card" size={18} /> {t(R.oneOffCard)}</span>
      <ScopeChip prov={SIMULATED} className="oc__chip" />
      <Tag tone={look.tone} size="sm" icon={<Icon name={look.icon} size={14} />} className="oc__state">{t(look.text)}</Tag>
      <div className="oc__body">
        {compact ? null : <span className="oc__exactly">{t(RUNX.exactly)}</span>}
        <Money minor={card.limit_minor} prov={SIMULATED} className="oc__amount" />
        <span className="oc__once">{t(R.stepCardDetail)}</span>
      </div>
      <div className="oc__foot">
        <span className="oc__digits">
          <span aria-hidden="true">{"\u2022\u2022\u2022\u2022 "}</span>
          <span className="sr-only">{t(RUNX.cardEndingLabel)} </span>
          <span data-ident data-selectable>{card.last4}</span>
        </span>
        {card.merchant_lock ? <span className="oc__lock"><Icon name="lock" size={14} /> {t(RUNX.cardLocked(shop))}</span> : null}
        {ready ? (
          <span className="oc__time" role="timer" aria-live="off">
            <Fill text={t(RUNX.endsIn("{time}"))} slots={{ time: <Fig prov={SIMULATED} kind="time">{clock.text}</Fig> }} />
          </span>
        ) : null}
      </div>
      {ready ? (
        <span className="oc__life" aria-hidden="true" style={{ transform: `scaleX(${clock.ratio.toFixed(4)})` }} />
      ) : (
        <span className={cx("oc__stamp", changed && "oc__stamp--land")} aria-hidden="true">{t(look.stamp)}</span>
      )}
    </article>
  );
}
