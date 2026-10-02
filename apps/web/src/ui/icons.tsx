// 24 px line icons for the Wally primitives. Decorative by default (aria-hidden); the control around them carries the
// accessible name. currentColor only, so tokens decide the colour.
import type { ReactElement, ReactNode } from "react";

export interface IconProps {
  readonly size?: number;
  readonly className?: string;
  readonly strokeWidth?: number;
}

function Svg({ size = 24, className, strokeWidth = 2, children }: IconProps & { readonly children: ReactNode }): ReactElement {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

const PATHS = {
  wallet: <><rect x="3" y="6" width="18" height="14" rx="3.5" /><path d="M3 10h18M16.5 14.5h1.5" /><path d="M6.5 6l8.5-2.6a1.6 1.6 0 0 1 2 1.1L17.5 6" /></>,
  sparkle: <path d="M12 3.5l1.6 4.6a3 3 0 0 0 1.8 1.8l4.6 1.6-4.6 1.6a3 3 0 0 0-1.8 1.8L12 19.5l-1.6-4.6a3 3 0 0 0-1.8-1.8L4 11.5l4.6-1.6a3 3 0 0 0 1.8-1.8z" />,
  receipt: <><path d="M6 3h12v18l-2.5-1.6L13 21l-2.5-1.6L8 21l-2-1.3z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  shield: <path d="M12 3l7.5 3v5.6c0 4.4-3.1 8.2-7.5 9.4-4.4-1.2-7.5-5-7.5-9.4V6z" />,
  shieldCheck: <><path d="M12 3l7.5 3v5.6c0 4.4-3.1 8.2-7.5 9.4-4.4-1.2-7.5-5-7.5-9.4V6z" /><path d="M8.8 12.2l2.2 2.2 4.3-4.6" /></>,
  shieldAlert: <><path d="M12 3l7.5 3v5.6c0 4.4-3.1 8.2-7.5 9.4-4.4-1.2-7.5-5-7.5-9.4V6z" /><path d="M12 8v4.5M12 16h.01" /></>,
  chevronLeft: <path d="M15 5l-7 7 7 7" />,
  chevronRight: <path d="M9 5l7 7-7 7" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  checkCircle: <><circle cx="12" cy="12" r="9" /><path d="M8 12.3l2.8 2.8L16.2 9.5" /></>,
  hand: <path d="M8.5 12V6a1.5 1.5 0 0 1 3 0v5M11.5 10.5V4.5a1.5 1.5 0 0 1 3 0v6M14.5 6.5a1.5 1.5 0 0 1 3 0v7c0 4-2.9 7-6.6 7-2.6 0-4.4-1.4-5.6-3.4l-2-3.5a1.5 1.5 0 0 1 2.5-1.6l1.2 1.5V12" />,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></>,
  arrowUp: <path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" />,
  lock: <><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>,
  lockOpen: <><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 0 1 7.6-1.7" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.8h.01" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  download: <><path d="M12 4v11M7 10.5l5 5 5-5" /><path d="M5 19.5h14" /></>,
  share: <><path d="M12 3v12M8 7l4-4 4 4" /><path d="M6.5 11H6a1.5 1.5 0 0 0-1.5 1.5v7A1.5 1.5 0 0 0 6 21h12a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 18 11h-.5" /></>,
  addSquare: <><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M12 8.5v7M8.5 12h7" /></>,
  refresh: <><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" /><path d="M19.5 4.5v4h-4" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  tag: <><path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.2 6.2a1.5 1.5 0 0 1-2.1 0z" /><circle cx="8" cy="8" r="1.4" /></>,
  card: <><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M3 10h18M7 15h3" /></>,
  store: <><path d="M4 9.5l1.5-5h13L20 9.5" /><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0" /><path d="M5.5 12v8h13v-8" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  list: <path d="M8 6.5h12M8 12h12M8 17.5h12M4 6.5h.01M4 12h.01M4 17.5h.01" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2.1 1.2M17.7 15.3l2.1 1.2M4.2 16.5l2.1-1.2M17.7 8.7l2.1-1.2" /></>,
  alert: <><path d="M10.3 4.2L2.8 17.5a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z" /><path d="M12 9.5V13.5M12 17h.01" /></>,
  wifiOff: <><path d="M3 3l18 18" /><path d="M8.5 16.5a5 5 0 0 1 7 0M5 12.8a10 10 0 0 1 4.3-2.5M14.6 10.3A10 10 0 0 1 19 12.8M2 9.2a15 15 0 0 1 4.2-2.7M12 5.5a15 15 0 0 1 10 3.7M12 20h.01" /></>,
} as const;

export type IconName = keyof typeof PATHS;
export const ICON_NAMES = Object.keys(PATHS) as readonly IconName[];

export function Icon({ name, ...rest }: IconProps & { readonly name: IconName }): ReactElement {
  return <Svg {...rest}>{PATHS[name]}</Svg>;
}
