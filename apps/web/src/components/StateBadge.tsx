// State is colour + icon + text, never colour alone (docs/04 State semantics). Amber carries only ESCALATED; brass none.
import type { ReactElement } from "react";
import { IconEscalated, IconMinted, IconPending, IconStopped } from "./icons";

export type Tone = "minted" | "stopped" | "escalated" | "pending";

const ICON: Record<Tone, () => ReactElement> = { minted: IconMinted, stopped: IconStopped, escalated: IconEscalated, pending: IconPending };

export interface StateBadgeProps {
  readonly tone: Tone;
  /** Text next to the icon, e.g. "MINTED", "STOPPED", "USED". */
  readonly text: string;
  /** Rule id appended in text, e.g. R3. */
  readonly ruleId?: string;
  readonly zh?: string;
}

export function StateBadge({ tone, text, ruleId, zh }: StateBadgeProps): ReactElement {
  const Icon = ICON[tone];
  return (
    <span className={`state state--${tone}`} data-state={text} {...(tone === "minted" ? { role: "status" } : {})}>
      <Icon />
      <span className="state__text">
        {text}
        {ruleId ? <> <span data-ident>{ruleId}</span></> : null}
      </span>
      {zh ? <span className="state__zh" lang="zh-HK">{zh}</span> : null}
    </span>
  );
}
