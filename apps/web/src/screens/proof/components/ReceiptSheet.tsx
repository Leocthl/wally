// The receipt detail sheet: a plain summary first, then the money lines, what Wally checked in words, "Open in Wally",
// and two quiet disclosures (Details with rule ids and probabilities, Raw entry with the signed JSON).
import type { ReactElement } from "react";
import type { Decision, LogEntry } from "../../../api/types";
import { ChipScope } from "../../../components/ChipScope";
import { Num, NumText } from "../../../components/Num";
import { SIMULATED, type Prov } from "../../../domain/provenance";
import { UI } from "../../../i18n/ui";
import { Button } from "../../../ui/Button";
import { cx } from "../../../ui/cx";
import { Icon } from "../../../ui/icons";
import { useLocale } from "../../../ui/locale";
import { Sheet } from "../../../ui/Overlay";
import type { Receipt } from "../receipts";
import { amountProv, longTime, receiptSummary, receiptTitle, STATE_META } from "../receiptWords";
import { HashId, SeqId } from "./Fill";
import { RawEntry } from "./RawEntry";
import { DecisionDetails, ReceiptChecks } from "./ReceiptChecks";

const R = UI.receipts;

function MoneyLines({ cart, prov }: { readonly cart: Decision["cart"]; readonly prov: Prov }): ReactElement {
  const { t } = useLocale();
  const line = (label: string, minor: number, key: string, strong = false): ReactElement => (
    <div className={cx("rc-money__line", strong && "rc-money__line--total")} key={key}>
      <dt>{label}</dt>
      <dd><Num kind="money" value={minor} prov={prov} chip="scope" /></dd>
    </div>
  );
  return (
    <section className="rc-section" aria-labelledby="rc-money-title">
      <h3 id="rc-money-title" className="rc-section__title">{t(R.moneyTitle)}</h3>
      <dl className="rc-money">
        {line(t(R.subtotal), cart.subtotal_minor, "sub")}
        {line(t(R.shipping), cart.shipping_minor, "ship")}
        {cart.fees_minor > 0 ? line(t(R.fees), cart.fees_minor, "fees") : null}
        {cart.fx ? line(t(R.fxFee), cart.fx.fee_minor, "fx") : null}
        {line(t(R.total), cart.total_minor, "total", true)}
      </dl>
    </section>
  );
}

export interface ReceiptSheetProps {
  readonly open: boolean;
  /** The receipt shown; kept while the sheet animates out. */
  readonly receipt: Receipt | null;
  readonly entry: LogEntry | null;
  readonly onClose: () => void;
  /** Opens another receipt (the earlier one this receipt closes). */
  readonly onOpenDecision: (decisionId: string) => void;
  readonly api: string;
}

export function ReceiptSheet({ open, receipt, entry, onClose, onOpenDecision, api }: ReceiptSheetProps): ReactElement | null {
  const { t, locale } = useLocale();
  if (receipt === null || entry === null) return null;
  const meta = STATE_META[receipt.state];
  const prov = amountProv(receipt);
  const decision = entry.kind === "DECISION" ? entry.payload : null;
  const scope: readonly Prov[] = prov.kind === "SIMULATED" ? [SIMULATED] : [SIMULATED, prov];
  return (
    <Sheet open={open} onClose={onClose} title={t(meta.label)} description={receiptTitle(receipt, t)}>
      <ChipScope provs={scope} className="rc-sheet" chipsClassName="rc-sheet__chips">
        <div className={cx("rc-hero", `rc-hero--${meta.tone}`)} data-receipt-seq={receipt.seq}>
          <span className="rc-hero__icon"><Icon name={meta.icon} size={28} /></span>
          <p className="rc-hero__summary">{receiptSummary(receipt, entry, t, locale, api)}</p>
          {receipt.amountMinor !== null && receipt.state !== "stopped" && receipt.state !== "declined" ? <p className="rc-hero__amount"><Num kind="money" value={receipt.amountMinor} prov={prov} chip="scope" /></p> : null}
          <p className="rc-hero__meta">
            <span>{t(R.receiptNo)} <SeqId seq={receipt.seq} /></span>
            <span aria-hidden="true">·</span>
            <HashId hash={receipt.hash} />
            <span aria-hidden="true">·</span>
            <NumText text={longTime(receipt.ts)} prov={SIMULATED} chip="scope" kind="time" />
          </p>
        </div>
        {decision ? <MoneyLines cart={decision.cart} prov={prov} /> : null}
        {decision ? <ReceiptChecks decision={decision} prov={prov} api={api} /> : null}
        {receipt.resolves ? (
          <p className="rc-resolves">
            {t(R.resolves)}{" "}
            <Button variant="ghost" size="sm" onClick={() => onOpenDecision(receipt.resolves ?? "")}>{t(R.seeEarlier)}</Button>
          </p>
        ) : null}
        {receipt.decisionId ? (
          <a className="w-btn w-btn--secondary w-btn--md w-btn--block rc-open" href={`#/wally?d=${encodeURIComponent(receipt.decisionId)}`} onClick={onClose}>
            <span className="w-btn__icon"><Icon name="sparkle" size={20} /></span>
            <span className="w-btn__label">{t(R.openInWally)}</span>
          </a>
        ) : null}
        {decision ? <p className="rc-foot"><Icon name="shieldCheck" size={18} /> {t(R.rulesNotAi)}</p> : null}
        <div className="rc-more">
          {decision ? (
            <details className="rc-disclosure" data-disclosure="details">
              <summary>{t(R.details)}</summary>
              <DecisionDetails decision={decision} prov={prov} api={api} />
            </details>
          ) : null}
          <details className="rc-disclosure" data-disclosure="raw">
            <summary>{t(R.rawEntry)}</summary>
            <RawEntry entry={entry} />
          </details>
        </div>
      </ChipScope>
    </Sheet>
  );
}
