// Command-line options for `pnpm harness -- --seed 7 --n 150 --judge live|recorded`. Pure: no files, no network.
import { parseArgs } from "node:util";
import { SCENARIO_COUNT } from "./config";

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export interface CliOptions {
  readonly seed: number;
  readonly n: number;
  readonly judge: "live" | "recorded";
  /** Live runs only: write every model call to a recording so the run can be replayed offline. */
  readonly record: boolean;
  readonly recordingPath: string | null;
  readonly outDir: string | null;
  readonly layaUrl: string;
  /** Live recording only: marks the recording provisional (the judge wording is still being tuned) with this reason. */
  readonly provisional: string | null;
  /** Exit non-zero when an acceptance target [F38] is missed. */
  readonly strict: boolean;
  readonly help: boolean;
}

export const USAGE = [
  "usage: pnpm harness -- --seed 7 --n 150 --judge live|recorded",
  "  --seed N           integer seed (default 7)",
  "  --n N              scenarios, F37 default 150",
  "  --judge MODE       recorded (default, offline) or live (Laya on 127.0.0.1:8808)",
  "  --record           live only: save every model call to data/results/harness-<seed>-recording.json",
  "  --provisional TXT  with --record: label the recording provisional, with the reason (judge wording under tuning)",
  "  --recording PATH   recorded only: recording to replay",
  "  --out DIR          result directory (default data/results)",
  "  --laya-url URL     default $LAYA_BASE_URL or http://127.0.0.1:8808 (loopback only)",
  "  --strict           exit 1 when an acceptance target is missed",
].join("\n");

function integer(raw: string, flag: string, min: number): number {
  if (!/^\d+$/.test(raw) || Number(raw) < min) throw new UsageError(`${flag} must be an integer >= ${min}, got "${raw}"`);
  return Number(raw);
}

export function parseCliArgs(argv: readonly string[], env: Readonly<Record<string, string | undefined>>): CliOptions {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  let values: ReturnType<typeof parseArgs>["values"];
  try {
    ({ values } = parseArgs({
      args: [...args],
      strict: true,
      options: {
        seed: { type: "string" },
        n: { type: "string" },
        judge: { type: "string" },
        record: { type: "boolean" },
        provisional: { type: "string" },
        recording: { type: "string" },
        out: { type: "string" },
        "laya-url": { type: "string" },
        strict: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
    }));
  } catch (err) {
    throw new UsageError(err instanceof Error ? err.message : String(err));
  }
  const judge = (values["judge"] as string | undefined) ?? "recorded";
  if (judge !== "live" && judge !== "recorded") throw new UsageError(`--judge must be live or recorded, got "${judge}"`);
  if (values["record"] === true && judge !== "live") throw new UsageError("--record needs --judge live: only a live run has answers to record");
  if (values["provisional"] !== undefined && values["record"] !== true) throw new UsageError("--provisional labels a recording, so it needs --record");
  return {
    seed: integer((values["seed"] as string | undefined) ?? "7", "--seed", 0),
    n: integer((values["n"] as string | undefined) ?? String(SCENARIO_COUNT.default), "--n", 1),
    judge,
    record: values["record"] === true,
    provisional: (values["provisional"] as string | undefined) ?? null,
    recordingPath: (values["recording"] as string | undefined) ?? null,
    outDir: (values["out"] as string | undefined) ?? null,
    layaUrl: (values["laya-url"] as string | undefined) ?? env["LAYA_BASE_URL"] ?? "http://127.0.0.1:8808",
    strict: values["strict"] === true,
    help: values["help"] === true,
  };
}
