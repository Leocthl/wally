// The small picker of the first run: pills you switch on and off. Every one is a real button with aria-pressed (a group of
// toggles), at least 44 px, and shows what is chosen with a tick as well as colour. Selections are returned as new arrays.
import type { ReactElement } from "react";
import { Icon } from "../../ui/icons";
import { haptic } from "../../ui/haptics";
import { cx } from "../../ui/cx";

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
  /** The id of a message about the group (an error), read with it when focus arrives. */
  readonly describedBy?: string | undefined;
}

/** Pills you can switch on and off: what the budget can buy (step two) and the same choice on the budget form (step three). */
export function ChipGroup<Id extends string>({ label, options, selected, onChange, className, describedBy }: ChipGroupProps<Id>): ReactElement {
  return (
    <div className={cx("onb-chips", className)} role="group" aria-label={label} aria-describedby={describedBy}>
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
