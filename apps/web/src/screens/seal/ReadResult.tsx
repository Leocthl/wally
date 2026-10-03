// What the sentence reader found, shown above the editable rows: the chip labels it read, the plain notes (defaults it
// applied, why the fixed rules answered when the model did not) and what the sentence asked for that the suggestion
// leaves out. It suggests only: the rows below stay editable and nothing is sealed from here.
import { useId, type ReactElement } from "react";
import type { CompileResult } from "../../api/types";
import { UI } from "../../i18n/ui";
import { Tag } from "../../ui/Chip";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";

export function ReadResult({ result }: { readonly result: CompileResult }): ReactElement {
  const { t, locale } = useLocale();
  const titleId = useId();
  return (
    <section className="seal-read" role="status" aria-labelledby={titleId} data-source={result.source}>
      <h3 id={titleId} className="seal-read__title"><Icon name="settings" size={18} /> {t(UI["seal.readTitle"])}</h3>
      {/* The labels echo the shopper's own sentence and the rows below; they are not figures the app asserts. */}
      <ul className="seal-read__labels" data-ident>
        {result.labels.map((l) => (
          <li key={`${l.kind}-${l.rule}`}><Tag tone="info" size="sm" lang={locale}>{locale === "zh-HK" ? l.zhHK : l.en}</Tag></li>
        ))}
      </ul>
      {result.notes.map((note) => <p key={note} className="seal-read__note" data-ident>{note}</p>)}
      {result.clamped.length > 0 ? (
        <div className="seal-read__clamped">
          <p className="seal-read__clamped-title"><Icon name="alert" size={16} /> {t(UI["seal.readLeftOut"])}</p>
          <ul>{result.clamped.map((c) => <li key={c} data-ident>{c}</li>)}</ul>
        </div>
      ) : null}
      <p className="seal-read__foot">{t(UI[result.source === "model" ? "seal.readModel" : "seal.readRules"])} {t(UI["seal.readCheck"])}</p>
    </section>
  );
}
