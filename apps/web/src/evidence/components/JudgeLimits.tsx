// Limits box for the judge panel, in the report's own terms. v2: SIMULATED corpus, one annotator, the split fixed by a
// hash rule before any run, weak Chinese, wide intervals, latency on a shared machine. v1: fit and test on the same cases.
import type { ReactElement } from "react";
import { Tx } from "./Tx";
import type { JudgeFit } from "../judgeFit";
import { J } from "../judgeStrings";
import { EvNum } from "./EvNum";
import { ms } from "./LatencyChart";

export function JudgeLimits({ fit }: { readonly fit: JudgeFit }): ReactElement {
  const v2 = fit.schema === "judge-fit/v2";
  const lines = v2 ? [J.limitCorpus, J.limitAnnotator, J.limitSplitV2, J.limitChinese, J.limitIntervals, J.limitLatency, J.limitTruncation] : [J.limitCorpus, J.limitAnnotator, J.limitSplitV1, J.limitChinese, J.limitTruncation];
  return (
    <section className="ev-limits-box" aria-labelledby="ev-limits-title" data-judge-limits>
      <h4 id="ev-limits-title"><Tx text={J.limitsTitle} /></h4>
      <ul className="ev-limits">
        {lines.map((t) => <li key={t.en}><Tx text={t} /></li>)}
      </ul>
      {fit.split !== null && fit.tuningChip !== null ? (
        <p className="ev-chart__metric" data-split>
          <Tx text={J.splitSizes} /> <EvNum chip={fit.tuningChip}>{fit.split.tuningN}</EvNum> <EvNum chip={fit.chip}>{fit.split.heldoutN}</EvNum>
          {fit.split.rule ? <span className="soft" data-ident>{fit.split.rule}</span> : null}
        </p>
      ) : null}
      {fit.latency !== null ? (
        <p className="ev-chart__metric" data-latency>
          <EvNum chip={fit.latency.chip}><span data-ident>p50</span> {ms(fit.latency.p50)} · <span data-ident>p95</span> {ms(fit.latency.p95)}{fit.latency.max === null ? "" : ` · max ${ms(fit.latency.max)}`}</EvNum>
        </p>
      ) : null}
      {fit.limits.length > 0 ? (
        <>
          <h4><Tx text={J.limitFile} /></h4>
          <ul className="ev-limits">{fit.limits.map((t) => <li key={t} data-ident>{t}</li>)}</ul>
        </>
      ) : null}
    </section>
  );
}
