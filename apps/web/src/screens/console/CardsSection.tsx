// One-off cards of this budget. Ready cards are the same dark card Wally's screen shows (console/OneOffCard, compact): the
// amount, SIMULATED, the shop lock and a live clock. Used, cancelled and expired cards follow as a quiet list. State is
// always an icon plus words, never colour alone. No PAN, CVV or expiry date exists anywhere (I8): the rail gives four digits.
import type { ReactElement } from "react";
import type { CardRecord } from "../../api/types";
import { SIMULATED } from "../../domain/provenance";
import { UI } from "../../i18n/ui";
import { Icon, type IconName } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { List, ListRow } from "../../ui/Surface";
import { Money } from "../../shell/figures";
import { OneOffCard } from "./OneOffCard";

const PROV = SIMULATED;

const STATE_ICON: Readonly<Record<CardRecord["state"], IconName>> = { ACTIVE: "checkCircle", USED: "check", VOIDED: "close", EXPIRED: "clock" };

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
  if (active.length === 0 && past.length === 0) return null;
  return (
    <section className="home-block" aria-labelledby="console-cards-title">
      <h2 id="console-cards-title" className="home-block__title">{t(UI["home.cards"])}</h2>
      {active.length === 0 ? <p className="home-block__empty">{t(UI["home.cardsEmpty"])}</p> : (
        <div className="console-tickets">
          {active.map((c) => <OneOffCard key={c.id} card={c} shop={c.merchant_lock ?? ""} compact />)}
        </div>
      )}
      {past.length > 0 ? <PastCards cards={past} /> : null}
    </section>
  );
}
