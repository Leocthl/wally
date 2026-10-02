// The harness part of the Evidence screen for one chosen run: wiring banner first, then acceptance, then the charts in
// one fixed baseline order, then every metric in a table.
import type { ReactElement } from "react";
import { Bi } from "../../components/Bi";
import { headlineKeys, specOf } from "../metrics";
import { wiringStatus } from "../select";
import { E } from "../strings";
import type { HarnessRun } from "../types";
import { AcceptanceStrip } from "./AcceptanceStrip";
import { JudgeChart } from "./JudgeChart";
import { LatencyChart } from "./LatencyChart";
import { MetricsTable } from "./MetricsTable";
import { RateChart } from "./RateChart";
import { WiringBanner } from "./RunStatus";

export function HarnessSection({ run }: { readonly run: HarnessRun }): ReactElement {
  const status = wiringStatus(run);
  return (
    <div className="ev-harness" data-wiring={status.wiringOnly}>
      <WiringBanner status={status} run={run} />
      <AcceptanceStrip rows={run.acceptance} />
      <section aria-labelledby="ev-charts-title">
        <h3 id="ev-charts-title" className="ev-section-title"><Bi text={E.chartsTitle} /></h3>
        <Bi as="p" text={E.intro} className="soft ev-note" />
        <div className="ev-charts">
          {headlineKeys(run).map((key) => <RateChart key={key} spec={specOf(key)} run={run} wiring={status.wiringOnly} />)}
          <JudgeChart run={run} wiring={status.wiringOnly} />
          <LatencyChart run={run} wiring={status.wiringOnly} />
        </div>
      </section>
      <MetricsTable run={run} />
      {run.dropped.length > 0 ? (
        <section className="ev-dropped" aria-labelledby="ev-dropped-title">
          <h3 id="ev-dropped-title"><Bi text={E.droppedTitle} /></h3>
          <ul>{run.dropped.map((d) => <li key={d}><code data-ident>{d}</code></li>)}</ul>
        </section>
      ) : null}
    </div>
  );
}
