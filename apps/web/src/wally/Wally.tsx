// <Wally state size />: the character, with an accessible name in the current language. Animation is CSS only and
// stops under reduced motion (the pose still shows the state). Below 40 px the mini drawing keeps the face legible.
import type { ReactElement } from "react";
import "./wally.css";
import { UI } from "../i18n/ui";
import { cx } from "../ui/cx";
import { useLocale } from "../ui/locale";
import { WallyArt, type WallyState } from "./art";

export type { WallyState } from "./art";
export { WALLY_STATES } from "./art";

const LABEL = { idle: UI.wallyIdle, thinking: UI.wallyThinking, approved: UI.wallyApproved, stopped: UI.wallyStopped, offline: UI.wallyOffline } as const;

export const MINI_BELOW_PX = 40;

export interface WallyProps {
  readonly state?: WallyState;
  /** Pixels; 24 for tab bars, 48 for rows, 96 to 160 for empty and result screens. */
  readonly size?: number;
  /** Override the spoken name (current language). */
  readonly label?: string;
  /** Hide from assistive tech when nearby text already says the same. */
  readonly decorative?: boolean;
  readonly className?: string;
}

export function Wally({ state = "idle", size = 96, label, decorative = false, className }: WallyProps): ReactElement {
  const { t, locale } = useLocale();
  const detail = size < MINI_BELOW_PX ? "mini" : "full";
  const a11y = decorative ? { "aria-hidden": true as const } : { role: "img" as const, "aria-label": label ?? t(LABEL[state]), lang: locale };
  return (
    <span className={cx("wally", `wally--${state}`, `wally--${detail}`, className)} data-state={state} style={{ width: size, height: size }} {...a11y}>
      <WallyArt state={state} detail={detail} size={size} />
    </span>
  );
}
