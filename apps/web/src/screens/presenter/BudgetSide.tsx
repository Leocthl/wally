// The presenter's side column: the budget hero (left of the total, held, spent) and the one-off cards, large enough to
// read from the back of the room. Drawn from the folded packet and the card records, never from a counter of its own.
import type { ReactElement } from "react";
import type { CardRecord, PacketState } from "../../api/types";
import { ChipScope } from "../../components/ChipScope";
import { Num } from "../../components/Num";
import { formatHkd } from "../../domain/money";
import { SIMULATED } from "../../domain/provenance";
import { Tx, TxFill } from "../../evidence/components/Tx";
import type { LabelPair } from "../../i18n/label";
import { UI } from "../../i18n/ui";
import { ProgressBar } from "../../ui/Data";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { Wally } from "../../wally/Wally";

const PU = UI.presenterUi;
const CARD_STATE: Readonly<Record<CardRecord["state"], LabelPair>> = { ACTIVE: PU.cardActive, USED: PU.cardUsed, VOIDED: PU.cardVoided, EXPIRED: PU.cardExpired };

function BudgetHero({ packet }: { readonly packet: PacketState }): ReactElement {
  const { t } = useLocale();
  const { budget_minor: budget, remaining_minor: left, committed_minor: held, spent_minor: spent } = packet;
  return (
    <section className="pr-budget" aria-labelledby="pr-budget-title" data-status={packet.status}>
      <ChipScope provs={[SIMULATED]} className="pr-budget__scope" chipsClassName="pr-budget__chips">
        <h2 id="pr-budget-title" className="pr-budget__label"><Tx text={PU.budgetLeft} /></h2>
        <p className="pr-budget__left"><Num kind="money" value={left} prov={SIMULATED} chip="scope" /></p>
        <TxFill as="p" className="pr-budget__of" text={PU.ofBudget} slots={{ amount: <Num kind="money" value={budget} prov={SIMULATED} chip="scope" /> }} />
        <ProgressBar value={left} max={budget} role="meter" tone="on-hero" label={t(PU.budgetLeft)} valueText={`${formatHkd(left)} left of ${formatHkd(budget)}, SIMULATED`} />
        <dl className="pr-budget__facts">
          <div><dt><Tx text={PU.held} /></dt><dd><Num kind="money" value={held} prov={SIMULATED} chip="scope" /></dd></div>
          <div><dt><Tx text={PU.spent} /></dt><dd><Num kind="money" value={spent} prov={SIMULATED} chip="scope" /></dd></div>
        </dl>
      </ChipScope>
    </section>
  );
}

function CardRow({ card }: { readonly card: CardRecord }): ReactElement {
  return (
    <li className="pr-card" data-card-state={card.state}>
      <span className="pr-card__icon"><Icon name="card" size={22} /></span>
      <span className="pr-card__text">
        <span className="pr-card__num mono" data-ident>•••• {card.last4}</span>
        <TxFill className="pr-card__once" text={PU.cardOnce} slots={{ amount: <Num kind="money" value={card.limit_minor} prov={SIMULATED} chip="scope" /> }} />
      </span>
      <Tx text={CARD_STATE[card.state]} className={`pr-card__state pr-card__state--${card.state.toLowerCase()}`} />
    </li>
  );
}

export function BudgetSide({ packet, cards }: { readonly packet: PacketState | null; readonly cards: readonly CardRecord[] }): ReactElement {
  return (
    <aside className="pr-side" aria-label={UI.presenterUi.budgetLeft.en}>
      {packet ? <BudgetHero packet={packet} /> : <div className="pr-budget pr-budget--empty"><Wally state="idle" size={72} decorative /></div>}
      <section className="pr-cards" aria-labelledby="pr-cards-title">
        <h2 id="pr-cards-title" className="pr-cards__title"><Tx text={PU.cardsTitle} /></h2>
        {cards.length === 0 ? (
          <Tx as="p" text={PU.noCards} className="pr-cards__none" />
        ) : (
          <ChipScope provs={[SIMULATED]} className="pr-cards__scope" chipsClassName="pr-cards__chips">
            <ul className="pr-cards__list">{[...cards].reverse().map((c) => <CardRow key={c.id} card={c} />)}</ul>
          </ChipScope>
        )}
      </section>
    </aside>
  );
}
