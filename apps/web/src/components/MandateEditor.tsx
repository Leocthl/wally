// MandateEditor (docs/04, PACKET): the sentence beside editable compiled rule chips, and Seal. Seal is disabled while any
// chip is invalid. The chips are what the engine enforces; the sentence is for reading (docs/06 DM1 talker line).
import { useId, type ReactElement } from "react";
import { ChopSeal } from "./icons";
import type { RuleChip } from "../booth/compile";
import { S } from "../i18n/strings";
import { Bi } from "./Bi";
import { ChipEditor } from "./ChipEditor";

export interface MandateEditorProps {
  readonly value: string;
  readonly compiled: readonly RuleChip[];
  readonly onValueChange: (value: string) => void;
  readonly onChipChange: (next: RuleChip) => void;
  readonly onSeal: () => void;
  readonly sealing?: boolean;
  readonly sealed?: boolean;
  /** Bumped when the sentence is recompiled, so the chip controls restart from the new values. */
  readonly chipsVersion?: number;
}

export function MandateEditor({ value, compiled, onValueChange, onChipChange, onSeal, sealing = false, sealed = false, chipsVersion = 0 }: MandateEditorProps): ReactElement {
  const areaId = useId();
  const blockedId = useId();
  const invalid = compiled.some((c) => !c.valid);
  return (
    <section className="mandate-editor" data-register="packet" aria-label="Mandate editor">
      <div className="mandate-editor__sentence">
        <label htmlFor={areaId} className="mandate-editor__label"><Bi text={S.sentenceLabel} /></label>
        <textarea id={areaId} rows={4} value={value} maxLength={280} onChange={(e) => onValueChange(e.target.value)} />
        <Bi as="p" text={S.sealHint} className="soft" />
      </div>
      <div className="mandate-editor__chips">
        <h3><Bi text={S.chipsLabel} /></h3>
        <ul className="chip-list">
          {compiled.map((chip) => (
            <ChipEditor key={`${chip.kind}-${chipsVersion}`} chip={chip} onChange={onChipChange} />
          ))}
        </ul>
      </div>
      <div className="mandate-editor__seal">
        <button type="button" className="btn btn--primary btn--seal tap" onClick={onSeal} disabled={invalid || sealing || sealed} aria-describedby={invalid ? blockedId : undefined} data-sealed={sealed}>
          <Bi text={sealed ? S.sealed : S.sealButton} />
        </button>
        {sealed ? <ChopSeal className="chop--stamped" /> : null}
        {invalid ? <Bi as="p" text={S.sealBlocked} className="soft" /> : <Bi as="p" text={S.sealAgain} className="soft" />}
        <span id={blockedId} className="sr-only">{S.sealBlocked.en}</span>
      </div>
    </section>
  );
}
