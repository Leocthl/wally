// One purchase in the Receipts list: the item and shop, the amount, where it ended up in words and its receipt number, and
// "3 steps" that opens the receipts behind it (the decision, the one-off card, the charge...). A purchase is one row, so it is not
// read as three charges; each step still opens its own receipt. Memoised like ReceiptRow.
import { memo, useId, useState, type ReactElement } from "react";
import { Num, NumText } from "../../../components/Num";
import { SIMULATED } from "../../../domain/provenance";
import { UI } from "../../../i18n/ui";
import { cx } from "../../../ui/cx";
import { Icon } from "../../../ui/icons";
import { useLocale } from "../../../ui/locale";
import { ListRow } from "../../../ui/Surface";
import { PLAIN } from "../plainStrings";
import { receiptNumber } from "../plainWords";
import type { Purchase } from "../purchases";
import { amountProv, receiptTitle, shortTime, STATE_META } from "../receiptWords";
import { Fill } from "./Fill";

const R = UI.receipts;

export interface PurchaseRowProps {
  readonly purchase: Purchase;
  /** The time shown: that of the newest receipt of the purchase. */
  readonly ts: string;
  readonly onOpen: (seq: number) => void;
  /** The receipt the changed copy changed (the tamper demo), when it is one of this purchase's. */
  readonly changedSeq: number | null;
}

/** Money that did not move (a stop) is shown quiet and struck through; the words say why. */
const NOT_MOVED = new Set(["stopped"]);

function Steps({ purchase, onOpen, changedSeq, startOpen }: Pick<PurchaseRowProps, "purchase" | "onOpen" | "changedSeq"> & { readonly startOpen: boolean }): ReactElement {
  const { t } = useLocale();
  const [open, setOpen] = useState(startOpen);
  const list = useId();
  return (
    <div className="rc-steps" data-open={open || undefined}>
      <button type="button" className="rc-steps__toggle" aria-expanded={open} aria-controls={list} onClick={() => setOpen((o) => !o)} data-steps-toggle>
        <Icon name="chevronRight" size={18} className="rc-steps__chevron" />
        <span><Fill text={t(R.steps)} slots={{ n: <span data-ident>{purchase.steps.length}</span> }} /></span>
      </button>
      <ol id={list} className="rc-steps__list" aria-label={t(R.stepsList)} hidden={!open}>
        {purchase.steps.map((step) => {
          const meta = STATE_META[step.state];
          return (
            <li key={step.seq}>
              <button type="button" className={cx("rc-step", step.seq === changedSeq && "rc-step--changed")} data-seq={step.seq} data-state={step.state} onClick={() => onOpen(step.seq)}>
                <span className={cx("rc-step__icon", `rc-step__icon--${meta.tone}`)} aria-hidden="true"><Icon name={meta.icon} size={16} /></span>
                <span className="rc-step__text">
                  <span className="rc-step__what">{t(PLAIN.events[step.event])}</span>
                  <span className="rc-step__meta">
                    <Fill text={t(PLAIN.receiptNo)} slots={{ n: <span data-ident>{receiptNumber(step.seq)}</span> }} />
                    {" · "}
                    <NumText text={shortTime(step.ts)} prov={SIMULATED} chip="scope" kind="time" />
                    {step.seq === changedSeq ? <>{" · "}<span className="rc-row__changed">{t(PLAIN.changed)}</span></> : null}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function PurchaseRowBase({ purchase, ts, onOpen, changedSeq }: PurchaseRowProps): ReactElement {
  const { t } = useLocale();
  const meta = STATE_META[purchase.state];
  const flagged = changedSeq !== null && purchase.steps.some((s) => s.seq === changedSeq);
  // The row opens the receipt that tells how the purchase ended, or, while the tamper demo's changed copy is up, the changed one.
  const opens = flagged && changedSeq !== null ? changedSeq : purchase.headline.seq;
  const amountClass = NOT_MOVED.has(purchase.state) ? "rc-row__amount rc-row__amount--void" : "rc-row__amount";
  return (
    <ListRow
      className={cx("rc-row", "rc-purchase", flagged && "rc-row--flagged")}
      tone={meta.tone}
      leading={<Icon name={meta.icon} size={22} />}
      title={receiptTitle(purchase.lead, t, true)}
      subtitle={
        <span className="rc-row__meta" data-state={purchase.state} data-seq={opens} data-purchase={purchase.id}>
          <span className="rc-row__state">{t(meta.label)}</span>
          {" · "}
          <Fill text={t(PLAIN.receiptNo)} slots={{ n: <span data-ident>{receiptNumber(purchase.lead.seq)}</span> }} />
          {flagged ? <>{" · "}<span className="rc-row__changed">{t(PLAIN.changed)}</span></> : null}
        </span>
      }
      trailing={
        <span className="rc-row__end">
          {purchase.amountMinor === null ? null : <Num kind="money" value={purchase.amountMinor} prov={amountProv(purchase.lead)} chip="scope" className={amountClass} />}
          <NumText text={shortTime(ts)} prov={SIMULATED} chip="scope" kind="time" />
        </span>
      }
      onClick={() => onOpen(opens)}
      extra={purchase.steps.length > 1 ? <Steps purchase={purchase} onOpen={onOpen} changedSeq={changedSeq} startOpen={flagged} /> : null}
    />
  );
}

export const PurchaseRow = memo(PurchaseRowBase);
