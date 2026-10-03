// One receipt on the plain Proof timeline. Closed, it is a row a person can read: a disc (tick, cross, dashed ring or
// neutral), what happened, "Receipt 3 · Untouched", the shop and item, the amount and the time. Opened, it shows the facts
// for the curious: the receipt's number, when it was written, what it is locked to, who signed, and the failed check. Never
// the raw receipt (developer mode only). The facts are built only while open, so two hundred rows cost no more than their summaries.
import { memo, useState, type ReactElement } from "react";
import type { LogEntry } from "../../../api/types";
import { Num, NumText } from "../../../components/Num";
import { SIMULATED } from "../../../domain/provenance";
import type { LabelPair } from "../../../i18n/label";
import { Icon, type IconName } from "../../../ui/icons";
import { useLocale } from "../../../ui/locale";
import { PLAIN } from "../plainStrings";
import { eventWords, receiptNumber, type RowStatus } from "../plainWords";
import type { Receipt } from "../receipts";
import { amountProv, compactName, shortTime } from "../receiptWords";
import { Fill } from "./Fill";
import { ReceiptFacts } from "./ReceiptFacts";
import { NOT_MOVED } from "./ReceiptRow";

const STATUS: Readonly<Record<RowStatus, { readonly icon: IconName | null; readonly word: LabelPair | null }>> = {
  idle: { icon: "receipt", word: null },
  ok: { icon: "check", word: PLAIN.untouched },
  changed: { icon: "close", word: PLAIN.changed },
  after: { icon: null, word: PLAIN.notChecked },
};

const id = (n: number): ReactElement => <span data-ident>{n}</span>;

export interface PlainTimelineRowProps {
  readonly entry: LogEntry;
  readonly receipt: Receipt;
  readonly status: RowStatus;
  /** The technical code of the failed check, for the row that failed; shown only in its details. */
  readonly code: string | null;
}

function PlainTimelineRowBase({ entry, receipt: r, status, code }: PlainTimelineRowProps): ReactElement {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const meta = STATUS[status];
  const what = [r.merchant, r.item].filter((s): s is string => s !== null).map(compactName).join(" · ");
  const amountClass = NOT_MOVED.has(r.state) ? "pf-tl__amount pf-tl__amount--void" : "pf-tl__amount";
  return (
    <li className="pf-tl__item" data-status={status} data-seq={entry.seq}>
      <details className="pf-tl__row" onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary className="pf-tl__summary">
          <span className="pf-tl__disc" aria-hidden="true">{meta.icon === null ? null : <Icon name={meta.icon} size={status === "idle" ? 18 : 20} strokeWidth={status === "idle" ? 2 : 2.8} />}</span>
          <span className="pf-tl__text">
            <span className="pf-tl__title">{t(eventWords(entry))}</span>
            <span className="pf-tl__sub">
              <Fill text={t(PLAIN.receiptNo)} slots={{ n: id(receiptNumber(entry.seq)) }} />
              {meta.word === null ? null : <>{" · "}<span className="pf-tl__state">{t(meta.word)}</span></>}
            </span>
            {what === "" ? null : <span className="pf-tl__what" data-ident>{what}</span>}
          </span>
          <span className="pf-tl__end">
            {r.amountMinor === null ? null : <Num kind="money" value={r.amountMinor} prov={amountProv(r)} chip="scope" className={amountClass} />}
            <NumText text={shortTime(r.ts)} prov={SIMULATED} chip="scope" kind="time" />
          </span>
          <span className="sr-only">{t(PLAIN.showDetails)}</span>
        </summary>
        {open ? <div className="pf-tl__details"><ReceiptFacts entry={entry} code={code} /></div> : null}
      </details>
    </li>
  );
}

export const PlainTimelineRow = memo(PlainTimelineRowBase);
