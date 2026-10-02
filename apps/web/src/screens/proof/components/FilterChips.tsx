// Filter chips for the receipts list: one choice at a time (a radio group), arrow keys move, each chip shows its count.
// Counts are ids of the list on screen (data-ident), not figures about the world.
import { useRef, type KeyboardEvent, type ReactElement } from "react";
import type { LabelPair } from "../../../i18n/label";
import { cx } from "../../../ui/cx";
import { nextIndex } from "../../../ui/hooks/useRoving";
import { useLocale } from "../../../ui/locale";
import type { ReceiptFilter } from "../receipts";

export interface FilterOption {
  readonly id: ReceiptFilter;
  readonly label: LabelPair;
  readonly count: number;
}

export function FilterChips({ options, value, onChange, label }: { readonly options: readonly FilterOption[]; readonly value: ReceiptFilter; readonly onChange: (f: ReceiptFilter) => void; readonly label: string }): ReactElement {
  const { t } = useLocale();
  const group = useRef<HTMLDivElement>(null);
  const index = Math.max(0, options.findIndex((o) => o.id === value));
  const onKey = (e: KeyboardEvent<HTMLButtonElement>): void => {
    const next = nextIndex(e.key, index, options.length);
    const option = next === null ? undefined : options[next];
    if (!option) return;
    e.preventDefault();
    onChange(option.id);
    group.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next ?? 0]?.focus();
  };
  return (
    <div ref={group} role="radiogroup" aria-label={label} className="rc-filters">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          tabIndex={o.id === value ? 0 : -1}
          className={cx("rc-filter", o.id === value && "rc-filter--on")}
          data-filter={o.id}
          onClick={() => onChange(o.id)}
          onKeyDown={onKey}
        >
          <span>{t(o.label)}</span>
          <span className="rc-filter__count" data-ident>{o.count}</span>
        </button>
      ))}
    </div>
  );
}
