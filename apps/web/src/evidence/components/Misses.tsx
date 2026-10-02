// Where the full pipeline (B2) is worse than a baseline on a headline rate, said up front under the bottom line: the
// metric, which baseline, both figures with their chips, and a note when the intervals overlap (a small sample cannot
// call it). The same comparisons the charts below make; nothing is computed here that they do not show.
import type { ReactElement } from "react";
import { BASELINE_NAMES, rateKeys, specOf } from "../metrics";
import { compareToB2, type Comparison } from "../select";
import { E } from "../strings";
import type { BaselineId, HarnessRun, Rate } from "../types";
import { rateText } from "./Bars";
import { EvNum, EvScope } from "./EvNum";
import { chipsOf } from "./RateChart";
import { Tx } from "./Tx";

interface Miss {
  readonly key: string;
  readonly against: BaselineId;
  readonly b2: Rate;
  readonly other: Rate;
  readonly cmp: Comparison;
}

const AGAINST: readonly BaselineId[] = ["B1", "B0"];

export function missesOf(run: HarnessRun): readonly Miss[] {
  return rateKeys(run).flatMap((key) => {
    const spec = specOf(key);
    const b2 = run.baselines.B2?.rates[key] ?? null;
    if (!spec.headline || b2 === null) return [];
    return AGAINST.flatMap((against) => {
      const other = run.baselines[against]?.rates[key] ?? null;
      const cmp = compareToB2(b2, other);
      return other !== null && cmp.kind === (spec.lowerIsBetter ? "higher" : "lower") ? [{ key, against, b2, other, cmp }] : [];
    });
  });
}

export function Misses({ run }: { readonly run: HarnessRun }): ReactElement | null {
  const rows = missesOf(run);
  if (rows.length === 0) return null;
  return (
    <section className="ev-misses" aria-labelledby="ev-misses-title" data-misses>
      <h3 id="ev-misses-title" className="ev-misses__title"><Tx text={E.missesTitle} /></h3>
      <ul className="ev-misses__list">
        {rows.map((m) => (
          <li key={`${m.key}-${m.against}`} className="ev-misses__row" data-miss={`${m.key}:${m.against}`}>
            <span className="ev-misses__what"><Tx text={specOf(m.key).title} className="ev-headline__metric" /> <Tx text={E.missesAgainst} /> <span data-ident>{m.against}</span> <Tx text={BASELINE_NAMES[m.against]} className="soft" /></span>
            <EvScope chips={chipsOf([m.b2, m.other])} className="ev-misses__figures">
              <span className="ev-misses__fig"><span data-ident>B2</span> <EvNum chip={m.b2.chip}>{rateText(m.b2)}</EvNum></span>
              <span className="ev-misses__fig"><span data-ident>{m.against}</span> <EvNum chip={m.other.chip}>{rateText(m.other)}</EvNum></span>
            </EvScope>
            {m.cmp.overlap ? <Tx text={E.overlap} className="ev-headline__note" /> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
