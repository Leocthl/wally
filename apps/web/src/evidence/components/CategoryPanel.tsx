// Per category: scenarios, legitimate controls, and per-baseline completed and false-block k/n. Collapsed by default.
// Below it, every legitimate scenario B2 did not complete, with the rule and the gate, so a judge can check false blocks.
import type { ReactElement } from "react";
import { Tx } from "./Tx";
import { E } from "../strings";
import { BASELINES, type BlockedScenario, type CategoryCell, type HarnessRun, type Rate } from "../types";
import { EvNum, EvScope } from "./EvNum";

const kn = (r: Rate | null): ReactElement | null => (r === null ? null : <EvNum chip={r.chip}>{`${r.k}/${r.n}`}</EvNum>);

function Cell({ cell, col }: { readonly cell: CategoryCell | undefined; readonly col: string }): ReactElement {
  if (cell === undefined) return <td data-col={col}><Tx text={E.notInFile} className="soft" /></td>;
  return (
    <td data-col={col}>
      <span className="ev-cell"><Tx text={E.catDone} /> {kn(cell.completed)}</span>
      <span className="ev-cell"><Tx text={E.catBlocked} /> {kn(cell.falseBlock)}</span>
    </td>
  );
}

function CategoryTable({ run }: { readonly run: HarnessRun }): ReactElement {
  const rows = run.categories ?? [];
  if (rows.length === 0) return <Tx as="p" text={E.catEmpty} />;
  const chips = rows.flatMap((r) => BASELINES.flatMap((b) => [r.cells[b]?.completed?.chip, r.cells[b]?.falseBlock?.chip].flatMap((c) => (c ? [c] : []))));
  return (
    <EvScope chips={chips}>
      <div className="ev-panel__scroll">
        <table>
          <thead>
            <tr>
              <th scope="col"><Tx text={E.catCategory} /></th>
              <th scope="col"><Tx text={E.catScenarios} /></th>
              {BASELINES.map((b) => <th key={b} scope="col" data-ident>{b}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const any = row.cells.B2 ?? row.cells.B0 ?? row.cells.B1;
              const chip = any?.completed?.chip ?? null;
              return (
                <tr key={row.category} data-category={row.category}>
                  <th scope="row"><code data-ident>{row.category}</code></th>
                  <td data-col={E.catScenarios.en}>{any ? <EvNum chip={chip}>{`${any.scenarios}, ${any.legitimate}`}</EvNum> : null}</td>
                  {BASELINES.map((b) => <Cell key={b} col={b} cell={row.cells[b]} />)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </EvScope>
  );
}

function gateOf(s: BlockedScenario): typeof E.gateJudge {
  if (s.error !== null) return E.gateError;
  if (s.rule?.startsWith("R10")) return E.gateJudge;
  if (s.decision === "APPROVE" || s.rule?.startsWith("R12")) return E.gateRail;
  return E.gateEngine;
}

function BlockedList({ run }: { readonly run: HarnessRun }): ReactElement {
  if (run.b2Blocked === null) return <Tx as="p" text={E.blockedNoRows} />;
  if (run.b2Blocked.length === 0) return <Tx as="p" text={E.blockedNone} />;
  return (
    <div className="ev-panel__scroll">
      <table data-blocked-list>
        <thead>
          <tr>
            <th scope="col"><Tx text={E.blockedScenario} /></th>
            <th scope="col"><Tx text={E.blockedOutcome} /></th>
            <th scope="col"><Tx text={E.blockedGate} /></th>
          </tr>
        </thead>
        <tbody>
          {run.b2Blocked.map((s) => (
            <tr key={s.id} data-scenario-id={s.id}>
              <th scope="row"><code data-ident>{s.id}</code> <span className="soft" data-ident>{s.variant}</span></th>
              <td data-col={E.blockedOutcome.en}><span data-ident>{s.decision}{s.rule ? ` ${s.rule}` : ""}</span></td>
              <td data-col={E.blockedGate.en}><Tx text={gateOf(s)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CategoryPanel({ run }: { readonly run: HarnessRun }): ReactElement {
  const blocked = run.b2Blocked;
  const chip = run.baselines.B2?.rates["false_block_rate"]?.chip ?? null;
  return (
    <section className="ev-panel" aria-labelledby="ev-cat-title">
      <details className="disclosure" data-panel="categories">
        <summary id="ev-cat-title"><Tx text={E.categoriesTitle} /></summary>
        <CategoryTable run={run} />
      </details>
      <details className="disclosure" data-panel="blocked">
        <summary>
          <Tx text={E.blockedTitle} />
          {blocked !== null && blocked.length > 0 && chip !== null ? <>&nbsp;<EvNum chip={chip}>{blocked.length}</EvNum></> : null}
        </summary>
        <BlockedList run={run} />
      </details>
    </section>
  );
}
