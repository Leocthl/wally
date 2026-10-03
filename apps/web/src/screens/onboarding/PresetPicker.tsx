// The amount presets as a radio group: HK$300, 500, 800, 1,200 and Custom. One tab stop, arrows move (and wrap), Home and
// End jump. The amounts are SIMULATED figures; the picker's surface carries the one SIMULATED chip (BudgetPicker).
import { useRef, type KeyboardEvent, type ReactElement } from "react";
import { OB } from "../../i18n/onboarding";
import { SIMULATED } from "../../domain/provenance";
import { nextIndex } from "../../ui/hooks/useRoving";
import { haptic } from "../../ui/haptics";
import { useLocale } from "../../ui/locale";
import { Money } from "../../shell/figures";
import { PRESETS_HKD, type Preset } from "./budgetModel";

export type PresetValue = Preset | "custom";
const OPTIONS: readonly PresetValue[] = [...PRESETS_HKD, "custom"];
const MINOR_PER_HKD = 100;

export interface PresetPickerProps {
  readonly value: PresetValue;
  readonly onChange: (next: PresetValue) => void;
  /** The id of the heading that names the group. */
  readonly labelledBy: string;
}

export function PresetPicker({ value, onChange, labelledBy }: PresetPickerProps): ReactElement {
  const { t } = useLocale();
  const group = useRef<HTMLDivElement>(null);
  const index = Math.max(0, OPTIONS.indexOf(value));
  const choose = (next: PresetValue): void => {
    haptic("tap");
    onChange(next);
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>): void => {
    // The presets sit in a grid: left and right go along it, up and down go the same way.
    const key = e.key === "ArrowDown" ? "ArrowRight" : e.key === "ArrowUp" ? "ArrowLeft" : e.key;
    const next = nextIndex(key, index, OPTIONS.length);
    const option = next === null ? undefined : OPTIONS[next];
    if (option === undefined || next === null) return;
    e.preventDefault();
    choose(option);
    group.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  };
  return (
    <div ref={group} className="onb-presets" role="radiogroup" aria-labelledby={labelledBy}>
      {OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={option === value}
          tabIndex={option === value ? 0 : -1}
          className="onb-preset"
          data-preset={option}
          onClick={() => choose(option)}
          onKeyDown={onKey}
        >
          {option === "custom" ? t(OB.budget.custom) : <Money minor={option * MINOR_PER_HKD} prov={SIMULATED} />}
        </button>
      ))}
    </div>
  );
}
