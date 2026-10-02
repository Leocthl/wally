// Approved: a green hero with Wally approved and the amount, the dark one-off card ticket, the budget now, and the card
// story when the shop has used the card (DM2 beats). Pay now appears only while the card is unpaid and the checkout is
// manual (the run ended with the card still ready).
import type { ReactElement, Ref } from "react";
import type { PacketState } from "../../../api/types";
import { formatHkd } from "../../../domain/money";
import { cartProv } from "../../../domain/provenance";
import { UI } from "../../../i18n/ui";
import { Button } from "../../../ui/Button";
import { ProvenanceChip } from "../../../ui/Chip";
import { Icon } from "../../../ui/icons";
import { useLocale } from "../../../ui/locale";
import { useCountUp } from "../hooks";
import { itemTitle, shopName } from "../model/item";
import type { Result } from "../model/screen";
import { isPaid } from "../model/story";
import { BudgetNow } from "./BudgetNow";
import { CardStory } from "./CardStory";
import { OneOffCard } from "./OneOffCard";
import { Footnote, Hero } from "./parts";

const R = UI.run;

export interface ApprovedProps {
  readonly result: Result;
  readonly packet: PacketState | null;
  readonly fresh: boolean;
  readonly headingRef: Ref<HTMLHeadingElement>;
  readonly paying: boolean;
  readonly onPay: () => void;
  readonly onWhy: () => void;
}

export function Approved({ result, packet, fresh, headingRef, paying, onPay, onWhy }: ApprovedProps): ReactElement | null {
  const { t } = useLocale();
  const chain = result.chain;
  const total = chain?.current.approved_limit_minor ?? chain?.current.cart.total_minor ?? 0;
  const shown = useCountUp(total, 0, fresh);
  if (!chain) return null;
  const cart = chain.current.cart;
  const paid = isPaid(result.story);
  const unpaid = result.card?.state === "ACTIVE" && !paid;
  return (
    <div className="run-stack" data-run-state="approved">
      <Hero tone="ok" wally="approved" title={t(paid ? R.paidTitle : R.approvedTitle)} headingRef={headingRef} role="status" fresh={fresh}>
        <p className="run-hero__amount">
          <span aria-hidden="true">{formatHkd(shown)}</span>
          <span className="sr-only">{formatHkd(total)}</span>
          <ProvenanceChip prov={cartProv(cart)} className="run-hero__chip" />
        </p>
        <p className="run-hero__what">{itemTitle(cart)} · {shopName(cart)}</p>
        {result.answer === "yes" ? <p className="run-hero__note">{t(R.youSaidYes)}</p> : null}
      </Hero>
      <OneOffCard card={result.card} shop={shopName(cart)} enter={fresh} />
      {packet ? <BudgetNow packet={packet} fromMinor={chain.current.packet.remaining_minor} animate={fresh} /> : null}
      <CardStory story={result.story} limitMinor={result.card?.limit_minor ?? total} />
      <div className="run-actions">
        {unpaid && (!result.busy || paying) ? (
          <Button size="lg" block icon={<Icon name="lock" size={20} />} loading={paying} onClick={onPay}>{t(R.payNow)}</Button>
        ) : null}
        <Button variant="ghost" block onClick={onWhy} icon={<Icon name="info" size={20} />}>{t(R.whyApproved)}</Button>
      </div>
      <Footnote />
    </div>
  );
}
