// Approved: Wally made a one-off card. The card is the hero: the exact amount big, SIMULATED, the shop lock and a live
// clock. Pay now sits right under it while the card is unpaid and the checkout is manual (the run ended with the card
// still ready). Then what is left of the budget, the checkout story (DM2 beats) and Why.
import type { ReactElement, Ref } from "react";
import type { PacketState } from "../../../api/types";
import { formatHkd } from "../../../domain/money";
import { UI } from "../../../i18n/ui";
import { Button } from "../../../ui/Button";
import { cx } from "../../../ui/cx";
import { Icon } from "../../../ui/icons";
import { useLocale } from "../../../ui/locale";
import { Wally } from "../../../wally/Wally";
import { OneOffCard } from "../../console/OneOffCard";
import { shopName } from "../model/item";
import type { Result } from "../model/screen";
import { isPaid } from "../model/story";
import { BudgetNow } from "./BudgetNow";
import { CardStory } from "./CardStory";
import { Footnote } from "./parts";
import { SignedMark } from "./SignedMark";

const R = UI.run;

export interface ApprovedProps {
  readonly result: Result;
  readonly packet: PacketState | null;
  readonly fresh: boolean;
  readonly headingRef: Ref<HTMLHeadingElement>;
  readonly paying: boolean;
  /** Pay now pays the newest open card; offered only when that is this card. */
  readonly canPay: boolean;
  readonly onPay: () => void;
  readonly onWhy: () => void;
}

/** How many times the shop was refused: the card holds, and a new one makes it shake. */
export const declinesOf = (result: Result): number => result.story.filter((s) => s.tone === "held").length;

export function Approved({ result, packet, fresh, headingRef, paying, canPay, onPay, onWhy }: ApprovedProps): ReactElement | null {
  const { t } = useLocale();
  const chain = result.chain;
  if (!chain) return null;
  const cart = chain.current.cart;
  const total = chain.current.approved_limit_minor ?? cart.total_minor;
  const paid = isPaid(result.story);
  const unpaid = result.card?.state === "ACTIVE" && !paid;
  return (
    <div className="run-stack" data-run-state="approved">
      <div className={cx("run-head", fresh && "run-head--enter")} role="status">
        <Wally state="approved" size={64} decorative />
        <div className="run-head__text">
          <h2 className="run-head__title" tabIndex={-1} ref={headingRef}>{t(paid ? R.paidTitle : R.approvedTitle)}</h2>
          {result.answer === "yes" ? <p className="run-head__note"><SignedMark /> {t(R.youSaidYes)}</p> : null}
          <span className="sr-only">{formatHkd(total)}</span>
        </div>
      </div>
      <OneOffCard card={result.card} shop={shopName(cart)} enter={fresh} declines={declinesOf(result)} />
      {unpaid && canPay && (!result.busy || paying) ? (
        <Button size="lg" block icon={<Icon name="lock" size={20} />} loading={paying} onClick={onPay}>{t(R.payNow)}</Button>
      ) : null}
      {packet ? <BudgetNow packet={packet} fromMinor={chain.current.packet.remaining_minor} animate={fresh} /> : null}
      <CardStory story={result.story} limitMinor={result.card?.limit_minor ?? total} />
      <div className="run-actions">
        <Button variant="ghost" block onClick={onWhy} icon={<Icon name="info" size={20} />}>{t(R.whyApproved)}</Button>
      </div>
      <Footnote />
    </div>
  );
}
