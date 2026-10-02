// One receipt in the list: state icon, plain title, "state · #seq · hash", amount and time. Memoised: a new log entry
// re-renders only the new row, so two hundred receipts stay smooth.
import { memo, type ReactElement } from "react";
import { Num, NumText } from "../../../components/Num";
import { SIMULATED } from "../../../domain/provenance";
import { Icon } from "../../../ui/icons";
import { useLocale } from "../../../ui/locale";
import { ListRow } from "../../../ui/Surface";
import type { Receipt } from "../receipts";
import { amountProv, receiptTitle, shortTime, STATE_META } from "../receiptWords";
import { HashId, SeqId } from "./Fill";

export interface ReceiptRowProps {
  readonly receipt: Receipt;
  readonly onOpen: (seq: number) => void;
  /** Marks the row the verifier named as broken (Proof screen tamper demo). */
  readonly flagged?: boolean;
}

/** Money that did not move (a stop, a declined charge) is shown quiet and struck through; the state words say why. */
const NOT_MOVED = new Set(["stopped", "declined"]);

function ReceiptRowBase({ receipt: r, onOpen, flagged = false }: ReceiptRowProps): ReactElement {
  const { t } = useLocale();
  const meta = STATE_META[r.state];
  const amountClass = NOT_MOVED.has(r.state) ? "rc-row__amount rc-row__amount--void" : "rc-row__amount";
  return (
    <ListRow
      className={flagged ? "rc-row rc-row--flagged" : "rc-row"}
      tone={meta.tone}
      leading={<Icon name={meta.icon} size={22} />}
      title={receiptTitle(r, t, true)}
      subtitle={
        <span className="rc-row__meta" data-state={r.state} data-seq={r.seq}>
          <span className="rc-row__state">{t(meta.label)}</span> · <SeqId seq={r.seq} /> · <HashId hash={r.hash} />
        </span>
      }
      trailing={
        <span className="rc-row__end">
          {r.amountMinor === null ? null : <Num kind="money" value={r.amountMinor} prov={amountProv(r)} chip="scope" className={amountClass} />}
          <NumText text={shortTime(r.ts)} prov={SIMULATED} chip="scope" kind="time" />
        </span>
      }
      onClick={() => onOpen(r.seq)}
    />
  );
}

export const ReceiptRow = memo(ReceiptRowBase);
