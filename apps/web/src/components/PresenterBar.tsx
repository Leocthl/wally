// PresenterBar (docs/04, LEDGER; docs/06): step through DM1 to DM9, Reset, and the SIMULATED/REAL toggle.
// REAL stays disabled until a captured real decline exists (docs/06 SIMULATED / REAL toggle).
import type { ReactElement } from "react";
import type { RealCapture } from "../api/types";
import type { PresenterStep } from "../booth/presenterScript";
import { S } from "../i18n/strings";
import { Bi } from "./Bi";

export type Mode = "SIMULATED" | "REAL";

export interface PresenterBarProps {
  /** Index of the next step to run; equals steps.length at the end of the script. */
  readonly index: number;
  readonly steps: readonly PresenterStep[];
  readonly mode: Mode;
  readonly realCapture: RealCapture | null;
  readonly busy: boolean;
  readonly onStep: () => void;
  readonly onSkip: () => void;
  readonly onReset: () => void;
  readonly onMode: (mode: Mode) => void;
}

export function PresenterBar({ index, steps, mode, realCapture, busy, onStep, onSkip, onReset, onMode }: PresenterBarProps): ReactElement {
  const next = steps[index];
  const last = index >= steps.length;
  return (
    <nav className="presenter-bar" data-register="ledger" aria-label="Presenter controls">
      <div className="presenter-bar__where">
        <span className="presenter-bar__moment" data-ident>{last ? "END" : (next?.moment ?? "")}</span>
        <span className="presenter-bar__title">{last ? <Bi text={S.presenterDone} /> : next ? <Bi text={next.title} /> : null}</span>
      </div>
      <div className="presenter-bar__actions">
        <button type="button" className="btn btn--primary tap" onClick={onStep} disabled={busy || last}><Bi text={S.presenterStep} /></button>
        {next?.optional ? <button type="button" className="btn tap" onClick={onSkip} disabled={busy}>Skip</button> : null}
        <button type="button" className="btn tap" onClick={onReset} disabled={busy}><Bi text={S.presenterReset} /></button>
      </div>
      <fieldset className="presenter-bar__mode">
        <legend className="sr-only"><Bi text={S.presenterMode} /></legend>
        <label className="presenter-bar__radio tap">
          <input type="radio" name="mode" checked={mode === "SIMULATED"} onChange={() => onMode("SIMULATED")} />
          <span><Bi text={S.modeSimulated} /></span>
        </label>
        <label className="presenter-bar__radio tap" aria-disabled={realCapture === null}>
          <input type="radio" name="mode" checked={mode === "REAL"} disabled={realCapture === null} onChange={() => onMode("REAL")} />
          <span>
            <Bi text={S.modeReal} />
            {realCapture === null ? <span className="soft presenter-bar__off"> <Bi text={S.modeRealOff} /></span> : null}
          </span>
        </label>
      </fieldset>
    </nav>
  );
}
