// Dragging a bottom sheet by its handle. The sheet follows the finger 1:1 (with rubber-band friction above its resting
// place), the scrim fades with it, and on release the sheet either leaves from where it is (far enough, or a flick) or
// settles back from where it is. Nothing restarts from zero: the exit and the settle are CSS transitions that begin at
// the live offset (apple-design: animate from the presentation value; emil: a flick is enough to dismiss).
import { useRef, type PointerEvent, type RefObject } from "react";

/** Dragged this far down, a release closes the sheet. */
export const CLOSE_DISTANCE_PX = 96;
/** Faster than this (px per ms, downward) a release closes it even when short. */
export const FLICK_PX_PER_MS = 0.11;
/** A flick must still have travelled this far, so a twitch of the thumb does not close it. */
export const FLICK_MIN_PX = 24;
const VELOCITY_WINDOW_MS = 90;
const FRICTION = 0.55;

export interface PointerSample {
  readonly y: number;
  readonly t: number;
}

/** Apple's rubber band: the further past the edge, the less the sheet follows. */
export function rubberBand(overshoot: number, dimension: number): number {
  return (overshoot * dimension * FRICTION) / (dimension + FRICTION * Math.abs(overshoot));
}

/** Where the sheet sits for a finger `dy` px below where it was grabbed (negative: pulled up, with friction). */
export function dragOffset(dy: number, panelHeight: number): number {
  return dy >= 0 ? dy : -rubberBand(-dy, Math.max(panelHeight, 1) / 4);
}

/** Downward velocity in px per ms over the last moments of the drag. */
export function velocityOf(samples: readonly PointerSample[]): number {
  const last = samples[samples.length - 1];
  if (!last) return 0;
  const first = samples.find((s) => last.t - s.t <= VELOCITY_WINDOW_MS) ?? last;
  const dt = last.t - first.t;
  return dt <= 0 ? 0 : (last.y - first.y) / dt;
}

export type Release = "close" | "settle";

export function releaseDecision(distance: number, velocity: number): Release {
  if (distance >= CLOSE_DISTANCE_PX) return "close";
  return velocity >= FLICK_PX_PER_MS && distance >= FLICK_MIN_PX ? "close" : "settle";
}

interface Drag {
  readonly id: number;
  readonly startY: number;
  readonly samples: readonly PointerSample[];
}

/** How long the owner has to start closing after a release that asked for it. */
const CLOSE_GRACE_MS = 120;

export interface SheetDragHandlers {
  readonly onPointerDown: (e: PointerEvent<HTMLDivElement>) => void;
  readonly onPointerMove: (e: PointerEvent<HTMLDivElement>) => void;
  readonly onPointerUp: (e: PointerEvent<HTMLDivElement>) => void;
  readonly onPointerCancel: (e: PointerEvent<HTMLDivElement>) => void;
}

function overlayOf(panel: HTMLElement): HTMLElement | null {
  return panel.parentElement;
}

/** Back to rest from the live offset: the CSS transition (settle) does the travel. */
export function settleBack(panel: HTMLElement): void {
  const overlay = overlayOf(panel);
  overlay?.removeAttribute("data-dragging");
  panel.style.removeProperty("transform");
  overlay?.querySelector<HTMLElement>(".w-scrim")?.style.removeProperty("opacity");
}

/** Clears what a drag left on the elements (the exit takes over from CSS). */
export function clearDragStyles(panel: HTMLElement): void {
  panel.style.removeProperty("transform");
  overlayOf(panel)?.querySelector<HTMLElement>(".w-scrim")?.style.removeProperty("opacity");
}

export function useSheetDrag(panel: RefObject<HTMLDivElement | null>, onClose: () => void): SheetDragHandlers {
  const drag = useRef<Drag | null>(null);
  const close = useRef(onClose);
  close.current = onClose;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    const el = panel.current;
    // One finger at a time: a second touch while dragging must not move the grab point.
    if (!el || drag.current || (e.pointerType === "mouse" && e.button !== 0)) return;
    // The close button (and any other control on the drag surface) keeps its own click.
    if (e.target instanceof Element && e.target.closest("button, a, input, select, textarea")) return;
    drag.current = { id: e.pointerId, startY: e.clientY, samples: [{ y: e.clientY, t: e.timeStamp }] };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    overlayOf(el)?.setAttribute("data-dragging", "true");
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    const el = panel.current;
    const d = drag.current;
    if (!el || !d || e.pointerId !== d.id) return;
    drag.current = { ...d, samples: [...d.samples.slice(-8), { y: e.clientY, t: e.timeStamp }] };
    const offset = dragOffset(e.clientY - d.startY, el.offsetHeight);
    el.style.transform = `translateY(${offset}px)`;
    const scrim = overlayOf(el)?.querySelector<HTMLElement>(".w-scrim");
    if (scrim) scrim.style.opacity = String(1 - Math.min(1, Math.max(0, offset) / Math.max(el.offsetHeight, 1)) * 0.85);
  };

  const finish = (e: PointerEvent<HTMLDivElement>, cancelled: boolean): void => {
    const el = panel.current;
    const d = drag.current;
    if (!el || !d || e.pointerId !== d.id) return;
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    const distance = e.clientY - d.startY;
    const decision: Release = cancelled ? "settle" : releaseDecision(distance, velocityOf([...d.samples, { y: e.clientY, t: e.timeStamp }]));
    if (decision === "settle") {
      el.setAttribute("data-settling", "true");
      settleBack(el);
      window.setTimeout(() => el.removeAttribute("data-settling"), 600);
      return;
    }
    // Leave the live offset in place: the closing phase (set by the owner) transitions from it to the bottom edge.
    overlayOf(el)?.removeAttribute("data-dragging");
    close.current();
    // If the owner kept the sheet open after all, bring it home instead of leaving it displaced.
    window.setTimeout(() => {
      if (el.isConnected && overlayOf(el)?.getAttribute("data-phase") === "open") settleBack(el);
    }, CLOSE_GRACE_MS);
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: (e) => finish(e, false),
    onPointerCancel: (e) => finish(e, true),
  };
}
