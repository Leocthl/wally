// The one shape the voice controls need that ui/icons.tsx does not have: a stop square for the mic while it listens.
// Same 24 px line style as the shared icons (currentColor stroke, round joins) and decorative: the button around it
// carries the accessible name. The mic itself comes from ui/icons.
import type { ReactElement } from "react";

export function StopIcon({ size = 24, strokeWidth = 2 }: { readonly size?: number; readonly strokeWidth?: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="6.5" y="6.5" width="11" height="11" rx="2.5" />
    </svg>
  );
}
