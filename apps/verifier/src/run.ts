// One Verify press: read the three inputs, then verifyLogText from @wally/core/verify. PASS only when the inputs
// read cleanly AND the report is ok; an exception from the library is shown as NOT VERIFIED (fail closed).
import { parseLogText, verifyLogText, type Checkpoint, type VerifyReport } from "@wally/core/verify";
import { readCheckpoint, readKeys, readLog, type InputError } from "./inputs";
import { buildTimeline, type Timeline } from "./timeline";

export interface Inputs {
  readonly log: string;
  readonly keys: string;
  readonly checkpoint: string;
}

export type RunResult =
  | { readonly kind: "input-error"; readonly errors: readonly InputError[] }
  | { readonly kind: "crashed"; readonly message: string }
  | {
      readonly kind: "checked";
      readonly report: VerifyReport;
      readonly entryCount: number;
      readonly checkpoint: Checkpoint | undefined;
      readonly timeline: Timeline;
    };

export function isPass(result: RunResult | null): boolean {
  return result !== null && result.kind === "checked" && result.report.ok;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : "unknown error";
}

export function runVerification(inputs: Inputs): RunResult {
  const log = readLog(inputs.log);
  const keys = readKeys(inputs.keys);
  const checkpoint = readCheckpoint(inputs.checkpoint);
  if (!log.ok || !keys.ok || !checkpoint.ok) {
    const errors = [log, keys, checkpoint].flatMap((r) => (r.ok ? [] : [r.error]));
    return { kind: "input-error", errors };
  }
  try {
    const report = verifyLogText(log.value, keys.value, checkpoint.value);
    const parsed = parseLogText(log.value);
    const timeline = buildTimeline(parsed, report, checkpoint.value);
    return { kind: "checked", report, entryCount: parsed.entries.length, checkpoint: checkpoint.value, timeline };
  } catch (err) {
    return { kind: "crashed", message: describeError(err) };
  }
}
