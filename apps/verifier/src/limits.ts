// Page limits, not log rules. No register ID covers them: all ASSUMED, chosen so one verify stays well under a
// second or two on the demo laptop (one Ed25519 check per entry) and the timeline stays a readable list.
export const LIMITS = Object.freeze({
  /** ASSUMED: largest log text the page reads (characters for paste, bytes for files). */
  logChars: 2 * 1024 * 1024,
  /** ASSUMED: largest public-keys or checkpoint text (both are a few hundred characters). */
  smallChars: 64 * 1024,
  /** ASSUMED: timeline rows drawn before the list is shortened around the first failure. */
  timelineRows: 400,
  /** ASSUMED: characters of a kind or time cell before it is cut with an ellipsis. */
  cellChars: 40,
  /** ASSUMED: hex characters of the head hash shown as its prefix. */
  hashPrefix: 16,
  /** ASSUMED: characters shown either side of the byte Tamper changed. */
  snippetChars: 28,
});
