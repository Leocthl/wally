// The bottom line of the chosen run in words, before any chart: for each headline rate, how the full pipeline (B2)
// compares with the model-only gate (B0), and whether each acceptance target was met. No new figure: every word comes
// from the same comparisons the cards below compute (compareToB2, acceptanceGap), worse stated as plainly as better.
import type { ReactElement } from "react";
import { UI } from "../../i18n/ui";
import { Card } from "../../ui/Surface";
import { specOf } from "../metrics";
import { acceptanceGap, compareToB2 } from "../select";
import { E } from "../strings";
import type { HarnessRun } from "../types";
import { HEADLINE_KEYS } from "./BigNumbers";
import { MarkEqual, MarkHigher, MarkLower, MarkMiss, MarkNone, MarkPass } from "./marks";
import { Misses } from "./Misses";
import { Tx } from "./Tx";

const EU = UI.evidenceUi;
const MARK = { lower: MarkLower, higher: MarkHigher, equal: MarkEqual, none: MarkNone } as const;

function Line({ metric, run }: { readonly metric: string; readonly run: HarnessRun }): ReactElement {
  const spec = specOf(metric);
  const cmp = compareToB2(run.baselines.B2?.rates[metric] ?? null, run.baselines.B0?.rates[metric] ?? null);
  const good = cmp.kind === (spec.lowerIsBetter ? "lower" : "higher");
  const bad = cmp.kind === (spec.lowerIsBetter ? "higher" : "lower");
  const verdict = good ? E.better : bad ? E.worse : cmp.kind === "equal" ? E.same : E.noCompare;
  const Mark = MARK[cmp.kind];
  return (
    <li className="ev-headline__line" data-headline={metric} data-verdict={good ? "better" : bad ? "worse" : cmp.kind === "equal" ? "same" : "none"}>
      <span className="ev-headline__mark"><Mark /></span>
      <span className="ev-headline__text">
        <Tx text={spec.title} className="ev-headline__metric" />
        <Tx text={verdict} as="strong" className="ev-headline__verdict" />
        {cmp.overlap && cmp.kind !== "equal" ? <Tx text={E.overlap} className="ev-headline__note" /> : null}
      </span>
    </li>
  );
}

export function Headline({ run }: { readonly run: HarnessRun }): ReactElement {
  const acceptance = run.acceptance ?? [];
  return (
    <Card as="section" className="ev-headline" aria-labelledby="ev-headline-title" data-headline-card>
      <h2 id="ev-headline-title" className="ev-headline__title"><Tx text={EU.headlineTitle} /></h2>
      <ul className="ev-headline__lines">
        {HEADLINE_KEYS.map((m) => <Line key={m} metric={m} run={run} />)}
      </ul>
      <Misses run={run} />
      {acceptance.length > 0 ? (
        <ul className="ev-headline__targets" aria-label={EU.acceptanceShort.en}>
          {acceptance.map((row) => {
            const gap = acceptanceGap(row);
            const met = gap.known ? gap.met && row.pass : row.pass;
            return (
              <li key={row.id} className={`ev-headline__target ev-headline__target--${met ? "met" : "missed"}`} data-target={row.id}>
                {met ? <MarkPass /> : <MarkMiss />} <span data-ident>{row.id}</span> <Tx text={met ? E.met : E.missed} />
              </li>
            );
          })}
        </ul>
      ) : null}
      <Tx as="p" text={EU.headlineNote} className="ev-headline__foot" />
    </Card>
  );
}
