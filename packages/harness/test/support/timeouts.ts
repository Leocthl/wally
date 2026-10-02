// Explicit bounds for every test that replays recorded answers, runs a pass over scenarios or talks to a live server. The
// 5 s default is far too short on a shared machine: its load average passes 100 when several agents run their suites at once.
/** One replay, one live call, or a few scenarios. */
export const STEP_MS = 60_000;
/** A pass over n = 150, or a few of them. */
export const RUN_MS = 240_000;
/** Hundreds of scenarios through the full pipeline (real log, rail and executor each). */
export const SWEEP_MS = 360_000;
