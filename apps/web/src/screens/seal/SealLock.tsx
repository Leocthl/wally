// The seal moment: a padlock whose shackle closes, then a shield with a tick and one soft pulse. Not a stamp. Under
// reduced motion the tokens zero the durations, so it simply shows the closed lock and the shield.
import type { ReactElement } from "react";
import { cx } from "../../ui/cx";

export function SealLock({ locked, size = 112, className }: { readonly locked: boolean; readonly size?: number; readonly className?: string }): ReactElement {
  return (
    <span className={cx("seal-lock", className)} data-locked={locked} style={{ width: size, height: size }} aria-hidden="true">
      <span className="seal-lock__pulse" />
      <svg className="seal-lock__svg" viewBox="0 0 96 96" width={size} height={size} focusable="false" aria-hidden="true">
        <path className="seal-lock__shackle" d="M33 46V33a15 15 0 0 1 30 0v13" fill="none" strokeWidth="8" strokeLinecap="round" />
        <rect className="seal-lock__body" x="20" y="42" width="56" height="42" rx="12" />
        <circle className="seal-lock__hole" cx="48" cy="60" r="5" />
        <rect className="seal-lock__hole" x="45.5" y="61" width="5" height="11" rx="2.5" />
        <g className="seal-lock__shield">
          <path className="seal-lock__shield-body" d="M74 54l13 5v9.5c0 7.5-5.5 14-13 16-7.5-2-13-8.5-13-16V59z" />
          <path className="seal-lock__shield-tick" d="M68.5 68.5l4 4 7.5-8" fill="none" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </svg>
    </span>
  );
}
