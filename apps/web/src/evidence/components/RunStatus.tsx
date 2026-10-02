// Run header pieces: the wiring banner with the component list, the run picker with the reason for the choice, and the
// "could not be read" panel. A file that says it is not product evidence is never shown as if it were.
import type { ReactElement } from "react";
import { Bi } from "../../components/Bi";
import type { Unreadable } from "../data";
import { MarkMiss, MarkNone, MarkPass } from "./marks";
import type { PickReason, WiringStatus } from "../select";
import { E } from "../strings";
import type { ComponentInfo, HarnessRun } from "../types";

export function ComponentList({ components }: { readonly components: readonly ComponentInfo[] | null }): ReactElement {
  if (components === null || components.length === 0) return <Bi as="p" text={E.wiringUnconfirmed} />;
  return (
    <ul className="ev-components" aria-label={E.componentsTitle.en}>
      {components.map((c) => (
        <li key={c.key} data-component={c.key} data-real={String(c.real)}>
          <span className={`ev-tag ev-tag--${c.real === true ? "real" : c.real === false ? "standin" : "unknown"}`}>
            {c.real === true ? <MarkPass /> : c.real === false ? <MarkMiss /> : <MarkNone />}
            <Bi text={c.real === true ? E.componentReal : c.real === false ? E.componentStandIn : E.componentUnknown} />
          </span>{" "}
          <code data-ident>{c.key}</code> <span data-ident className="soft">{c.name}</span>
          {c.note ? <span className="ev-components__note soft" data-ident>{c.note}</span> : null}
        </li>
      ))}
    </ul>
  );
}

export function WiringBanner({ status, run }: { readonly status: WiringStatus; readonly run: HarnessRun }): ReactElement | null {
  if (!status.wiringOnly) return null;
  return (
    <section className="ev-wiring" aria-labelledby="ev-wiring-title" data-wiring-banner>
      <h3 id="ev-wiring-title" className="ev-wiring__title"><Bi text={E.wiringTitle} /></h3>
      <Bi as="p" text={E.wiringBody} />
      {status.componentsConfirmed ? null : <Bi as="p" text={E.wiringUnconfirmed} />}
      <details className="disclosure ev-wiring__components">
        <summary><Bi text={E.componentsTitle} /></summary>
        {status.reasons.length > 0 ? (
          <ul className="ev-wiring__reasons">
            {status.reasons.map((r) => <li key={r} data-ident>{r}</li>)}
          </ul>
        ) : null}
        <ComponentList components={run.components} />
      </details>
    </section>
  );
}

const REASON = { "live-all-real": E.whyLiveReal, "newest-live": E.whyNewestLive, "newest-recorded": E.whyNewestRecorded } as const;

export interface PickerProps {
  readonly runs: readonly HarnessRun[];
  readonly selected: HarnessRun;
  readonly reason: PickReason | "visitor";
  readonly onSelect: (file: string) => void;
}

export function RunPicker({ runs, selected, reason, onSelect }: PickerProps): ReactElement {
  return (
    <div className="ev-picker">
      <label className="ev-picker__label">
        <Bi text={E.pickLabel} />
        <select value={selected.file} onChange={(e) => onSelect(e.currentTarget.value)}>
          {runs.map((r) => <option key={r.file} value={r.file}>{`${r.file} (${r.mode})`}</option>)}
        </select>
      </label>
      <p className="ev-picker__why" data-pick-reason={reason}>
        <span>Showing <code data-ident>{selected.file}</code>:</span> <Bi text={reason === "visitor" ? E.whyChosen : REASON[reason]} />
      </p>
      <p className="ev-picker__run soft">
        <Bi text={selected.mode === "live" ? E.modeLive : E.modeRecorded} />{" "}
        <span data-ident>{selected.runAt}</span>
        {selected.seed !== null ? <> · seed <span data-ident>{selected.seed}</span></> : null}
        {selected.commit !== null ? <> · commit <span data-ident>{selected.commit.slice(0, 7)}</span></> : null}
      </p>
    </div>
  );
}

export function UnreadablePanel({ files }: { readonly files: readonly Unreadable[] }): ReactElement | null {
  if (files.length === 0) return null;
  return (
    <section className="ev-unreadable" aria-labelledby="ev-unreadable-title" data-unreadable>
      <h3 id="ev-unreadable-title"><Bi text={E.unreadableTitle} /></h3>
      <ul>
        {files.map((f) => (
          <li key={f.file}><code data-ident>{f.file}</code>: <span data-ident>{f.problems.join("; ")}</span></li>
        ))}
      </ul>
    </section>
  );
}
