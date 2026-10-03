// The laptop navigation: the same four places as the phone's tab bar, as plain words in the top bar. One landmark is on the page
// at a time (AppShell renders this or the bottom tab bar, never both), so a screen reader hears one "Main" navigation.
import type { ReactElement } from "react";
import type { TabItem } from "../ui/Nav";

export interface TopNavProps {
  readonly items: readonly TabItem[];
  readonly current: string;
  /** Accessible name of the navigation landmark. */
  readonly label: string;
}

export function TopNav({ items, current, label }: TopNavProps): ReactElement {
  return (
    <nav className="shell-topnav" aria-label={label}>
      <ul className="shell-topnav__list">
        {items.map((item) => (
          <li key={item.id}>
            <a className="shell-topnav__item" href={item.href} aria-current={item.id === current ? "page" : undefined}>{item.label}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
