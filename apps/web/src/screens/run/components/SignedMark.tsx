// A check that draws itself once beside "You said yes": the answer was signed and the run went on. Decorative.
import type { ReactElement } from "react";

export function SignedMark(): ReactElement {
  return (
    <svg className="run-signed" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M5 12.5l4.5 4.5L19 7.5" pathLength="1" />
    </svg>
  );
}
