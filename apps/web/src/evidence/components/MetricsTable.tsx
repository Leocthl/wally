// Every rate the file carries, B0, B1, B2 side by side: the text alternative to the charts and the guard against
// cherry-picking. Latency rows come last. One chip in the header when the whole table shares it.
import type { ReactElement } from "react";
import { Bi } from "../../components/Bi";
import { BASELINE_NAMES, rateKeys, specOf } from "../metrics";
import { E } from "../strings";
import { BASELINES, type HarnessRun, type Rate } from "../types";
import { rateText } from "./Bars";
import { EvNum, EvScope } from "./EvNum";
import { ms } from "./LatencyChart";

function Cell({ rate }: { readonly rate: Rate | null }): ReactElement {
  return <td>{rate === null ? <Bi text={E.notInFile} className="soft" /> : <EvNum chip={rate.chip}>{rateText(rate)}</EvNum>}</td>;
}

export function MetricsTable({ run }: { readonly run: HarnessRun }): ReactElement {
  const keys = rateKeys(run);
  const chips = BASELINES.flatMap((b) => Object.values(run.baselines[b]?.rates ?? {}).map((r) => r.chip));
  return (
    <section className="ev-table" aria-labelledby="ev-table-title">
      <h3 id="ev-table-title"><Bi text={E.tableTitle} /></h3>
      <EvScope chips={chips}>
        <div className="ev-table__scroll" tabIndex={0} role="region" aria-labelledby="ev-table-title">
          <table>
            <thead>
              <tr>
                <th scope="col"><Bi text={E.tableMetric} /></th>
                <th scope="col"><Bi text={E.tableBetter} /></th>
                {BASELINES.map((b) => <th key={b} scope="col"><span data-ident>{b}</span> <Bi text={BASELINE_NAMES[b]} /></th>)}
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => {
                const spec = specOf(key);
                return (
                  <tr key={key} data-metric={key}>
                    <th scope="row"><Bi text={spec.title} /> <code data-ident className="soft">{key}</code></th>
                    <td><Bi text={spec.lowerIsBetter ? E.lowerBetter : E.higherBetter} /></td>
                    {BASELINES.map((b) => <Cell key={b} rate={run.baselines[b]?.rates[key] ?? null} />)}
                  </tr>
                );
              })}
              <tr data-metric="latency">
                <th scope="row"><Bi text={E.latencyTitle} /></th>
                <td><Bi text={E.lowerBetter} /></td>
                {BASELINES.map((b) => {
                  const l = run.baselines[b]?.latency ?? null;
                  if (l === null) return <td key={b}><Bi text={E.notInFile} className="soft" /></td>;
                  if (!l.measured) return <td key={b}><Bi text={E.latencyNotMeasured} className="soft" /></td>;
                  return <td key={b}><EvNum chip={l.chip}><span data-ident>p50</span> {ms(l.p50)} · <span data-ident>p95</span> {ms(l.p95)} · n={l.n}</EvNum></td>;
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </EvScope>
      <Bi as="p" text={E.ciNote} className="soft ev-note" />
    </section>
  );
}
