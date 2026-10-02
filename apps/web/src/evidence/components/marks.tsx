// Small decorative marks for verdicts and pass/miss. Always next to text: colour and shape are never the only signal.
import type { ReactElement } from "react";

function Mark({ d }: { readonly d: string }): ReactElement {
  return (
    <svg className="ev-mark" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}

export const MarkLower = (): ReactElement => <Mark d="M8 2v11M3.5 8.5 8 13l4.5-4.5" />;
export const MarkHigher = (): ReactElement => <Mark d="M8 14V3M3.5 7.5 8 3l4.5 4.5" />;
export const MarkEqual = (): ReactElement => <Mark d="M3 6h10M3 10h10" />;
export const MarkNone = (): ReactElement => <Mark d="M4 8h8" />;
export const MarkPass = (): ReactElement => <Mark d="M2.5 8.5l3.5 3.5 7.5-8" />;
export const MarkMiss = (): ReactElement => <Mark d="M3.5 3.5l9 9M12.5 3.5l-9 9" />;
