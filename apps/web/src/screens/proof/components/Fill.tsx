// Fills {name} placeholders in a translated sentence with elements, so figures keep their own markup (a chip, data-ident)
// and each language keeps its own word order. A placeholder with no slot is left out rather than shown raw.
import { Fragment, type ReactElement, type ReactNode } from "react";

const PLACEHOLDER = /\{(\w+)\}/g;

export function fill(text: string, slots: Readonly<Record<string, ReactNode>>): readonly ReactNode[] {
  const out: ReactNode[] = [];
  let cursor = 0;
  for (const m of text.matchAll(PLACEHOLDER)) {
    const at = m.index ?? 0;
    if (at > cursor) out.push(text.slice(cursor, at));
    const name = m[1] ?? "";
    if (name in slots) out.push(<Fragment key={`${name}-${at}`}>{slots[name]}</Fragment>);
    cursor = at + m[0].length;
  }
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

export function Fill({ text, slots }: { readonly text: string; readonly slots: Readonly<Record<string, ReactNode>> }): ReactElement {
  return <>{fill(text, slots)}</>;
}

/** "#7" as an identifier (seq numbers are ids, not figures that need a chip). */
export function SeqId({ seq }: { readonly seq: number }): ReactElement {
  return <span className="mono" data-ident>#{seq}</span>;
}

/** First characters of a hash, mono and selectable. No title attribute: hashes are not spoken as figures. */
export function HashId({ hash, chars = 8 }: { readonly hash: string; readonly chars?: number }): ReactElement {
  return <span className="mono" data-ident data-selectable>{hash.slice(0, chars)}</span>;
}
