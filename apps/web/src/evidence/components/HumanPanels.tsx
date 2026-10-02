// E3 manual-route stopwatch and E5 OBSERVED captures, from data/evidence. Empty templates read "pending: not captured
// yet" with no figure; rows appear as soon as the files hold them, each with its own OBSERVED or SIMULATED chip.
import type { ReactElement } from "react";
import { Tx } from "./Tx";
import { formatHkDateTime } from "../../domain/time";
import { measuredChip, SIMULATED_CHIP, type FileChip } from "../chip";
import { meetsSample, spread, type Captures, type ManualRoute, type Route, type RouteRun } from "../humanGuard";
import { H } from "../humanStrings";
import type { Parsed } from "../types";
import { EvNum } from "./EvNum";

export const observedChip = (at: string, source: string): FileChip => ({ kind: "OBSERVED", text: `OBSERVED(${formatHkDateTime(at)} UTC+8, ${source})` });

const secs = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(1));

function Pending({ text = H.pending }: { readonly text?: typeof H.pending }): ReactElement {
  return <p className="ev-pending" data-pending><Tx text={text} /></p>;
}

function Value({ v, chip }: { readonly v: number | null; readonly chip: FileChip }): ReactElement {
  return v === null ? <Tx text={H.noValue} className="soft" /> : <EvNum chip={chip}>{secs(v)}</EvNum>;
}

function runChip(r: RouteRun): FileChip {
  return r.tag === "OBSERVED" ? observedChip(r.at, `run ${r.id} by ${r.runner}`) : SIMULATED_CHIP;
}

/** Median and range over OBSERVED values; SIMULATED whenever any value in the column came from a SIMULATED step. */
function Summary({ runs, pick, tagOf }: { readonly runs: readonly RouteRun[]; readonly pick: (r: RouteRun) => number | null; readonly tagOf: (r: RouteRun) => string }): ReactElement {
  const used = runs.filter((r) => r.tag === "OBSERVED" && pick(r) !== null);
  const s = spread(used.map((r) => pick(r) as number));
  if (s === null) return <Tx text={H.noValue} className="soft" />;
  const chip = used.some((r) => tagOf(r) === "SIMULATED") ? SIMULATED_CHIP : measuredChip(s.n);
  return <EvNum chip={chip}>{`${secs(s.median)} (${secs(s.min)} to ${secs(s.max)})`}</EvNum>;
}

function RouteBlock({ route }: { readonly route: Route }): ReactElement {
  return (
    <section className="ev-route" data-route-id={route.id} aria-label={`Route ${route.id}`}>
      <h4><span data-ident>{route.id}</span> <span data-ident className="soft">{route.label}</span></h4>
      {route.runs.length === 0 ? <Pending /> : (
        <>
          <Tx as="p" text={meetsSample(route) ? H.sampleMet : H.belowSample} className="ev-acc__short" />
          <div className="ev-panel__scroll">
            <table>
              <thead><tr><th scope="col"><Tx text={H.run} /></th><th scope="col"><Tx text={H.steps} /></th><th scope="col"><Tx text={H.decide} /></th><th scope="col"><Tx text={H.issue} /></th></tr></thead>
              <tbody>
                {route.runs.map((r) => (
                  <tr key={r.id} data-run={r.id}>
                    <th scope="row"><code data-ident>{r.id}</code> <span data-ident className="soft">{r.runner}</span></th>
                    <td data-col={H.steps.en}>{r.steps === null ? <Tx text={H.noValue} className="soft" /> : <EvNum chip={runChip(r)}>{r.steps}</EvNum>}</td>
                    <td data-col={H.decide.en}><Value v={r.decideS} chip={runChip(r)} /></td>
                    <td data-col={H.issue.en}><Value v={r.issueS} chip={r.issueTag === "SIMULATED" ? SIMULATED_CHIP : runChip(r)} /></td>
                  </tr>
                ))}
                <tr data-summary>
                  <th scope="row"><Tx text={H.median} /></th>
                  <td data-col={H.steps.en}><Summary runs={route.runs} pick={(r) => r.steps} tagOf={(r) => r.tag} /></td>
                  <td data-col={H.decide.en}><Summary runs={route.runs} pick={(r) => r.decideS} tagOf={(r) => r.tag} /></td>
                  <td data-col={H.issue.en}><Summary runs={route.runs} pick={(r) => r.issueS} tagOf={(r) => r.issueTag} /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

export function ManualRoutePanel({ parsed }: { readonly parsed: Parsed<ManualRoute> | null }): ReactElement {
  return (
    <section className="ev-panel" aria-labelledby="ev-manual-title" data-manual-panel>
      <h3 id="ev-manual-title"><Tx text={H.manualTitle} /> <span data-ident>E3 [F80]</span></h3>
      <Tx as="p" text={H.manualIntro} className="soft" />
      {parsed === null ? <Pending /> : !parsed.ok ? <Pending text={H.unreadable} /> : parsed.value.routes.map((r) => <RouteBlock key={r.id} route={r} />)}
    </section>
  );
}

function Decline({ captures }: { readonly captures: Captures }): ReactElement {
  const d = captures.realDecline;
  if (d === null) return <Pending text={H.declinePending} />;
  const chip = observedChip(d.at, "data/real-card-test.md");
  return (
    <dl className="ev-facts" data-real-decline>
      <div><dt><Tx text={H.declineCode} /></dt><dd><EvNum chip={chip}><code>{d.code}</code></EvNum></dd></div>
      <div><dt><Tx text={H.declineMessage} /></dt><dd><EvNum chip={chip}><q>{d.message}</q></EvNum></dd></div>
      <div><dt><Tx text={H.declineWhere} /></dt><dd data-ident>{d.where}</dd></div>
      {d.secondsToDecline === null ? null : <div><dt><Tx text={H.declineSeconds} /></dt><dd><EvNum chip={measuredChip(1)}>{secs(d.secondsToDecline)}</EvNum></dd></div>}
      {d.redactedFile ? <div><dt><Tx text={H.redacted} /></dt><dd><code data-ident>{d.redactedFile}</code></dd></div> : null}
    </dl>
  );
}

export function CapturesPanel({ parsed }: { readonly parsed: Parsed<Captures> | null }): ReactElement {
  const value = parsed?.ok ? parsed.value : null;
  return (
    <section className="ev-panel" aria-labelledby="ev-captures-title" data-captures-panel>
      <h3 id="ev-captures-title"><Tx text={H.capturesTitle} /> <span data-ident>E5</span></h3>
      <Tx as="p" text={H.capturesIntro} className="soft" />
      {parsed !== null && !parsed.ok ? <Pending text={H.unreadable} /> : null}
      {value === null || value.captures.length === 0 ? (parsed === null || parsed.ok ? <Pending /> : null) : (
        <ul className="ev-captures">
          {value.captures.map((c) => (
            <li key={c.id} data-capture={c.id}>
              <code data-ident>{c.id}</code> <span data-ident>[{c.registerRow}]</span> <span data-ident>{c.what}</span>:{" "}
              <EvNum chip={observedChip(c.at, `${c.id} by ${c.by}`)}>{c.valueSeen}</EvNum>
              {c.redactedFile ? <> <code data-ident className="soft">{c.redactedFile}</code></> : null}
            </li>
          ))}
        </ul>
      )}
      <h4><Tx text={H.declineTitle} /></h4>
      {value === null ? <Pending text={H.declinePending} /> : <Decline captures={value} />}
    </section>
  );
}
