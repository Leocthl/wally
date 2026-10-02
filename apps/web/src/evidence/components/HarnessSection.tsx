// The harness part of the Evidence screen for one chosen run: headline numbers, acceptance, then the charts in one fixed
// baseline order, then every metric in a table. The wiring banner sits above all of it (EvidenceScreen).
import type { ReactElement } from "react";
import { Tx } from "./Tx";
import { headlineKeys, specOf } from "../metrics";
import { E } from "../strings";
import type { HarnessRun } from "../types";
import { AcceptanceStrip } from "./AcceptanceStrip";
import { BigNumbers } from "./BigNumbers";
import { JudgeChart } from "./JudgeChart";
import { LatencyChart } from "./LatencyChart";
import { MetricsTable } from "./MetricsTable";
import { RateChart } from "./RateChart";

export function HarnessSection({ run, wiring }: { readonly run: HarnessRun; readonly wiring: boolean }): ReactElement {
  return (
    <div className="ev-harness" data-wiring={wiring}>
      <BigNumbers run={run} wiring={wiring} />
      <AcceptanceStrip rows={run.acceptance} />
      <section aria-labelledby="ev-charts-title">
        <h3 id="ev-charts-title" className="ev-section-title"><Tx text={E.chartsTitle} /></h3>
        <Tx as="p" text={E.intro} className="soft ev-note" />
        <div className="ev-charts">
          {headlineKeys(run).map((key) => <RateChart key={key} spec={specOf(key)} run={run} wiring={wiring} />)}
          <JudgeChart run={run} wiring={wiring} />
          <LatencyChart run={run} wiring={wiring} />
        </div>
      </section>
      <MetricsTable run={run} />
      {run.dropped.length > 0 ? (
        <section className="ev-dropped" aria-labelledby="ev-dropped-title">
          <h3 id="ev-dropped-title"><Tx text={E.droppedTitle} /></h3>
          <ul>{run.dropped.map((d) => <li key={d}><code data-ident>{d}</code></li>)}</ul>
        </section>
      ) : null}
    </div>
  );
}
