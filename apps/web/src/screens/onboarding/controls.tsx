// The small pickers of the first run. Every one is a real button with aria-pressed (a group of toggles), at least 44 px,
// and shows what is chosen with a tick or a fill as well as colour. Selections are returned as new arrays.
import { useId, type CSSProperties, type ReactElement } from "react";
import { Icon } from "../../ui/icons";
import { haptic } from "../../ui/haptics";
import { cx } from "../../ui/cx";
import { SWATCHES } from "./swatches";
import type { ColourId } from "../../state/taste";

export interface Option<Id extends string> {
  readonly id: Id;
  readonly label: string;
}

/** The options that are chosen once `id` is pressed: `id` flips, the others stay, and the order is always the options' own. */
export function nextSelection<Id extends string>(options: readonly Option<Id>[], selected: readonly string[], id: Id): readonly Id[] {
  return options.map((o) => o.id).filter((x) => (x === id ? !selected.includes(x) : selected.includes(x)));
}

export interface ChipGroupProps<Id extends string> {
  readonly label: string;
  readonly options: readonly Option<Id>[];
  readonly selected: readonly string[];
  readonly onChange: (next: readonly Id[]) => void;
  readonly className?: string;
}

/** Pills you can switch on and off: the style and what-you-shop-for pickers. */
export function ChipGroup<Id extends string>({ label, options, selected, onChange, className }: ChipGroupProps<Id>): ReactElement {
  return (
    <div className={cx("onb-chips", className)} role="group" aria-label={label}>
      {options.map((o) => {
        const on = selected.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            className="onb-chip"
            aria-pressed={on}
            data-chip-id={o.id}
            onClick={() => {
              haptic("tap");
              onChange(nextSelection(options, selected, o.id));
            }}
          >
            <span className="onb-chip__tick" aria-hidden="true">{on ? <Icon name="check" size={14} strokeWidth={3} /> : null}</span>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export interface SwatchGridProps {
  readonly label: string;
  readonly options: readonly Option<ColourId>[];
  readonly selected: readonly string[];
  readonly onChange: (next: readonly ColourId[]) => void;
}

/** Colour samples with their names under them. A tick badge says which are chosen, so colour is never the only signal. */
export function SwatchGrid({ label, options, selected, onChange }: SwatchGridProps): ReactElement {
  return (
    <div className="onb-swatches" role="group" aria-label={label}>
      {options.map((o) => {
        const on = selected.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            className="onb-swatch"
            aria-pressed={on}
            data-swatch-id={o.id}
            onClick={() => {
              haptic("tap");
              onChange(nextSelection(options, selected, o.id));
            }}
          >
            <span className="onb-swatch__dot" style={{ "--swatch": SWATCHES[o.id] } as CSSProperties} aria-hidden="true">
              {on ? <span className="onb-swatch__tick"><Icon name="check" size={12} strokeWidth={3.2} /></span> : null}
            </span>
            <span className="onb-swatch__name">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export interface SizeRowProps<Id extends string> {
  readonly label: string;
  readonly options: readonly Id[];
  readonly value: Id | null;
  /** null when the chosen size is pressed again: a size is optional. */
  readonly onChange: (next: Id | null) => void;
}

/** One size out of a few, joined like a segmented control; press the chosen one again to clear it. */
export function SizeRow<Id extends string>({ label, options, value, onChange }: SizeRowProps<Id>): ReactElement {
  const id = useId();
  return (
    <div className="onb-size">
      <span className="onb-size__label" id={id}>{label}</span>
      <div className="onb-seg" role="group" aria-labelledby={id}>
        {options.map((o) => (
          <button
            key={o}
            type="button"
            className="onb-seg__opt"
            aria-pressed={value === o}
            data-size={o}
            onClick={() => {
              haptic("tap");
              onChange(value === o ? null : o);
            }}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
