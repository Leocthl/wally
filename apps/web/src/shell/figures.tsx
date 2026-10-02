// Figures on the new screens (docs/04 "no bare number"). Every amount, date and countdown renders as a [data-num] with
// its provenance; the surface it sits on shows that provenance once, as one quiet chip (ScopeChip, a direct child of
// the element marked data-chip-scope). test/helpers/figures.ts checks both halves of that contract.
import { Fragment, type ReactElement, type ReactNode } from "react";
import { formatHkd } from "../domain/money";
import type { Prov } from "../domain/provenance";
import { ProvenanceChip } from "../ui/Chip";
import { cx } from "../ui/cx";

export type FigKind = "money" | "time" | "count" | "percent";

export interface FigProps {
  readonly prov: Prov;
  readonly kind: FigKind;
  readonly children: ReactNode;
  readonly className?: string | undefined;
}

export function Fig({ prov, kind, children, className }: FigProps): ReactElement {
  return (
    <span className={cx("fig", className)} data-num data-kind={kind} data-prov={prov.kind}>
      {children}
    </span>
  );
}

export function Money({ minor, prov, className }: { readonly minor: number; readonly prov: Prov; readonly className?: string | undefined }): ReactElement {
  return (
    <Fig prov={prov} kind="money" className={className}>
      {formatHkd(minor)}
    </Fig>
  );
}

/** The one chip that covers every Fig of the same provenance inside its scope. Place it as a direct child of the scope. */
export function ScopeChip({ prov, className }: { readonly prov: Prov; readonly className?: string }): ReactElement {
  return (
    <span className={cx("chip-scope__chips", "fig-chip", className)}>
      <ProvenanceChip prov={prov} />
    </span>
  );
}

const SLOT = /\{([a-zA-Z]+)\}/g;

/** "of your {total} budget" with total = <Money/>: strings never hold figures, elements fill the slots. */
export function Fill({ text, slots }: { readonly text: string; readonly slots: Readonly<Record<string, ReactNode>> }): ReactElement {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(SLOT)) {
    const at = m.index ?? 0;
    if (at > last) parts.push(text.slice(last, at));
    const name = m[1] ?? "";
    parts.push(<Fragment key={`${name}-${at}`}>{slots[name] ?? m[0]}</Fragment>);
    last = at + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

/** The same fill for attributes (aria-valuetext, aria-label), where only text can go. */
export function fillText(text: string, values: Readonly<Record<string, string>>): string {
  return text.replace(SLOT, (whole, name: string) => values[name] ?? whole);
}
