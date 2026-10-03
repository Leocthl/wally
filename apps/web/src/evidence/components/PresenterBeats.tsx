// Presenter beats DM8 and DM9 (docs/06: DM8 about twenty seconds, DM9 to the end of the five minutes). DM8 is the
// compact big-number view of the default run with the wiring banner and T-H1/T-H2; #/evidence is the deeper view.
import type { ReactElement } from "react";
import { Tx } from "./Tx";
import { useDisplayMode } from "../../state/displayMode";
import { loadHarnessRuns, type Loaded } from "../data";
import { DM8, DM9 } from "../dm9";
import { pickRun, wiringStatus } from "../select";
import { E } from "../strings";
import type { HarnessRun } from "../types";
import { AcceptanceStrip } from "./AcceptanceStrip";
import { BigNumbers } from "./BigNumbers";
import { PlainStage } from "./plain/PlainStage";
import "../evidence.css";
import "../plain.css";

const BUNDLED = loadHarnessRuns();

export function Dm8View({ harness = BUNDLED }: { readonly harness?: Loaded<HarnessRun> }): ReactElement {
  const [mode] = useDisplayMode();
  const pick = pickRun(harness.items);
  const run = harness.items.find((r) => r.file === pick?.file) ?? null;
  if (mode === "plain") return <PlainStage run={run} />;
  if (run === null) return <div className="ev ev--stage" data-beat="DM8"><Tx as="p" text={E.unreadableNone} className="ev-unreadable" /></div>;
  const status = wiringStatus(run);
  return (
    <div className="ev ev--stage" data-beat="DM8">
      {status.wiringOnly ? (
        <section className="ev-wiring" aria-labelledby="ev-dm8-wiring" data-wiring-banner>
          <h3 id="ev-dm8-wiring" className="ev-wiring__title"><Tx text={E.wiringTitle} /></h3>
          <Tx as="p" text={status.componentsConfirmed ? E.wiringBody : E.wiringUnconfirmed} />
        </section>
      ) : null}
      <h2 className="ev__title"><Tx text={DM8.title} /></h2>
      <BigNumbers run={run} wiring={status.wiringOnly} stage />
      <AcceptanceStrip rows={run.acceptance} />
      <p className="soft ev-note">
        <code data-ident>{run.file}</code> <Tx text={DM8.deeper} /> <a className="tap ev-link" href="#/evidence"><Tx text={DM8.openFull} /></a>
      </p>
    </div>
  );
}

export function Dm9Card(): ReactElement {
  return (
    <div className="ev ev--stage" data-beat="DM9">
      <div className="ev-dm9">
        {DM9.map((col) => (
          <section key={col.id} className="ev-dm9__col" aria-labelledby={`ev-dm9-${col.id}`} data-dm9={col.id}>
            <h2 id={`ev-dm9-${col.id}`} className="ev-dm9__title"><Tx text={col.title} /></h2>
            <ul className="ev-dm9__lines">
              {col.lines.map((l) => <li key={l.en}><Tx text={l} /></li>)}
            </ul>
            <Tx as="p" text={col.foot} className="ev-dm9__foot" />
          </section>
        ))}
      </div>
    </div>
  );
}
