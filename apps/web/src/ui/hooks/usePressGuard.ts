// A hold (press and hold to confirm) opens its dialog while the finger, the mouse button or the key is still down. What
// that press does next is not an answer to the dialog: its release, the click a touch screen sends after the release (it
// lands on whatever is under the finger by then: a dialog button or the scrim), and the repeats of a held key. This hook
// tells a modal surface to ignore exactly those and nothing else:
//   - a surface opened by a click has nothing down, so the guard is off;
//   - a press that starts inside the surface is the person answering, and turns the guard off for good;
//   - a click from the keyboard or a screen reader (no pointer, detail 0) always counts;
//   - the guard ends a moment after the opening press is released, or when the window loses focus.
import { useLayoutEffect, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";

/** How long after the opening press is released a click still belongs to it. The touch screen sends its click at once. */
export const PRESS_TAIL_MS = 500;
/** A press that has not ended this long after the surface opened is taken as lost (nothing is waited for longer). */
const LOST_PRESS_MS = 10_000;

const pointersDown = new Set<number>();
const keysDown = new Set<string>();
/** When each pointer last went up (ms), so a click that follows the release can be told from a later one. */
const pointerUpAt = new Map<number, number>();
let tracking = false;

function release(id: number): void {
  pointersDown.delete(id);
  pointerUpAt.set(id, Date.now());
}

function startTracking(): void {
  if (tracking || typeof window === "undefined") return;
  tracking = true;
  // Capture phase on the window: it sees every press, whatever the page does with the event afterwards.
  window.addEventListener("pointerdown", (e) => void pointersDown.add(e.pointerId), true);
  window.addEventListener("pointerup", (e) => release(e.pointerId), true);
  window.addEventListener("pointercancel", (e) => release(e.pointerId), true);
  window.addEventListener("keydown", (e) => void keysDown.add(e.code), true);
  // macOS sends no keyup for other keys while Meta is held, so Meta coming up ends them all.
  window.addEventListener("keyup", (e) => (e.key === "Meta" ? keysDown.clear() : void keysDown.delete(e.code)), true);
  // A release that happens while another window has focus never reaches this page.
  window.addEventListener("blur", () => {
    for (const id of [...pointersDown]) release(id);
    keysDown.clear();
  });
}
startTracking();

/** Forgets every press (tests, so one test's unfinished press does not leak into the next). */
export function resetPressTracking(): void {
  pointersDown.clear();
  keysDown.clear();
  pointerUpAt.clear();
}

interface Opening {
  readonly at: number;
  readonly pointers: ReadonlySet<number>;
  /** Keys held when it opened and not yet released or pressed afresh inside. */
  readonly keys: ReadonlySet<string>;
  /** A press began inside after it opened: from then on every click is the person's. */
  readonly own: boolean;
}

const without = (keys: ReadonlySet<string>, code: string): ReadonlySet<string> => new Set([...keys].filter((k) => k !== code));

/** True while a pointer that was down at the opening has not been up for longer than the tail. */
function pointerClickBelongsToOpening(o: Opening): boolean {
  const now = Date.now();
  return [...o.pointers].some((id) => {
    if (pointersDown.has(id)) return now - o.at < LOST_PRESS_MS;
    const up = pointerUpAt.get(id);
    return up !== undefined && up >= o.at - 1 && now - up < PRESS_TAIL_MS;
  });
}

export interface PressGuard {
  readonly onClickCapture: (e: MouseEvent<HTMLElement>) => void;
  readonly onPointerDownCapture: (e: PointerEvent<HTMLElement>) => void;
  readonly onKeyDownCapture: (e: KeyboardEvent<HTMLElement>) => void;
  readonly onKeyUpCapture: (e: KeyboardEvent<HTMLElement>) => void;
}

/** Handlers for the root element of a modal surface; `open` is the surface's own open flag. */
export function usePressGuard(open: boolean): PressGuard {
  const opening = useRef<Opening | null>(null);
  // Layout effect: the snapshot is taken in the commit that shows the surface, before the browser can deliver the release.
  useLayoutEffect(() => {
    opening.current = open && (pointersDown.size > 0 || keysDown.size > 0)
      ? { at: Date.now(), pointers: new Set(pointersDown), keys: new Set(keysDown), own: false }
      : null;
  }, [open]);

  return {
    onPointerDownCapture: () => {
      if (opening.current) opening.current = { ...opening.current, own: true };
    },
    onClickCapture: (e) => {
      const o = opening.current;
      if (o === null || o.own || e.detail === 0 || !pointerClickBelongsToOpening(o)) return;
      e.stopPropagation();
      e.preventDefault();
    },
    onKeyDownCapture: (e) => {
      const o = opening.current;
      if (o === null || !o.keys.has(e.code)) return;
      if (e.repeat) {
        // The key that opened the surface is still held: its repeats are not an answer (Enter would click the focused button).
        e.stopPropagation();
        e.preventDefault();
      } else {
        opening.current = { ...o, keys: without(o.keys, e.code) }; // pressed afresh: the person's own key
      }
    },
    onKeyUpCapture: (e) => {
      const o = opening.current;
      if (o === null || !o.keys.has(e.code)) return;
      opening.current = { ...o, keys: without(o.keys, e.code) };
      e.stopPropagation();
      e.preventDefault(); // Space would click the focused button on release
    },
  };
}
