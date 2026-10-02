// judge:fit command line. Run with: pnpm --filter @laisee/agent judge:fit  (tsx src/judge/fit/cli.ts)
// Queries the running local Laya server; writes data/results/judge-fit-<date>.json and .md.
import { parseArgs } from "node:util";
import { DEFAULT_LAYA_BASE_URL, DEFAULT_LAYA_MODEL } from "../config";
import { ServerUnreachableError, runFit, type FitOptions } from "./fit";

/** Tooling timeout for the fit's own calls. Not a product limit: the product timeout is F34 and comes from the caller. */
const FIT_TIMEOUT_MS = 30_000;

const USAGE = `judge:fit [--base-url URL] [--model NAME] [--date YYYY-MM-DD] [--out-dir DIR] [--corpus-dir DIR] [--timeout-ms N] [--skip-canonical] [--skip-windows]
  Reads LAYA_BASE_URL and LAYA_MODEL when the flags are absent. Needs the Laya server running (services/laya/serve.sh).
`;

const out = (text: string): void => void process.stdout.write(`${text}\n`);
const err = (text: string): void => void process.stderr.write(`${text}\n`);

const OPTIONS = {
  "base-url": { type: "string" },
  model: { type: "string" },
  date: { type: "string" },
  "out-dir": { type: "string" },
  "corpus-dir": { type: "string" },
  "timeout-ms": { type: "string" },
  "skip-canonical": { type: "boolean", default: false },
  "skip-windows": { type: "boolean", default: false },
  help: { type: "boolean", default: false },
} as const;

/** Flags to run options, or a message saying what is wrong with them. */
function toOptions(values: ReturnType<typeof parseArgs<{ options: typeof OPTIONS }>>["values"]): FitOptions | string {
  const timeoutMs = values["timeout-ms"] === undefined ? FIT_TIMEOUT_MS : Number(values["timeout-ms"]);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return "--timeout-ms must be a positive number";
  const date = values.date ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "--date must look like 2026-10-02";
  return {
    baseUrl: values["base-url"] ?? process.env["LAYA_BASE_URL"] ?? DEFAULT_LAYA_BASE_URL,
    model: values.model ?? process.env["LAYA_MODEL"] ?? DEFAULT_LAYA_MODEL,
    date,
    outDir: values["out-dir"],
    corpusDir: values["corpus-dir"],
    timeoutMs,
    compareCanonical: !values["skip-canonical"],
    compareWindows: !values["skip-windows"],
    log: err,
  };
}

async function main(): Promise<number> {
  const { values } = parseArgs({ options: OPTIONS });
  if (values.help) {
    out(USAGE);
    return 0;
  }
  const options = toOptions(values);
  if (typeof options === "string") {
    err(options);
    return 1;
  }
  try {
    const result = await runFit(options);
    out(`wrote ${result.markdownPath}`);
    out(`wrote ${result.jsonPath}`);
    return 0;
  } catch (e) {
    if (e instanceof ServerUnreachableError) {
      err(e.message);
      return 2;
    }
    err(`judge:fit failed: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}

process.exitCode = await main();
