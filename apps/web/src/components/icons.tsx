// The two marks a provenance chip needs: a dot for OBSERVED and a tick for MEASURED (ProvChip, and the Evidence figures).
// Decorative (aria-hidden): the chip text always says the kind too. The app's own icon set is src/ui/icons.
import type { ReactElement } from "react";

export function IconTick(): ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M2 6.5l2.5 2.5L10 3.5" />
    </svg>
  );
}

export function IconDot(): ReactElement {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="8" height="8" rx="2" fill="currentColor" />
    </svg>
  );
}
