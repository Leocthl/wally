// The receipt detail sheet: a plain summary first, then the money lines, what Wally checked in words, "Open in Wally",
// and the technical parts behind quiet disclosures. Developer mode keeps two (Details with rule ids and probabilities, Raw
// entry with the signed JSON) and the hash in the heading line. Plain mode numbers the receipt from 1, words a stop the way
// the Wally screen does, and holds the technical parts behind one "Show the details" (the rule by rule record, with no raw
// receipt: that stays developer only). A receipt of the changed copy says so at the top of its sheet.
import type { ReactElement } from "react";
import type { Decision, LogEntry } from "../../../api/types";
import { ChipScope } from "../../../components/ChipScope";
import { Num, NumText } from "../../../components/Num";
import { SIMULATED, type Prov } from "../../../domain/provenance";
import { wallyHref } from "../../../hooks/useRoute";
import { UI } from "../../../i18n/ui";
import { Button } from "../../../ui/Button";
import { cx } from "../../../ui/cx";
import { Icon } from "../../../ui/icons";
import { useLocale } from "../../../ui/locale";
import { Sheet } from "../../../ui/Overlay";
import { plainSummary } from "../plainReceiptWords";
import { PLAIN } from "../plainStrings";
import { receiptNumber } from "../plainWords";
import type { Receipt } from "../receipts";
import { amountProv, longTime, receiptSummary, receiptTitle, STATE_META, TemplateSentence } from "../receiptWords";
import { Fill, HashId, SeqId } from "./Fill";
import { RawEntry } from "./RawEntry";
import { DecisionDetails, ReceiptChecks } from "./ReceiptChecks";
import { ReceiptFacts } from "./ReceiptFacts";

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

/** Plain mode: everything technical in one place. The facts of the receipt, the engine's own sentence, the rule by rule record. */
function AllDetails({ decision, entry, prov, api }: { readonly decision: Decision | null; readonly entry: LogEntry; readonly prov: Prov; readonly api: string }): ReactElement {
  const { t, locale } = useLocale();
  const why = decision?.explanation;
  return (
    <details className="rc-disclosure" data-disclosure="all">
      <summary>{t(PLAIN.showDetails)}</summary>
      <ReceiptFacts entry={entry} />
      {decision && why ? (
        <p className="rc-details__engine"><TemplateSentence templateId={why.template_id} inputs={why.inputs} locale={locale} prov={prov} judge={decision.judge.provider} api={api} /></p>
      ) : null}
      {decision ? <DecisionDetails decision={decision} prov={prov} api={api} /> : null}
    </details>
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
  /** Plain mode (the default screens): receipt numbers from 1, no hash, no rule id, one "Show the details". */
  readonly plain?: boolean;
  /** This receipt is the one the changed copy changed (the tamper demo). */
  readonly changed?: boolean;
}

export function ReceiptSheet({ open, receipt, entry, onClose, onOpenDecision, api, plain = false, changed = false }: ReceiptSheetProps): ReactElement | null {
  const { t, locale } = useLocale();
  if (receipt === null || entry === null) return null;
  const meta = STATE_META[receipt.state];
  const prov = amountProv(receipt);
  const decision = entry.kind === "DECISION" ? entry.payload : null;
  const scope: readonly Prov[] = prov.kind === "SIMULATED" ? [SIMULATED] : [SIMULATED, prov];
  const summary = plain ? plainSummary(receipt, entry, t, locale, api) : receiptSummary(receipt, entry, t, locale, api);
  return (
    <Sheet open={open} onClose={onClose} title={t(meta.label)} description={receiptTitle(receipt, t, true)}>
      <ChipScope provs={scope} className="rc-sheet" chipsClassName="rc-sheet__chips">
        <div className={cx("rc-hero", `rc-hero--${meta.tone}`)} data-receipt-seq={receipt.seq}>
          <span className="rc-hero__icon"><Icon name={meta.icon} size={28} /></span>
          <p className="rc-hero__summary">{summary}</p>
          {receipt.amountMinor !== null && receipt.state !== "stopped" && receipt.state !== "declined" ? <p className="rc-hero__amount"><Num kind="money" value={receipt.amountMinor} prov={prov} chip="scope" /></p> : null}
          <p className="rc-hero__meta">
            {plain ? (
              <span><Fill text={t(PLAIN.receiptNo)} slots={{ n: <span data-ident>{receiptNumber(receipt.seq)}</span> }} /></span>
            ) : (
              <>
                <span>{t(R.receiptNo)} <SeqId seq={receipt.seq} /></span>
                <span aria-hidden="true">·</span>
                <HashId hash={receipt.hash} />
              </>
            )}
            <span aria-hidden="true">·</span>
            <NumText text={longTime(receipt.ts)} prov={SIMULATED} chip="scope" kind="time" />
          </p>
        </div>
        {changed ? <p className="rc-changed" role="note"><Icon name="alert" size={18} /> <span>{t(PLAIN.sheetChanged)}</span></p> : null}
        {decision ? <MoneyLines cart={decision.cart} prov={prov} /> : null}
        {decision ? <ReceiptChecks decision={decision} prov={prov} api={api} plain={plain} /> : null}
        {receipt.resolves ? (
          <p className="rc-resolves">
            {t(R.resolves)}{" "}
            <Button variant="ghost" size="sm" onClick={() => onOpenDecision(receipt.resolves ?? "")}>{t(R.seeEarlier)}</Button>
          </p>
        ) : null}
        {receipt.decisionId ? (
          <a className="w-btn w-btn--secondary w-btn--md w-btn--block rc-open" href={wallyHref(receipt.decisionId)} onClick={onClose}>
            <span className="w-btn__icon"><Icon name="sparkle" size={20} /></span>
            <span className="w-btn__label">{t(R.openInWally)}</span>
          </a>
        ) : null}
        {decision ? <p className="rc-foot"><Icon name="shieldCheck" size={18} /> {t(R.rulesNotAi)}</p> : null}
        <div className="rc-more">
          {plain ? (
            <AllDetails decision={decision} entry={entry} prov={prov} api={api} />
          ) : (
            <>
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
            </>
          )}
        </div>
      </ChipScope>
    </Sheet>
  );
}
