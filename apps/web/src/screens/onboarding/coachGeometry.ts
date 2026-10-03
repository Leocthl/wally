// The geometry of the quick tour, pure so it can be tested without a browser. Boxes are in viewport pixels, as
// getBoundingClientRect gives them.

export interface Box {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/**
 * The ring drawn around a target: the target grown by `pad`, kept inside the screen and above `floor` (the top of the
 * card that explains it), so it never covers that card. A target that is off screen gets an empty box, not a negative one.
 */
export function spotlightBox(target: Box, viewport: Viewport, pad: number, floor: number): Box {
  const left = Math.max(0, target.left - pad);
  const top = Math.max(0, target.top - pad);
  const right = Math.min(viewport.width, target.left + target.width + pad);
  const bottom = Math.min(viewport.height, floor, target.top + target.height + pad);
  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/** The index of the next mark in `step` direction (1 or -1) that has a target on the page, or null when there is none. */
export function nextMark(present: readonly boolean[], from: number, step: 1 | -1): number | null {
  for (let at = from + step; at >= 0 && at < present.length; at += step) if (present[at]) return at;
  return null;
}
