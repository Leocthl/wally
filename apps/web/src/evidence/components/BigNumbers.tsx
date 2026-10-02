// Three headline numbers, model-only gate (B0) against the full pipeline (B2): overspend, over-limit mints and the cost
// side, false blocks. Readable in about twenty seconds (DM8); k/n is the big numeral, the percentage never stands alone.
import type { ReactElement } from "react";
import { Tx } from "./Tx";
import { BASELINE_NAMES, specOf } from "../metrics";
import { compareToB2 } from "../select";
import { formatInterval, formatPct } from "../stats";
import { E } from "../strings";
import type { BaselineId, HarnessRun, Rate } from "../types";
import { Verdict } from "./Bars";
import { EvNum, EvScope } from "./EvNum";
import { chipsOf, WiringStamp } from "./RateChart";

/** The cost side (false blocks) sits second, so it is on screen with the first win, never below the fold. */
export const HEADLINE_KEYS = ["overspend_rate", "false_block_rate", "over_limit_mint_rate"] as const;

function Figure({ b, rate }: { readonly b: BaselineId; readonly rate: Rate | null }): ReactElement {
  const pct = rate ? formatPct(rate.k, rate.n) : null;
  return (
    <div className="ev-big__row" data-baseline={b}>
      <span className="ev-big__who"><span data-ident className="ev-bar__id">{b}</span> <Tx text={BASELINE_NAMES[b]} /></span>
      {rate === null ? <Tx text={E.notInFile} className="soft" /> : (
        <EvNum chip={rate.chip} className="ev-big__num">
          <span className="ev-big__kn">{`${rate.k}/${rate.n}`}</span>
          {pct === null ? null : <span className="ev-big__pct">{` ${pct}`}</span>}
          {pct === null ? null : <span className="ev-big__ci">{` CI ${formatInterval(rate.k, rate.n) ?? ""}`}</span>}
        </EvNum>
      )}
      {rate !== null && rate.n === 0 ? <Tx text={E.noCases} className="soft" /> : null}
    </div>
  );
}

function Card({ metric, run, wiring }: { readonly metric: string; readonly run: HarnessRun; readonly wiring: boolean }): ReactElement {
  const spec = specOf(metric);
  const b0 = run.baselines.B0?.rates[metric] ?? null;
  const b2 = run.baselines.B2?.rates[metric] ?? null;
  return (
    <article className="ev-big__card" data-big={metric} aria-labelledby={`ev-big-${metric}`}>
      <WiringStamp on={wiring} />
      <h3 id={`ev-big-${metric}`} className="ev-big__title"><Tx text={spec.title} /></h3>
      <EvScope chips={chipsOf([b0, b2])}>
        <Figure b="B0" rate={b0} />
        <Figure b="B2" rate={b2} />
      </EvScope>
      <ul className="ev-verdicts"><Verdict against="B0" cmp={compareToB2(b2, b0)} /></ul>
    </article>
  );
}

export function BigNumbers({ run, wiring, stage = false }: { readonly run: HarnessRun; readonly wiring: boolean; readonly stage?: boolean }): ReactElement {
  return (
    <section className={`ev-big ${stage ? "ev-big--stage" : ""}`.trim()} aria-label="Headline numbers" data-wiring={wiring}>
      {HEADLINE_KEYS.map((m) => <Card key={m} metric={m} run={run} wiring={wiring} />)}
    </section>
  );
}
