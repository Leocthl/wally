// One horizontal bar per baseline with k/n, the percentage and the Wilson interval, all inside one chipped figure.
// Bars are HTML; the chart's text alternative is its aria-label plus the all-metrics table (docs/04 Accessibility).
import type { CSSProperties, ReactElement } from "react";
import { Tx } from "./Tx";
import type { LabelPair } from "../../i18n/label";
import type { Comparison } from "../select";
import { formatInterval, formatPct, wilson } from "../stats";
import { E } from "../strings";
import type { Rate } from "../types";
import { EvNum } from "./EvNum";
import { MarkEqual, MarkHigher, MarkLower, MarkNone } from "./marks";

/** "6/150 · 4.0% · CI 1.8 to 8.5%"; with n = 0 only "0/0". */
export function rateText(r: Rate): string {
  const pct = formatPct(r.k, r.n);
  const ci = formatInterval(r.k, r.n);
  return pct === null || ci === null ? `${r.k}/${r.n}` : `${r.k}/${r.n} · ${pct} · CI ${ci}`;
}

/** Spoken form for aria-label: "6 of 150, 4.0%, CI 1.8 to 8.5%". */
export function rateWords(r: Rate | null): string {
  if (r === null) return E.notInFile.en;
  const pct = formatPct(r.k, r.n);
  return pct === null ? `${r.k} of ${r.n}, ${E.noCases.en}` : `${r.k} of ${r.n}, ${pct}, CI ${formatInterval(r.k, r.n) ?? ""}`;
}

export interface BarRowProps {
  readonly ident: string;
  readonly name: LabelPair;
  readonly rate: Rate | null;
  /** B0, B1 or B2: sets the bar pattern (hatched, solid blue, solid ink). */
  readonly tone: string;
  /** Position in the chart, for the staggered wipe-in. */
  readonly order?: number;
}

export function BarRow({ ident, name, rate, tone, order = 0 }: BarRowProps): ReactElement {
  const ci = rate ? wilson(rate.k, rate.n) : null;
  const fill = rate && rate.n > 0 ? (rate.k / rate.n) * 100 : 0;
  return (
    <div className="ev-bar" data-baseline={tone} data-empty={rate === null || rate.n === 0} style={{ ["--order" as string]: order } as CSSProperties}>
      <span className="ev-bar__name">
        <span data-ident className="ev-bar__id">{ident}</span> <Tx text={name} />
      </span>
      <span className="ev-bar__track" aria-hidden="true">
        {rate && rate.n > 0 ? <span className="ev-bar__fill" style={{ inlineSize: `${fill}%` }} /> : null}
        {ci ? <span className="ev-bar__ci" style={{ insetInlineStart: `${ci.low * 100}%`, inlineSize: `${(ci.high - ci.low) * 100}%` }} /> : null}
      </span>
      <span className="ev-bar__value">
        {rate === null ? <Tx text={E.notInFile} className="soft" /> : <EvNum chip={rate.chip}>{rateText(rate)}</EvNum>}
        {rate !== null && rate.n === 0 ? <> <Tx text={E.noCases} className="soft" /></> : null}
      </span>
    </div>
  );
}

const KIND_TEXT = { lower: E.lower, higher: E.higher, equal: E.equal, none: E.noCompare } as const;
const KIND_MARK = { lower: MarkLower, higher: MarkHigher, equal: MarkEqual, none: MarkNone } as const;

/** "B2 vs B0: lower, B2 better here". Worse and better get the same size and weight. */
export function Verdict({ against, cmp, lowerIsBetter = true }: { readonly against: string; readonly cmp: Comparison; readonly lowerIsBetter?: boolean }): ReactElement {
  const Mark = KIND_MARK[cmp.kind];
  const good = cmp.kind === (lowerIsBetter ? "lower" : "higher");
  const bad = cmp.kind === (lowerIsBetter ? "higher" : "lower");
  const tone = good ? "better" : bad ? "worse" : cmp.kind === "equal" ? "same" : "none";
  return (
    <li className={`ev-verdict ev-verdict--${tone}`} data-verdict={tone} data-against={against}>
      <Mark />
      <span>
        <span data-ident>B2</span> vs <span data-ident>{against}</span>: <Tx text={KIND_TEXT[cmp.kind]} />
        {good ? <strong> <Tx text={E.better} /></strong> : null}
        {bad ? <strong> <Tx text={E.worse} /></strong> : null}
        {cmp.kind === "equal" ? <> <Tx text={E.same} /></> : null}
        {cmp.overlap && cmp.kind !== "equal" ? <span className="ev-verdict__note"> <Tx text={E.overlap} /></span> : null}
      </span>
    </li>
  );
}
