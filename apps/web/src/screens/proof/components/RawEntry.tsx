// The raw log entry for the curious: hashes, signer and signature prefix, then the entry pretty-printed and selectable.
// The rail handle of a card is hidden (the UI never shows it, I8 spirit); everything else is as signed.
import type { ReactElement } from "react";
import type { LogEntry } from "../../../api/types";
import { UI } from "../../../i18n/ui";
import { useLocale } from "../../../ui/locale";

const R = UI.receipts;
const SIGNATURE_PREFIX = 16;
export const HIDDEN = "(hidden)";

/** A copy of the entry with any card handle replaced; the input is never changed. */
export function redactEntry(entry: LogEntry): unknown {
  if (entry.kind !== "CARD_MINTED") return entry;
  return { ...entry, payload: { ...entry.payload, handle: HIDDEN } };
}

export function RawEntry({ entry }: { readonly entry: LogEntry }): ReactElement {
  const { t } = useLocale();
  return (
    <div className="rc-raw">
      <dl className="rc-raw__facts">
        <div><dt>{t(R.entryHash)}</dt><dd className="mono" data-ident data-selectable>{entry.entry_hash}</dd></div>
        <div><dt>{t(R.prevHash)}</dt><dd className="mono" data-ident data-selectable>{entry.prev_hash}</dd></div>
        <div><dt>{t(R.signer)}</dt><dd className="mono" data-ident data-selectable>{entry.signer}</dd></div>
        <div><dt>{t(R.signature)}</dt><dd className="mono" data-ident data-selectable>{entry.signature.slice(0, SIGNATURE_PREFIX)}…</dd></div>
      </dl>
      <p className="rc-raw__note">{t(R.rawNote)}</p>
      <pre className="rc-raw__json mono" data-ident data-selectable tabIndex={0} aria-label={t(R.rawEntry)}>{JSON.stringify(redactEntry(entry), null, 2)}</pre>
    </div>
  );
}
