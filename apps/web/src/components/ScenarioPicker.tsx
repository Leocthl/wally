// ScenarioPicker (docs/06 booth): preset buttons, the free-text box "Try to trick the agent", and Reset.
import { useId, useState, type FormEvent, type ReactElement } from "react";
import type { ScenarioId } from "../api/types";
import { GROUP_ORDER, GROUP_TITLES, LISTING_TEXT_HARD_CAP, PICKER } from "../booth/scenarios";
import { S } from "../i18n/strings";
import { Bi } from "./Bi";

export interface ScenarioPickerProps {
  readonly onScenario: (id: ScenarioId) => void;
  readonly onPropose: (listingText: string) => void;
  readonly onReset: () => void;
  readonly busy: boolean;
  /** Mock mode: say that a keyword stand-in reads typed text, not Laya. */
  readonly standIn: boolean;
}

export function ScenarioPicker({ onScenario, onPropose, onReset, busy, standIn }: ScenarioPickerProps): ReactElement {
  const [text, setText] = useState("");
  const areaId = useId();
  const hintId = useId();
  const trimmed = text.trim();

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (trimmed.length === 0 || busy) return;
    onPropose(trimmed.slice(0, LISTING_TEXT_HARD_CAP));
  };

  return (
    <section className="picker" data-register="packet" aria-labelledby="picker-title">
      <h2 id="picker-title"><Bi text={S.scenariosTitle} /></h2>
      {GROUP_ORDER.map((group) => (
        <div className="picker__group" key={group} role="group" aria-label={GROUP_TITLES[group].en}>
          <h3 className="picker__group-title"><Bi text={GROUP_TITLES[group]} /></h3>
          <div className="picker__buttons">
            {PICKER.filter((p) => p.group === group).map((p) => (
              <button key={p.id} type="button" className="btn tap picker__button" data-scenario={p.id} disabled={busy} onClick={() => onScenario(p.id)}>
                <span className="picker__label"><Bi text={p.label} /></span>
                <span className="picker__hint soft"><Bi text={p.hint} /></span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <form className="picker__trick" onSubmit={submit}>
        <label htmlFor={areaId}><h3><Bi text={S.trickTitle} /></h3></label>
        <p id={hintId} className="soft"><Bi text={S.trickHint} /></p>
        {standIn ? <p className="soft picker__standin"><Bi text={S.trickStandIn} /></p> : null}
        <textarea id={areaId} rows={4} value={text} aria-describedby={hintId} maxLength={LISTING_TEXT_HARD_CAP} onChange={(e) => setText(e.target.value)} spellCheck={false} />
        <div className="picker__row">
          <button type="submit" className="btn btn--primary tap" disabled={busy || trimmed.length === 0}><Bi text={S.trickSend} /></button>
          <button type="button" className="btn tap" onClick={onReset} disabled={busy}><Bi text={S.reset} /></button>
        </div>
      </form>
    </section>
  );
}
