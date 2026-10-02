// JS mirrors of motion tokens that behaviour needs (docs/04 Tokens). A test keeps them in sync with tokens.css.

/** --dur-hold: hold-to-confirm duration. Functional, so it is kept under reduced motion. */
export const HOLD_MS = 1200;

/** Steps the hold fill uses under reduced motion ("fills in steps", docs/04 Accessibility). */
export const HOLD_REDUCED_STEPS = 4;

/** --dur-roll: the digits of the budget amount rolling to a new value. Decorative: zero under reduced motion. */
export const ROLL_MS = 560;

/** --dur-stagger: the step between siblings that enter together (rule chips, ceremony beats). */
export const STAGGER_MS = 40;

/** --ease-out as a string for libraries that take timing in JS (NumberFlow). */
export const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

/** --dur-ceremony: how long the seal moment plays on Check and seal before the sealed screen takes over. */
export const CEREMONY_MS = 900;

/** A duration token as the browser has it right now (0 under reduced motion, and in a DOM that has no tokens). */
export function cssDurationMs(name: `--dur-${string}`): number {
  if (typeof window === "undefined" || typeof getComputedStyle !== "function") return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return 0;
  return raw.endsWith("ms") ? n : n * 1000;
}
