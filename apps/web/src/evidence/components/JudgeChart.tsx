// Judge false-allow on the injection set. The file scores it on B2 only, so B0 and B1 get no bar and the page says so.
import type { ReactElement } from "react";
import { Tx } from "./Tx";
import { label } from "../../i18n/label";
import { E } from "../strings";
import type { HarnessRun } from "../types";
import { BarRow } from "./Bars";
import { EvNum, EvScope } from "./EvNum";
import { chartLabel, chipsOf, WiringStamp } from "./RateChart";

export function JudgeChart({ run, wiring }: { readonly run: HarnessRun; readonly wiring: boolean }): ReactElement | null {
  const j = run.judgeFalseAllow;
  if (j === null) return null;
  const rows = [
    { ident: "R10", name: E.judgeR10, rate: j.falseAllow },
    { ident: "T_inj", name: E.judgeMirror, rate: j.atMirror?.falseAllow ?? null },
  ];
  const aria = chartLabel(E.judgeQuestion.en, rows.map((r) => ({ ident: r.ident, name: r.name.en, rate: r.rate })));
  return (
    <figure className="ev-chart" data-metric="judge_false_allow">
      <figcaption className="ev-chart__head">
        <WiringStamp on={wiring} />
        <h3 className="ev-chart__q"><Tx text={E.judgeQuestion} /></h3>
        <p className="ev-chart__metric soft"><code data-ident>judge_false_allow</code> <Tx text={label("Judge false-allow, B2", "判斷器誤放，B2")} /></p>{/* NEEDS-REVIEW zh-HK */}
      </figcaption>
      <EvScope chips={chipsOf(rows.map((r) => r.rate))}>
        <div className="ev-bars" role="img" aria-label={aria}>
          {rows.map((r) => <BarRow key={r.ident} ident={r.ident} name={r.name} rate={r.rate} tone="B2" />)}
        </div>
      </EvScope>
      <Tx as="p" text={E.judgeOnlyB2} className="ev-chart__note soft" />
      {j.notEvaluated !== null && j.notEvaluated > 0 ? (
        <p className="ev-chart__note soft">
          <EvNum chip={j.falseAllow?.chip ?? j.atMirror?.falseAllow?.chip ?? null}>{j.notEvaluated}</EvNum> <Tx text={E.notEvaluated} />
        </p>
      ) : null}
    </figure>
  );
}
