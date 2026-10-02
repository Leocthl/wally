// SIMULATED demo for "Load demo log": byte-identical copies of the core golden files (throwaway test keys derived
// from public labels in packages/core/test, NOT the booth keys). test/demo-sync.test.ts fails when they drift.
// Regenerate: UPDATE_GOLDEN=1 pnpm vitest run --project core verify-golden, then
//   cp packages/core/test/golden/demo-{log.jsonl,public-keys.json,checkpoint.json} apps/verifier/src/demo/
import checkpointText from "./demo-checkpoint.json?raw";
import logText from "./demo-log.jsonl?raw";
import keysText from "./demo-public-keys.json?raw";

export interface DemoTexts {
  readonly log: string;
  readonly keys: string;
  readonly checkpoint: string;
}

export const DEMO: DemoTexts = Object.freeze({ log: logText, keys: keysText, checkpoint: checkpointText });
