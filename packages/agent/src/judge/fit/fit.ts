// The judge:fit run: corpus and demo listings through the live judge, then JSON and markdown reports.
// It only queries the server (POST /v1/systemone, GET /health); it never starts, stops or changes it.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Mandate } from "@laisee/core/generated";
import { formatIssues, validateMandate } from "@laisee/core/schema";
import { DEFAULT_FIXTURES_DIR } from "../replay-recordings";
import { SystemOneJudge } from "../system-one-judge";
import { loadAnchors } from "./anchors";
import { DEFAULT_CORPUS_DIR, loadCorpus } from "./corpus";
import { renderMarkdown } from "./markdown";
import { buildReport, type AnchorResult, type FitMeta, type FitReport } from "./report";
import { inputFor, runCorpus } from "./run";
import { loadThresholds } from "./thresholds";

export const DEFAULT_RESULTS_DIR = fileURLToPath(new URL("../../../../../data/results/", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));

export interface FitOptions {
  readonly baseUrl: string;
  readonly model: string;
  /** YYYY-MM-DD, used in the file names. */
  readonly date: string;
  readonly outDir?: string | undefined;
  readonly corpusDir?: string | undefined;
  /** Per-call timeout for this tool. Not the product limit (F34): a fit measures, it does not gate. */
  readonly timeoutMs: number;
  readonly compareCanonical: boolean;
  readonly log?: ((line: string) => void) | undefined;
}

export interface FitOutput {
  readonly jsonPath: string;
  readonly markdownPath: string;
  readonly report: FitReport;
}

interface Health {
  readonly revision: string | null;
  readonly device: string | null;
}

async function readHealth(baseUrl: string, model: string): Promise<Health | null> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/health`, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { revisions?: Record<string, string>; checkpoint_devices?: Record<string, string>; device?: string };
    return { revision: body.revisions?.[model]?.slice(0, 8) ?? null, device: body.checkpoint_devices?.[model] ?? body.device ?? null };
  } catch {
    return null;
  }
}

function gitInfo(): FitMeta["commit"] {
  try {
    const run = (...args: string[]): string => execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return { hash: run("rev-parse", "HEAD"), dirty: run("status", "--porcelain").length > 0 };
  } catch {
    return null;
  }
}

function loadMandate(): Mandate {
  const raw = JSON.parse(readFileSync(join(DEFAULT_FIXTURES_DIR, "mandate/m0.json"), "utf8")) as { data: unknown };
  const checked = validateMandate(raw.data);
  if (!checked.ok) throw new Error(`mandate/m0.json: ${formatIssues(checked.errors)}`);
  return checked.value;
}

export class ServerUnreachableError extends Error {
  constructor(baseUrl: string) {
    super(`no judge server answered at ${baseUrl}/health; start services/laya/serve.sh first`);
    this.name = "ServerUnreachableError";
  }
}

export async function runFit(options: FitOptions): Promise<FitOutput> {
  const log = options.log ?? (() => undefined);
  const health = await readHealth(options.baseUrl, options.model);
  if (health === null) throw new ServerUnreachableError(options.baseUrl);
  const corpus = loadCorpus(options.corpusDir ?? DEFAULT_CORPUS_DIR);
  const mandate = loadMandate();
  const thresholds = loadThresholds();
  const make = (rotations: boolean) => new SystemOneJudge({ provider: "laya", baseUrl: options.baseUrl, model: options.model, rotations });
  const common = { timeoutMs: options.timeoutMs, mandate };

  log(`warming up the server (first call after a restart is slow)`);
  await make(true).assess(inputFor(corpus[0]!, mandate), { timeoutMs: options.timeoutMs });
  log(`running ${corpus.length} corpus cases with rotations`);
  const results = await runCorpus(corpus, { ...common, judge: make(true), onProgress: (d, t, id) => log(`  ${d}/${t} ${id}`) });
  log(options.compareCanonical ? "running the same cases in canonical order" : "skipping the canonical pass");
  const canonical = options.compareCanonical ? await runCorpus(corpus, { ...common, judge: make(false) }) : null;

  log("running the demo listings");
  const anchorJudge = make(true);
  const anchors: AnchorResult[] = [];
  for (const a of loadAnchors(mandate)) {
    const record = await anchorJudge.assess(a.input, { timeoutMs: options.timeoutMs });
    anchors.push({ name: a.name, note: a.note, status: record.status, inputTruncated: record.input_truncated === true, live: record.status === "OK" ? (record.answers ?? null) : null, recorded: a.recorded });
  }

  const meta: FitMeta = {
    date: options.date,
    commit: gitInfo(),
    server: { baseUrl: options.baseUrl, model: options.model, revision: health.revision, device: health.device },
    rotations: true,
    timeoutMs: options.timeoutMs,
  };
  const report = buildReport({ meta, thresholds, results, canonical, anchors });
  const outDir = options.outDir ?? DEFAULT_RESULTS_DIR;
  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, `judge-fit-${options.date}.json`);
  const markdownPath = join(outDir, `judge-fit-${options.date}.md`);
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(markdownPath, renderMarkdown(report));
  return { jsonPath, markdownPath, report };
}
