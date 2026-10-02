// Judge panel tables: before/after on the same held-out cases, per gate, the six demo listings, every wording variant.
// All counts are k/n with an interval computed here; a table never drops a row the file carries.
import type { ReactElement } from "react";
import { Tx } from "./Tx";
import { ASSUMED_CHIP, type FileChip } from "../chip";
import { GATE_THRESHOLD, type Approvals, type Count, type JudgeFit, type ThresholdRun } from "../judgeFit";
import { J } from "../judgeStrings";
import { formatInterval, formatPct } from "../stats";
import { EvNum, EvScope } from "./EvNum";

/** "35/47 · 74.5% · CI 60.5 to 84.7%"; "0/0" alone when there is no denominator. */
export function countText(c: Count): string {
  const pct = formatPct(c.k, c.n);
  return pct === null ? `${c.k}/${c.n}` : `${c.k}/${c.n} · ${pct} · CI ${formatInterval(c.k, c.n) ?? ""}`;
}

/** A fitted threshold carries the tuning-split chip; one kept at its register value (or any v1 value) stays ASSUMED. */
export function fittedChip(fit: JudgeFit, name: string): FileChip {
  return fit.tuningChip !== null && name !== "" && !fit.unfitted.includes(name) ? fit.tuningChip : ASSUMED_CHIP;
}

const cell = (c: Count | null, chip: FileChip, col: string): ReactElement => (
  <td key={col} data-col={col}>{c === null ? <span className="soft">-</span> : <EvNum chip={chip}>{countText(c)}</EvNum>}</td>
);

const ROWS: readonly { readonly key: keyof Approvals; readonly name: typeof J.legitApproved; readonly higher: boolean }[] = [
  { key: "legit", name: J.legitApproved, higher: true },
  { key: "injected", name: J.injectedApproved, higher: false },
  { key: "highRisk", name: J.highRiskApproved, higher: false },
  { key: "outOfScope", name: J.outOfScopeApproved, higher: false },
];

function ThresholdRows({ fit }: { readonly fit: JudgeFit }): ReactElement {
  const after = fit.evaluated.thresholds;
  const before = fit.baseline?.thresholds ?? null;
  const names = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after)])];
  return (
    <>
      {names.map((name) => (
        <tr key={name} data-threshold={name}>
          <th scope="row"><Tx text={J.thresholds} /> <code data-ident>{name}</code></th>
          <td data-col={J.betterWhen.en}><span className="soft">-</span></td>
          {before === null ? null : <td data-col={J.before.en}>{before[name] === undefined ? "-" : <EvNum chip={ASSUMED_CHIP}>{before[name].toFixed(2)}</EvNum>}</td>}
          <td data-col={(before === null ? J.inForce : J.fitted).en}>{after[name] === undefined ? "-" : <EvNum chip={fittedChip(fit, name)}>{after[name].toFixed(2)}</EvNum>}</td>
        </tr>
      ))}
    </>
  );
}

export function BeforeAfter({ fit }: { readonly fit: JudgeFit }): ReactElement {
  const runs: readonly ThresholdRun[] = fit.baseline === null ? [fit.evaluated] : [fit.baseline, fit.evaluated];
  const heads = fit.baseline === null ? [J.inForce] : [J.before, J.fitted];
  return (
    <section aria-labelledby="ev-judge-ba">
      <h4 id="ev-judge-ba"><Tx text={fit.baseline === null ? J.inForceTitle : J.beforeAfterTitle} /></h4>
      <div className="ev-panel__scroll">
        <table data-before-after>
          <thead><tr><th scope="col"><Tx text={J.measure} /></th><th scope="col"><Tx text={J.betterWhen} /></th>{heads.map((h) => <th key={h.en} scope="col"><Tx text={h} /></th>)}</tr></thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.key} data-measure={row.key}>
                <th scope="row"><Tx text={row.name} /></th>
                <td data-col={J.betterWhen.en}><Tx text={row.higher ? J.higher : J.lower} /></td>
                {runs.map((run, i) => <td key={i} data-col={heads[i]?.en ?? ""}>{run.approvals[row.key] === null ? <span className="soft">-</span> : <EvNum chip={fit.chip}>{countText(run.approvals[row.key] as Count)}</EvNum>}</td>)}
              </tr>
            ))}
            <ThresholdRows fit={fit} />
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function Gates({ fit }: { readonly fit: JudgeFit }): ReactElement {
  return (
    <div className="ev-panel__scroll">
      <table data-gates>
        <thead><tr><th scope="col"><Tx text={J.gate} /></th><th scope="col"><Tx text={J.threshold} /></th><th scope="col"><Tx text={J.falseBlock} /></th><th scope="col"><Tx text={J.recall} /></th></tr></thead>
        <tbody>
          {fit.evaluated.gates.map((g) => (
            <tr key={g.id} data-gate={g.id}>
              <th scope="row"><code data-ident>{g.id}</code></th>
              <td data-col={J.threshold.en}>{g.threshold === null ? "-" : <EvNum chip={fittedChip(fit, GATE_THRESHOLD[g.id] ?? "")}>{g.threshold.toFixed(2)}</EvNum>}</td>
              {cell(g.falseBlock, fit.chip, J.falseBlock.en)}
              {cell(g.recall, fit.chip, J.recall.en)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const outcome = (v: string | null | undefined): ReactElement => (v == null ? <span className="soft">-</span> : v === "pass" ? <Tx text={J.verdictPass} /> : <strong data-ident>{v}</strong>);

export function Listings({ fit }: { readonly fit: JudgeFit }): ReactElement {
  const questions = ["scope", "injection", "seller", "escalate"];
  const perQuestion = (v: Readonly<Record<string, string>>): ReactElement => <>{questions.map((q) => <span key={q} className="ev-cell"><code data-ident>{q}</code> {outcome(v[q])}</span>)}</>;
  return (
    <div className="ev-panel__scroll">
      <table data-listings>
        <thead><tr><th scope="col"><Tx text={J.listing} /></th><th scope="col"><Tx text={J.live} /></th><th scope="col"><Tx text={J.recorded} /></th></tr></thead>
        <tbody>
          {fit.listings.map((l) => (
            <tr key={l.name} data-listing={l.name}>
              <th scope="row"><code data-ident>{l.name}</code> <span className="soft" data-ident>{l.note}</span></th>
              <td data-col={J.live.en}>{l.liveOutcome !== null ? outcome(l.liveOutcome) : perQuestion(l.live)}</td>
              <td data-col={J.recorded.en}>{l.recordedOutcome !== null ? outcome(l.recordedOutcome) : perQuestion(l.recorded)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Variants({ fit, heading = true }: { readonly fit: JudgeFit; readonly heading?: boolean }): ReactElement | null {
  const chip = fit.tuningChip;
  if (fit.variants.length === 0 || chip === null) return null;
  const heads = [J.variant, J.rank, J.idea, J.okCalls, J.legitApproved, J.injectedApproved, J.highRiskApproved, J.outOfScopeApproved, J.meanAuc];
  return (
    <section aria-label={J.variantsTitle.en}>
      {heading ? <h4 className="ev-subtitle"><Tx text={J.variantsTitle} /></h4> : null}
      <Tx as="p" text={J.variantsNote} className="soft ev-note" />
      <EvScope chips={[chip]}>
        <div className="ev-panel__scroll">
          <table data-variants>
            <thead><tr>{heads.map((h) => <th key={h.en} scope="col"><Tx text={h} /></th>)}</tr></thead>
            <tbody>
              {fit.variants.map((v) => (
                <tr key={v.id} data-variant={v.id} data-chosen={v.chosen}>
                  <th scope="row"><code data-ident>{v.id}</code>{v.chosen ? <> <strong className="ev-tag"><Tx text={J.chosen} /></strong></> : null}</th>
                  <td data-col={J.rank.en}>{v.rank === null ? "-" : <EvNum chip={chip}>{v.rank}</EvNum>}</td>
                  <td data-col={J.idea.en}><span data-ident>{v.idea}</span></td>
                  {cell(v.okCalls, chip, J.okCalls.en)}
                  {ROWS.map((row) => cell(v.approvals?.[row.key] ?? null, chip, row.name.en))}
                  <td data-col={J.meanAuc.en}>{v.meanAuc === null ? "-" : <EvNum chip={chip}>{v.meanAuc.toFixed(2)}</EvNum>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </EvScope>
    </section>
  );
}
