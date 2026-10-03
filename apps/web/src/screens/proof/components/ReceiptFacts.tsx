// The facts of one receipt for the curious, in plain words: its number, when it was written, what it is locked to, who signed
// it, and, for the receipt that failed the check, which check. It never prints the receipt's kind and never shows the raw
// receipt: that block, with its hashes and JSON, belongs to developer mode.
import type { ReactElement } from "react";
import type { LogEntry } from "../../../api/types";
import { NumText } from "../../../components/Num";
import { SIMULATED } from "../../../domain/provenance";
import { useLocale } from "../../../ui/locale";
import { PLAIN } from "../plainStrings";
import { receiptNumber, signedByYou } from "../plainWords";
import { longTime } from "../receiptWords";
import { Fill, HashId } from "./Fill";

/** How much of the signer's key is shown: enough to tell two keys apart. */
const KEY_TAIL = 8;

const id = (n: number): ReactElement => <span data-ident>{n}</span>;

export function ReceiptFacts({ entry, code = null }: { readonly entry: LogEntry; readonly code?: string | null }): ReactElement {
  const { t } = useLocale();
  const key = <span className="mono" data-ident data-selectable>{entry.signer.slice(-KEY_TAIL)}</span>;
  return (
    <div className="pf-facts">
      <p><Fill text={t(PLAIN.detailNumber)} slots={{ n: id(receiptNumber(entry.seq)) }} /></p>
      <p><Fill text={t(PLAIN.detailWritten)} slots={{ time: <NumText text={longTime(entry.ts)} prov={SIMULATED} chip="scope" kind="time" /> }} /></p>
      <p>{entry.seq === 0 ? t(PLAIN.detailFirst) : <Fill text={t(PLAIN.detailLocked)} slots={{ n: id(entry.seq), fp: <HashId hash={entry.prev_hash} /> }} />}</p>
      <p><Fill text={t(signedByYou(entry) ? PLAIN.detailSignedBoth : PLAIN.detailSignedWally)} slots={{ key }} /></p>
      {code === null ? null : <p><Fill text={t(PLAIN.detailFailed)} slots={{ code: <code className="pf-code" data-ident data-reason={code}>{code}</code> }} /></p>}
    </div>
  );
}
