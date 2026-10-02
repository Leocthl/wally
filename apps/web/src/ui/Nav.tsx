// Navigation: TopBar, BottomTabBar, Tabs (in-page panels) and Segmented (a radio group, e.g. EN | 繁).
// Tabs and Segmented use roving focus: one tab stop, arrows move, Home and End jump.
import { useId, useRef, type CSSProperties, type KeyboardEvent, type ReactElement, type ReactNode } from "react";
import "../design/ui/nav.css";
import { UI } from "../i18n/ui";
import { IconButton } from "./Button";
import { cx } from "./cx";
import { nextIndex } from "./hooks/useRoving";
import { Icon } from "./icons";
import { useLocale } from "./locale";

export interface TopBarProps {
  readonly title: ReactNode;
  readonly subtitle?: ReactNode;
  readonly onBack?: () => void;
  readonly leading?: ReactNode;
  readonly actions?: ReactNode;
  /** Large title (home screens); compact otherwise. */
  readonly large?: boolean;
  readonly sticky?: boolean;
  readonly className?: string;
}

export function TopBar({ title, subtitle, onBack, leading, actions, large = false, sticky = true, className }: TopBarProps): ReactElement {
  const { t } = useLocale();
  return (
    <header className={cx("w-topbar", large && "w-topbar--large", sticky && "w-topbar--sticky", className)}>
      {onBack ? <IconButton label={t(UI.back)} icon={<Icon name="chevronLeft" />} onClick={onBack} /> : null}
      {leading ? <span className="w-topbar__leading">{leading}</span> : null}
      <span className="w-topbar__titles">
        {subtitle ? <span className="w-topbar__subtitle">{subtitle}</span> : null}
        <span className="w-topbar__title" role="heading" aria-level={1}>{title}</span>
      </span>
      {actions ? <span className="w-topbar__actions">{actions}</span> : null}
    </header>
  );
}

export interface TabItem {
  readonly id: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly href?: string;
  /** Small count or dot, announced with the label. */
  readonly badge?: string;
}

export interface CenterAction {
  readonly label: string;
  readonly icon: ReactNode;
  readonly onPress: () => void;
}

export interface BottomTabBarProps {
  readonly items: readonly TabItem[];
  /** Raised round action in the middle of the bar ("Ask"); items split evenly around it. */
  readonly center?: CenterAction;
  readonly current: string;
  readonly onSelect?: (id: string) => void;
  /** Accessible name of the navigation landmark. */
  readonly label: string;
  /** "fixed" pins it to the viewport (app shell); "static" keeps it in flow (previews). */
  readonly position?: "fixed" | "static";
}

function CenterButton({ action }: { readonly action: CenterAction }): ReactElement {
  return (
    <li className="w-tabbar__center">
      <button type="button" className="w-tabbar__fab" onClick={action.onPress}>
        <span className="w-tabbar__fab-disc">{action.icon}</span>
        <span className="w-tabbar__label">{action.label}</span>
      </button>
    </li>
  );
}

export function BottomTabBar({ items, current, onSelect, label, position = "fixed", center }: BottomTabBarProps): ReactElement {
  const half = Math.ceil(items.length / 2);
  return (
    <nav className={cx("w-tabbar", `w-tabbar--${position}`, center && "w-tabbar--with-center")} aria-label={label}>
      <ul className="w-tabbar__list">
        {items.flatMap((item, i) => {
          const active = item.id === current;
          const body = (
            <>
              <span className="w-tabbar__icon">{item.icon}</span>
              <span className="w-tabbar__label">{item.label}</span>
              {item.badge ? <span className="w-tabbar__badge">{item.badge}</span> : null}
            </>
          );
          const common = { className: "w-tabbar__item", "aria-current": active ? ("page" as const) : undefined };
          const tab = (
            <li key={item.id}>
              {item.href !== undefined ? (
                <a {...common} href={item.href} onClick={() => onSelect?.(item.id)}>{body}</a>
              ) : (
                <button {...common} type="button" onClick={() => onSelect?.(item.id)}>{body}</button>
              )}
            </li>
          );
          return center && i === half ? [<CenterButton key="center" action={center} />, tab] : [tab];
        })}
      </ul>
    </nav>
  );
}

export interface TabsProps {
  readonly items: readonly { readonly id: string; readonly label: string; readonly panel: ReactNode }[];
  readonly value: string;
  readonly onChange: (id: string) => void;
  readonly label: string;
}

export function Tabs({ items, value, onChange, label }: TabsProps): ReactElement {
  const base = useId();
  const list = useRef<HTMLDivElement>(null);
  const index = Math.max(0, items.findIndex((i) => i.id === value));
  const onKey = (e: KeyboardEvent<HTMLButtonElement>): void => {
    const next = nextIndex(e.key, index, items.length);
    const item = next === null ? undefined : items[next];
    if (!item) return;
    e.preventDefault();
    onChange(item.id);
    list.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next ?? 0]?.focus();
  };
  return (
    <div className="w-tabs">
      <div className="w-tabs__list" role="tablist" aria-label={label} ref={list}>
        {items.map((item) => (
          <button key={item.id} type="button" role="tab" id={`${base}-tab-${item.id}`} aria-controls={`${base}-panel-${item.id}`} aria-selected={item.id === value} tabIndex={item.id === value ? 0 : -1} className="w-tabs__tab" onClick={() => onChange(item.id)} onKeyDown={onKey}>
            {item.label}
          </button>
        ))}
      </div>
      {items.map((item) => (
        <div key={item.id} role="tabpanel" id={`${base}-panel-${item.id}`} aria-labelledby={`${base}-tab-${item.id}`} hidden={item.id !== value} tabIndex={0} className="w-tabs__panel">
          {item.id === value ? item.panel : null}
        </div>
      ))}
    </div>
  );
}

export interface SegmentedOption<V extends string> {
  readonly value: V;
  readonly label: string;
  /** Language of the visible label (e.g. "zh-HK" for 繁). */
  readonly lang?: string;
  /** Spoken name when the visible label is an abbreviation. */
  readonly ariaLabel?: string;
}

export interface SegmentedProps<V extends string> {
  readonly options: readonly SegmentedOption<V>[];
  readonly value: V;
  readonly onChange: (value: V) => void;
  readonly label: string;
  readonly size?: "sm" | "md";
  readonly className?: string;
}

export function Segmented<V extends string>({ options, value, onChange, label, size = "sm", className }: SegmentedProps<V>): ReactElement {
  const group = useRef<HTMLDivElement>(null);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const onKey = (e: KeyboardEvent<HTMLButtonElement>): void => {
    const next = nextIndex(e.key, index, options.length);
    const option = next === null ? undefined : options[next];
    if (!option) return;
    e.preventDefault();
    onChange(option.value);
    group.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next ?? 0]?.focus();
  };
  return (
    <div ref={group} role="radiogroup" aria-label={label} className={cx("w-seg", `w-seg--${size}`, className)} style={{ "--seg-i": index, "--seg-n": options.length } as CSSProperties}>
      <span className="w-seg__thumb" aria-hidden="true" />
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} aria-label={o.ariaLabel} tabIndex={o.value === value ? 0 : -1} lang={o.lang} className="w-seg__opt" onClick={() => onChange(o.value)} onKeyDown={onKey}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
