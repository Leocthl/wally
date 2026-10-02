// Entry point: pnpm harness -- --seed 7 --n 150 --judge live|recorded
// The only file that reads the wall clock, touches the file system or prints. Everything else is injected.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCliArgs, UsageError, USAGE, type CliOptions } from "./cli-args";
import { createComponents, createCartBuilder, describeComponents } from "./factory";
import { createLiveSource, createRecordedSource, probeLaya, type JudgeSource } from "./judge/sources";
import { parseRecording } from "./judge/recording";
import { repoMetaReader } from "./report/meta";
import { runHarness, type RunOutput } from "./run";
import { monotonicTimer } from "./timer";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const DEFAULT_OUT = join(REPO_ROOT, "data/results");

const write = (path: string, text: string): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};

function checkpointRevision(): string {
  return readFileSync(join(REPO_ROOT, "services/laya/MODEL_REVISION"), "utf8").trim();
}

async function chooseSource(opts: CliOptions, outDir: string): Promise<{ source: JudgeSource; device: string | null } | string> {
  if (opts.judge === "recorded") {
    const path = resolve(opts.recordingPath ?? join(outDir, `harness-${opts.seed}-recording.json`));
    try {
      return { source: createRecordedSource(parseRecording(JSON.parse(readFileSync(path, "utf8"))), monotonicTimer), device: null };
    } catch (err) {
      return `no usable recording at ${path} (${err instanceof Error ? err.message : String(err)}). Make one with: pnpm harness -- --seed ${opts.seed} --n ${opts.n} --judge live --record`;
    }
  }
  const health = await probeLaya(opts.layaUrl);
  if (health === null) return `Laya is not reachable at ${opts.layaUrl}/health. Start it with services/laya/serve.sh, or run --judge recorded. This run never starts or stops the server and never falls back to another judge.`;
  const source = createLiveSource({ baseUrl: opts.layaUrl, timer: monotonicTimer, revision: checkpointRevision(), record: opts.record });
  return { source, device: health.device };
}

function report(out: RunOutput, files: readonly string[]): void {
  const lines = out.computed.acceptance.map((a) => `${a.id} ${a.pass ? "met" : "MISSED"}: ${a.result.k}/${a.result.n} (${a.target})`);
  console.log([`${out.computed.chip}`, ...lines, `product evidence: ${out.computed.evidence.valid ? "yes" : "no (see evidence.reasons)"}`, ...files.map((f) => `wrote ${f}`)].join("\n"));
}

async function main(): Promise<number> {
  let opts: CliOptions;
  try {
    opts = parseCliArgs(process.argv.slice(2), process.env);
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    console.error(`${err.message}\n\n${USAGE}`);
    return 2;
  }
  if (opts.help) {
    console.log(USAGE);
    return 0;
  }
  const outDir = opts.outDir === null ? DEFAULT_OUT : resolve(opts.outDir);
  const chosen = await chooseSource(opts, outDir);
  if (typeof chosen === "string") {
    console.error(chosen);
    return 2;
  }
  const out = await runHarness({
    seed: opts.seed,
    n: opts.n,
    mode: opts.judge,
    components: createComponents(),
    describe: describeComponents,
    source: chosen.source,
    timer: monotonicTimer,
    meta: repoMetaReader(chosen.device),
    clock: { now: () => new Date() },
    buildCart: createCartBuilder(),
    onProgress: (done, total) => {
      if (done % 25 === 0 || done === total) console.error(`  ${done}/${total} scenarios`);
    },
  });
  const stem = join(outDir, `harness-${opts.seed}-${opts.judge}`);
  const files = [`${stem}.json`, `${stem}.md`];
  write(files[0] as string, `${JSON.stringify(out.result, null, 2)}\n`);
  write(files[1] as string, out.summary);
  if (out.recording !== null) {
    const recordingFile = join(outDir, `harness-${opts.seed}-recording.json`);
    write(recordingFile, `${JSON.stringify(out.recording, null, 2)}\n`);
    files.push(recordingFile);
  }
  report(out, files);
  return opts.strict && out.computed.acceptance.some((a) => !a.pass) ? 1 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    process.exitCode = 1;
  },
);
