// judge:tune command line. Run with: pnpm --filter @laisee/agent judge:tune  (tsx src/judge/fit/tune-cli.ts)
// Queries the running local Laya server, then writes data/results/judge-fit-<date>.json and .md and
// data/results/judge-thresholds-proposal.json. --render-only rebuilds the three files from the run file.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { DEFAULT_LAYA_BASE_URL, DEFAULT_LAYA_MODEL } from "../config";
import { DEFAULT_RESULTS_DIR } from "./fit";
import { ServerUnreachableError } from "./fit-env";
import { refreshRecorded, writeTuneOutputs } from "./tune-output";
import { runTune, type TuneRun } from "./tune";

/** Tooling timeout for the tool's own calls; the product limit is F34 and comes from the caller. */
const TUNE_TIMEOUT_MS = 30_000;
const out = (text: string): void => void process.stdout.write(`${text}\n`);
const err = (text: string): void => void process.stderr.write(`${text}\n`);

const OPTIONS = {
  "base-url": { type: "string" },
  model: { type: "string" },
  date: { type: "string" },
  "out-dir": { type: "string" },
  "run-file": { type: "string" },
  "timeout-ms": { type: "string" },
  "render-only": { type: "boolean", default: false },
  /** A previous run file (same split): adds the round comparison section. */
  "previous-run": { type: "string" },
} as const;

/** Date in Hong Kong time (UTC+8, no daylight saving), the team's clock for file names. */
const hkDate = (): string => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);

async function main(): Promise<number> {
  const { values } = parseArgs({ options: OPTIONS });
  const date = values.date ?? hkDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return (err("--date must look like 2026-10-02"), 1);
  const outDir = values["out-dir"] ?? DEFAULT_RESULTS_DIR;
  const runPath = values["run-file"] ?? join(outDir, `judge-tune-run-${date}.json`);
  const timeoutMs = values["timeout-ms"] === undefined ? TUNE_TIMEOUT_MS : Number(values["timeout-ms"]);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return (err("--timeout-ms must be a positive number"), 1);
  try {
    const run = values["render-only"]
      ? (JSON.parse(readFileSync(runPath, "utf8")) as TuneRun)
      : await runTune({ baseUrl: values["base-url"] ?? process.env["LAYA_BASE_URL"] ?? DEFAULT_LAYA_BASE_URL, model: values.model ?? process.env["LAYA_MODEL"] ?? DEFAULT_LAYA_MODEL, date, timeoutMs, runPath, log: err });
    const previous = values["previous-run"] === undefined ? undefined : (JSON.parse(readFileSync(values["previous-run"], "utf8")) as TuneRun);
    for (const path of writeTuneOutputs(refreshRecorded(run), outDir, () => new Date(), previous)) out(`wrote ${path}`);
    return 0;
  } catch (e) {
    err(e instanceof ServerUnreachableError ? e.message : `judge:tune failed: ${e instanceof Error ? e.message : String(e)}`);
    return e instanceof ServerUnreachableError ? 2 : 1;
  }
}

process.exitCode = await main();
