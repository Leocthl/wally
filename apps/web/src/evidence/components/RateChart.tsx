// One headline metric: the plain question first, then B0, B1, B2 in that order, then how B2 compares, worse or better.
import type { ReactElement } from "react";
import { Bi } from "../../components/Bi";
import { BASELINE_NAMES, type MetricSpec } from "../metrics";
import { compareToB2 } from "../select";
import { E } from "../strings";
import { BASELINES, type HarnessRun, type Rate } from "../types";
import { BarRow, rateWords, Verdict } from "./Bars";
import { EvScope } from "./EvNum";
import type { FileChip } from "../chip";

const SIM_NOTE = "Scenarios and rail SIMULATED.";

export function chipsOf(rates: readonly (Rate | null)[]): readonly FileChip[] {
  return rates.flatMap((r) => (r ? [r.chip] : []));
}

/** Text alternative: every bar's k/n, percentage and interval, the chips, and the SIMULATED inputs. */
export function chartLabel(question: string, rows: readonly { readonly ident: string; readonly name: string; readonly rate: Rate | null }[]): string {
  const parts = rows.map((r) => `${r.ident} ${r.name}: ${rateWords(r.rate)}`);
  const chips = [...new Set(chipsOf(rows.map((r) => r.rate)).map((c) => c.text))];
  return `${question} ${parts.join(". ")}. ${chips.join(", ")}. ${SIM_NOTE}`;
}

export function WiringStamp({ on }: { readonly on: boolean }): ReactElement | null {
  return on ? <p className="ev-stamp" data-wiring-stamp><Bi text={E.wiringStamp} /></p> : null;
}

export function RateChart({ spec, run, wiring }: { readonly spec: MetricSpec; readonly run: HarnessRun; readonly wiring: boolean }): ReactElement {
  const rate = (b: (typeof BASELINES)[number]): Rate | null => run.baselines[b]?.rates[spec.key] ?? null;
  const rows = BASELINES.map((b) => ({ ident: b, name: BASELINE_NAMES[b], rate: rate(b) }));
  const label = chartLabel(spec.question.en, rows.map((r) => ({ ...r, name: r.name.en })));
  return (
    <figure className="ev-chart" data-metric={spec.key}>
      <figcaption className="ev-chart__head">
        <WiringStamp on={wiring} />
        <h3 className="ev-chart__q"><Bi text={spec.question} /></h3>
        <p className="ev-chart__metric soft"><code data-ident>{spec.key}</code> <Bi text={spec.title} /></p>
      </figcaption>
      <EvScope chips={chipsOf(rows.map((r) => r.rate))}>
        <div className="ev-bars" role="img" aria-label={label}>
          {rows.map((r) => <BarRow key={r.ident} ident={r.ident} name={r.name} rate={r.rate} tone={r.ident} />)}
        </div>
      </EvScope>
      <ul className="ev-verdicts" aria-label={`B2 compared, ${spec.title.en}`}>
        <Verdict against="B0" cmp={compareToB2(rate("B2"), rate("B0"))} lowerIsBetter={spec.lowerIsBetter} />
        <Verdict against="B1" cmp={compareToB2(rate("B2"), rate("B1"))} lowerIsBetter={spec.lowerIsBetter} />
      </ul>
    </figure>
  );
}
