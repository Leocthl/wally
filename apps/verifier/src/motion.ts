// Motion budget of the entries wipe (motion.css): the rows light in one after another, 40 ms apart, but the stagger is
// capped so the last row starts within about 600 ms however long the log is (each row then takes its own short time
// to settle). Both are design values from the polish pass: ASSUMED, no register ID, and not part of any copy. The CSS
// reads the result as --step on the list and --i on each row.
export const MOTION = Object.freeze({
  /** ASSUMED: gap between two rows lighting in, in ms. */
  staggerMs: 40,
  /** ASSUMED: the longest the stagger may run over the whole list, in ms. */
  wipeMs: 600,
});

/** Gap in ms between two rows for a list of `rows` rows (the checkpoint row counts as one). */
export function staggerStep(rows: number): number {
  return Math.min(MOTION.staggerMs, MOTION.wipeMs / Math.max(1, rows));
}
