// One-off cards of this budget. Ready cards are dark tickets: last four digits, "works once, for HK$259 only", the shop
// lock, a countdown and the SIMULATED chip. Used, cancelled and expired cards follow as a quiet list. State is always an
// icon plus words, never colour alone. No PAN, CVV or expiry date exists anywhere (I8): the rail gives four digits.
import type { ReactElement } from "react";
import type { CardRecord } from "../../api/types";
import { SIMULATED } from "../../domain/provenance";
import { UI } from "../../i18n/ui";
import { Tag } from "../../ui/Chip";
import { Icon, type IconName } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { Card, List, ListRow } from "../../ui/Surface";
import { Fig, Fill, Money, ScopeChip } from "../../shell/figures";
import { formatCountdown } from "../../shell/format";
import { useNow } from "../../shell/useNow";

const PROV = SIMULATED;

const STATE_ICON: Readonly<Record<CardRecord["state"], IconName>> = { ACTIVE: "checkCircle", USED: "check", VOIDED: "close", EXPIRED: "clock" };

function Ticket({ card, now }: { readonly card: CardRecord; readonly now: number }): ReactElement {
  const { t } = useLocale();
  return (
    <Card as="article" tone="ticket" padding="lg" className="console-ticket" data-chip-scope data-card-state={card.state} aria-label={t(UI["home.cardLabel"])}>
      <Tag tone="ok" size="sm" className="w-card__corner" icon={<Icon name="check" size={14} />}>{t(UI["home.cardState.ACTIVE"])}</Tag>
      <span className="console-ticket__label"><Icon name="card" size={18} /> {t(UI["home.cardLabel"])}</span>
      <span className="console-ticket__number">
        <span aria-hidden="true">•••• </span>
        <span className="sr-only">{t(UI["home.cardEnding"])} </span>
        <span data-ident data-selectable>{card.last4}</span>
      </span>
      <span className="console-ticket__once"><Fill text={t(UI["home.cardOnce"])} slots={{ amount: <Money minor={card.limit_minor} prov={PROV} /> }} /></span>
      <span className="console-ticket__meta">
        {card.merchant_lock ? <span><Fill text={t(UI["home.cardAt"])} slots={{ shop: <span data-ident>{card.merchant_lock}</span> }} /></span> : null}
        <span><Fill text={t(UI["home.cardEnds"])} slots={{ time: <Fig prov={PROV} kind="time">{formatCountdown(Date.parse(card.expires_at) - now)}</Fig> }} /></span>
      </span>
      <ScopeChip prov={PROV} className="console-ticket__chip" />
    </Card>
  );
}

function PastCards({ cards }: { readonly cards: readonly CardRecord[] }): ReactElement {
  const { t } = useLocale();
  return (
    <section className="home-section" aria-labelledby="console-past-title">
      <h3 id="console-past-title" className="home-section__title home-section__title--sm">{t(UI["home.pastCards"])}</h3>
      <List inset label={t(UI["home.pastCards"])}>
        {cards.map((c) => (
          <ListRow
            key={c.id}
            className="console-past"
            tone={c.state === "USED" ? "ok" : "neutral"}
            leading={<Icon name={STATE_ICON[c.state]} />}
            title={<><span aria-hidden="true">•••• </span><span className="sr-only">{t(UI["home.cardLabel"])} {t(UI["home.cardEnding"])} </span><span data-ident>{c.last4}</span></>}
            subtitle={<span data-card-state={c.state}>{t(UI[`home.cardState.${c.state}`])}</span>}
            trailing={<Money minor={c.limit_minor} prov={PROV} />}
          />
        ))}
      </List>
    </section>
  );
}

export function CardsSection({ active, past }: { readonly active: readonly CardRecord[]; readonly past: readonly CardRecord[] }): ReactElement | null {
  const { t } = useLocale();
  const now = useNow(active.length > 0);
  if (active.length === 0 && past.length === 0) return null;
  return (
    <section className="home-block" aria-labelledby="console-cards-title">
      <h2 id="console-cards-title" className="home-block__title">{t(UI["home.cards"])}</h2>
      {active.length === 0 ? <p className="home-block__empty">{t(UI["home.cardsEmpty"])}</p> : (
        <div className="console-tickets">
          {active.map((c) => <Ticket key={c.id} card={c} now={now} />)}
        </div>
      )}
      {past.length > 0 ? <PastCards cards={past} /> : null}
    </section>
  );
}
