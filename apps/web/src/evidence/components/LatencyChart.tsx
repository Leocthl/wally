// Decision latency per baseline (p50, p95, n). Live runs only [F26]: a recorded run shows the file's own "not measured".
import type { ReactElement } from "react";
import { Bi } from "../../components/Bi";
import { BASELINE_NAMES } from "../metrics";
import { compareMs } from "../select";
import { E } from "../strings";
import { BASELINES, type BaselineId, type HarnessRun, type Latency } from "../types";
import { Verdict } from "./Bars";
import { EvNum, EvScope } from "./EvNum";
import { WiringStamp } from "./RateChart";

export const ms = (v: number): string => `${v < 10 ? v.toFixed(1) : Math.round(v)} ms`;

function latencyWords(l: Latency | null): string {
  if (l === null) return E.notInFile.en;
  return l.measured ? `p50 ${ms(l.p50)}, p95 ${ms(l.p95)}, n=${l.n}` : `${E.latencyNotMeasured.en}: ${l.note}`;
}

function Row({ b, l, max }: { readonly b: BaselineId; readonly l: Latency | null; readonly max: number }): ReactElement {
  const width = (v: number): string => `${max > 0 ? (v / max) * 100 : 0}%`;
  return (
    <div className="ev-bar ev-bar--latency" data-baseline={b}>
      <span className="ev-bar__name"><span data-ident className="ev-bar__id">{b}</span> <Bi text={BASELINE_NAMES[b]} /></span>
      {l?.measured ? (
        <span className="ev-bar__track ev-bar__track--pair" aria-hidden="true">
          <span className="ev-bar__fill" style={{ inlineSize: width(l.p50) }} />
          <span className="ev-bar__fill ev-bar__fill--p95" style={{ inlineSize: width(l.p95) }} />
        </span>
      ) : null}
      <span className="ev-bar__value">
        {l === null ? <Bi text={E.notInFile} className="soft" /> : null}
        {l !== null && !l.measured ? <><Bi text={E.latencyNotMeasured} className="soft" /> <q className="ev-quote" data-ident>{l.note}</q></> : null}
        {l?.measured ? <EvNum chip={l.chip}><span data-ident>p50</span> {ms(l.p50)} · <span data-ident>p95</span> {ms(l.p95)} · n={l.n}</EvNum> : null}
      </span>
    </div>
  );
}

export function LatencyChart({ run, wiring }: { readonly run: HarnessRun; readonly wiring: boolean }): ReactElement {
  const lat = (b: BaselineId): Latency | null => run.baselines[b]?.latency ?? null;
  const measured = BASELINES.flatMap((b) => { const l = lat(b); return l?.measured ? [l] : []; });
  const max = Math.max(0, ...measured.map((l) => l.p95));
  const chips = BASELINES.flatMap((b) => { const l = lat(b); return l ? [l.chip] : []; });
  const label = `${E.latencyQuestion.en} ${BASELINES.map((b) => `${b} ${BASELINE_NAMES[b].en}: ${latencyWords(lat(b))}`).join(". ")}. ${[...new Set(chips.map((c) => c.text))].join(", ")}. Scenarios and rail SIMULATED.`;
  const p = (b: BaselineId, key: "p50" | "p95"): number | null => { const l = lat(b); return l?.measured ? l[key] : null; };
  return (
    <figure className="ev-chart" data-metric="latency">
      <figcaption className="ev-chart__head">
        <WiringStamp on={wiring} />
        <h3 className="ev-chart__q"><Bi text={E.latencyQuestion} /></h3>
        <p className="ev-chart__metric soft"><code data-ident>latency</code> <Bi text={E.latencyTitle} /></p>
      </figcaption>
      <EvScope chips={chips}>
        <div className="ev-bars" role="img" aria-label={label}>
          {BASELINES.map((b) => <Row key={b} b={b} l={lat(b)} max={max} />)}
        </div>
      </EvScope>
      <ul className="ev-verdicts" aria-label="B2 compared, latency">
        {(["p50", "p95"] as const).flatMap((key) => (["B0", "B1"] as const).map((o) => (
          <Verdict key={`${key}-${o}`} against={`${o} (${key})`} cmp={compareMs(p("B2", key), p(o, key))} />
        )))}
      </ul>
    </figure>
  );
}
