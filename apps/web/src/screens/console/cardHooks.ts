// Small hooks for the one-off card: its clock, the one-time reactions to a change of state and to a decline. All of them
// leave first paint alone: a card that is already used when the page opens just shows its stamp.
import { useEffect, useRef, useState, type RefObject } from "react";
import type { CardRecord } from "../../api/types";
import { formatCountdown } from "../../shell/format";
import { useNow } from "../../shell/useNow";

export interface CardClock {
  /** Milliseconds until the card expires; null once it is not ready (used, cancelled, expired). */
  readonly leftMs: number | null;
  /** 1 at the start of the card's life, 0 at its end. */
  readonly ratio: number;
  /** m:ss, or empty when the card is not ready. */
  readonly text: string;
}

/** A card that is ready counts down to its expiry; any other state shows no clock. */
export function useCardClock(card: CardRecord | undefined): CardClock {
  const ready = card?.state === "ACTIVE";
  const now = useNow(ready);
  if (!card || !ready) return { leftMs: null, ratio: 0, text: "" };
  const end = Date.parse(card.expires_at);
  const start = Date.parse(card.minted_at);
  if (!Number.isFinite(end) || !Number.isFinite(start)) return { leftMs: null, ratio: 0, text: "" };
  const left = Math.max(0, end - now);
  const life = Math.max(1, end - start);
  return { leftMs: left, ratio: Math.min(1, left / life), text: formatCountdown(left) };
}

/** True once `value` has changed while mounted (a stamp lands only when the change is seen, not on first paint). */
export function useChanged<T>(value: T): boolean {
  const prev = useRef(value);
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      setChanged(true);
    }
  }, [value]);
  return changed;
}

const SHAKE_MS = 320;
const SHAKE_EASE = "cubic-bezier(0.23, 1, 0.32, 1)";
const SHAKE: Keyframe[] = [
  { transform: "translateX(0)" },
  { transform: "translateX(-7px)" },
  { transform: "translateX(6px)" },
  { transform: "translateX(-4px)" },
  { transform: "translateX(2px)" },
  { transform: "translateX(0)" },
];

function reducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * A "no" for the card when a new decline arrives while it is on screen: a short side-to-side shake (WAAPI, so it
 * interrupts cleanly and costs no layout). Nothing on first paint, nothing under reduced motion.
 */
export function useDeclineShake(el: RefObject<HTMLElement | null>, declines: number): void {
  const seen = useRef(declines);
  useEffect(() => {
    const node = el.current;
    if (declines > seen.current && node && typeof node.animate === "function" && !reducedMotion()) {
      node.animate(SHAKE, { duration: SHAKE_MS, easing: SHAKE_EASE });
    }
    seen.current = declines;
  }, [declines, el]);
}
