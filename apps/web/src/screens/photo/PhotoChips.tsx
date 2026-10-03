// The chips that say what Wally looks for, and the dots for the colours found in the picture. Everything on them is a typed
// word: tapping changes what Wally looks for (and the list below follows), it never decides anything. A chip that is on
// carries a check mark as well as its colour, and every chip is at least 44 px tall.
import { useRef, type KeyboardEvent, type ReactElement } from "react";
import { colorSwatch, type Color, type PaletteEntry } from "@wally/agent/vision";
import { COLOR_WORDS } from "../../i18n/photo";
import { cx } from "../../ui/cx";
import { Icon } from "../../ui/icons";
import { nextIndex } from "../../ui/hooks/useRoving";
import { useLocale } from "../../ui/locale";

export interface ChipOption<T extends string> {
  readonly id: T;
  readonly text: string;
  /** A colour swatch shown before the text. */
  readonly swatch?: string;
}

export interface ChipGroupProps<T extends string> {
  readonly title: string;
  readonly options: readonly ChipOption<T>[];
  readonly selected: readonly T[];
  readonly onPick: (id: T) => void;
  /** "choose": one of them, always (a radio group). "toggle": each on or off (pressed buttons). */
  readonly mode: "choose" | "toggle";
  /** Marks the group as the one to answer next. */
  readonly attention?: boolean;
  readonly slot: string;
}

function Chip<T extends string>({ option, on, role, tabIndex, onPick, onKeyDown }: { readonly option: ChipOption<T>; readonly on: boolean; readonly role: "radio" | "button"; readonly tabIndex: number; readonly onPick: () => void; readonly onKeyDown?: (e: KeyboardEvent<HTMLButtonElement>) => void }): ReactElement {
  const state = role === "radio" ? { "aria-checked": on } : { "aria-pressed": on };
  return (
    <button type="button" role={role === "radio" ? "radio" : undefined} {...state} tabIndex={tabIndex} className="photo-chip" data-chip-id={option.id} onClick={onPick} onKeyDown={onKeyDown}>
      {option.swatch ? <span className="photo-chip__swatch" style={{ background: option.swatch }} aria-hidden="true" /> : null}
      <span className="photo-chip__text">{option.text}</span>
      <span className="photo-chip__check" aria-hidden="true">
        <Icon name="check" size={16} strokeWidth={2.6} />
      </span>
    </button>
  );
}

export function ChipGroup<T extends string>({ title, options, selected, onPick, mode, attention = false, slot }: ChipGroupProps<T>): ReactElement {
  const list = useRef<HTMLDivElement>(null);
  const radio = mode === "choose";
  const firstOn = options.findIndex((o) => selected.includes(o.id));
  const tab = firstOn === -1 ? 0 : firstOn;
  const onKey = (index: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const next = nextIndex(e.key, index, options.length);
    const option = next === null ? undefined : options[next];
    if (!option) return;
    e.preventDefault();
    onPick(option.id);
    list.current?.querySelectorAll<HTMLButtonElement>("button")[next ?? 0]?.focus();
  };
  return (
    <div className={cx("photo-group", attention && "photo-group--attention")} data-slot={slot}>
      <p className="photo-group__title" id={`photo-${slot}-title`}>{title}</p>
      <div ref={list} className="photo-chips" role={radio ? "radiogroup" : "group"} aria-labelledby={`photo-${slot}-title`}>
        {options.map((option, index) => (
          <Chip key={option.id} option={option} on={selected.includes(option.id)} role={radio ? "radio" : "button"} tabIndex={radio ? (index === tab ? 0 : -1) : 0} onPick={() => onPick(option.id)} {...(radio ? { onKeyDown: onKey(index) } : {})} />
        ))}
      </div>
    </div>
  );
}

/** The colours found in the picture, biggest first, as dots; tapping one puts that colour on or off the colour chips. */
export function PaletteDots({ palette, selected, onToggle, title }: { readonly palette: readonly PaletteEntry[]; readonly selected: readonly Color[]; readonly onToggle: (color: Color) => void; readonly title: string }): ReactElement | null {
  const { t } = useLocale();
  if (palette.length === 0) return null;
  return (
    <div className="photo-plates" data-slot="photo-plates">
      <p className="photo-plates__title" id="photo-plates-title">{title}</p>
      <div className="photo-plates__dots" role="group" aria-labelledby="photo-plates-title">
        {palette.map((entry) => {
          const on = selected.includes(entry.color);
          return (
            <button key={entry.color} type="button" className="photo-dot" aria-pressed={on} aria-label={t(COLOR_WORDS[entry.color])} data-color={entry.color} onClick={() => onToggle(entry.color)}>
              <span className="photo-dot__fill" style={{ background: colorSwatch(entry.color) }} aria-hidden="true" />
              <span className="photo-dot__check" aria-hidden="true">
                <Icon name="check" size={14} strokeWidth={3} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
