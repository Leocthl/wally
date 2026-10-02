// CardTicket (docs/04, PACKET): masked last4, limit, TTL, state, and a permanent SIMULATED stamp. No PAN, CVV or printed
// expiry exists anywhere (I8): the rail gives a handle and four display digits only.
import type { ReactElement } from "react";
import type { CardRecord } from "../api/types";
import { SIMULATED } from "../domain/provenance";
import { S } from "../i18n/strings";
import { Bi } from "./Bi";
import { ChipScope } from "./ChipScope";
import { Num } from "./Num";
import { StateBadge, type Tone } from "./StateBadge";

const STATE: Record<CardRecord["state"], { readonly tone: Tone; readonly text: string; readonly zh: string }> = {
  ACTIVE: { tone: "minted", text: "MINTED", zh: "已發卡" },
  USED: { tone: "pending", text: "USED", zh: "已使用" },
  VOIDED: { tone: "stopped", text: "VOIDED", zh: "已作廢" },
  EXPIRED: { tone: "pending", text: "EXPIRED", zh: "已過期" },
};

/** A card exists only on the SIMULATED rail, so its amounts are always SIMULATED and the stamp can never be removed. */
export function CardTicket({ card }: { readonly card: CardRecord }): ReactElement {
  const prov = SIMULATED;
  const state = STATE[card.state];
  return (
    <article className={`card ticket ticket--${card.state.toLowerCase()}`} data-register="packet" data-card-state={card.state} aria-label="One-off card">
      <ChipScope provs={[prov]} chipsClassName="ticket__stamp">
        <div className="ticket__top">
          <StateBadge tone={state.tone} text={state.text} zh={state.zh} />
          <span className="sr-only">SIMULATED card, no money moves</span>
        </div>
        <p className="ticket__number" data-ident aria-label="Card number masked, last four digits">
          <span aria-hidden="true">•••• •••• ••••</span> <span className="ticket__last4">{card.last4}</span>
        </p>
        <dl className="ticket__facts">
          <div><dt><Bi text={S.limit} /></dt><dd><Num kind="money" value={card.limit_minor} prov={prov} chip="scope" /></dd></div>
          <div><dt><Bi text={S.validUntil} /></dt><dd><Num kind="time" value={card.expires_at} prov={prov} chip="scope" /></dd></div>
          {card.merchant_lock ? (
            <div><dt><Bi text={S.lockedTo} /></dt><dd className="mono" data-ident>{card.merchant_lock}</dd></div>
          ) : null}
        </dl>
        <Bi as="p" text={S.mintedNote} className="soft" />
      </ChipScope>
    </article>
  );
}
