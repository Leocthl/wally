// Inline SVG icons. State is colour + icon + text (docs/04 State semantics); icons are decorative (aria-hidden).
import type { ReactElement } from "react";

const SIZE = 20;

function Svg({ children, className }: { readonly children: ReactElement | readonly ReactElement[]; readonly className?: string }): ReactElement {
  return (
    <svg className={className} width={SIZE} height={SIZE} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

/** MINTED: check in a rounded square. */
export function IconMinted(): ReactElement {
  return (
    <Svg>
      <rect x="2.5" y="2.5" width="15" height="15" rx="4" />
      <path d="M6.5 10.5l2.5 2.5 4.5-5.5" />
    </Svg>
  );
}

/** STOPPED: octagon. */
export function IconStopped(): ReactElement {
  return (
    <Svg>
      <path d="M7 2.5h6l4.5 4.5v6L13 17.5H7L2.5 13V7z" />
      <path d="M7.5 7.5l5 5M12.5 7.5l-5 5" />
    </Svg>
  );
}

/** ESCALATED: hourglass. */
export function IconEscalated(): ReactElement {
  return (
    <Svg>
      <path d="M5 2.5h10M5 17.5h10M6 2.5c0 4 4 4.5 4 7.5s-4 3.5-4 7.5M14 2.5c0 4-4 4.5-4 7.5s4 3.5 4 7.5" />
    </Svg>
  );
}

/** PENDING: dashed square. */
export function IconPending(): ReactElement {
  return (
    <Svg>
      <rect x="2.5" y="2.5" width="15" height="15" rx="1.5" strokeDasharray="3 3" />
    </Svg>
  );
}

/** Envelope outline with flap: the PACKET motif (docs/04 Branding guard). */
export function EnvelopeOutline({ className }: { readonly className?: string }): ReactElement {
  return (
    <svg className={className} viewBox="0 0 120 64" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" aria-hidden="true" focusable="false" preserveAspectRatio="none">
      <rect x="2" y="2" width="116" height="60" rx="8" />
      <path d="M2 10l58 30 58-30" />
    </svg>
  );
}

/** Square chop seal with the character 封. */
export function ChopSeal({ className }: { readonly className?: string }): ReactElement {
  return (
    <span className={`chop ${className ?? ""}`.trim()} aria-hidden="true">
      <span lang="zh-HK">封</span>
    </span>
  );
}

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
