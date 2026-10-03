// The judge:fit run: corpus and demo listings through the live judge, then JSON and markdown reports.
// It only queries the server (POST /v1/systemone, GET /health); it never starts, stops or changes it.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SystemOneJudge } from "../system-one-judge";
import { DEFAULT_WINDOWING } from "../windows";
import { loadAnchors } from "./anchors";
import { DEFAULT_CORPUS_DIR, loadCorpus } from "./corpus";
import { ServerUnreachableError, gitInfo, loadMandate, readHealth } from "./fit-env";
import { renderMarkdown } from "./markdown";
import { buildReport, type AnchorResult, type FitMeta, type FitReport } from "./report";
import { inputFor, runCorpus } from "./run";
import { loadThresholds } from "./thresholds";

export const DEFAULT_RESULTS_DIR = fileURLToPath(new URL("../../../../../data/results/", import.meta.url));
export { ServerUnreachableError } from "./fit-env";

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
  /** Also judge the listings longer than one window in windows and report the difference. */
  readonly compareWindows: boolean;
  readonly log?: ((line: string) => void) | undefined;
}

export interface FitOutput {
  readonly jsonPath: string;
  readonly markdownPath: string;
  readonly report: FitReport;
}

export async function runFit(options: FitOptions): Promise<FitOutput> {
  const log = options.log ?? (() => undefined);
  const health = await readHealth(options.baseUrl, options.model);
  if (health === null) throw new ServerUnreachableError(options.baseUrl);
  const corpus = loadCorpus(options.corpusDir ?? DEFAULT_CORPUS_DIR);
  const mandate = loadMandate();
  const thresholds = loadThresholds();
  // languageGate off: the fit measures the raw checkpoint on the whole corpus, zh-HK cases included (corpus README).
  const make = (rotations: boolean, windowing = false) =>
    new SystemOneJudge({ provider: "laya", baseUrl: options.baseUrl, model: options.model, rotations, windowing: windowing ? DEFAULT_WINDOWING : false, languageGate: false });
  const common = { timeoutMs: options.timeoutMs, mandate };

  log(`warming up the server (first call after a restart is slow)`);
  await make(true).assess(inputFor(corpus[0]!, mandate), { timeoutMs: options.timeoutMs });
  log(`running ${corpus.length} corpus cases with rotations`);
  const results = await runCorpus(corpus, { ...common, judge: make(true), onProgress: (d, t, id) => log(`  ${d}/${t} ${id}`) });
  log(options.compareCanonical ? "running the same cases in canonical order" : "skipping the canonical pass");
  const canonical = options.compareCanonical ? await runCorpus(corpus, { ...common, judge: make(false) }) : null;

  const long = corpus.filter((c) => c.listing.text.length > DEFAULT_WINDOWING.windowChars);
  log(options.compareWindows ? `running ${long.length} long cases in windows` : "skipping the window pass");
  const windowed = options.compareWindows && long.length > 0 ? { options: DEFAULT_WINDOWING, results: await runCorpus(long, { ...common, judge: make(true, true) }) } : null;

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
  const report = buildReport({ meta, thresholds, results, canonical, windowed, anchors });
  const outDir = options.outDir ?? DEFAULT_RESULTS_DIR;
  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, `judge-fit-${options.date}.json`);
  const markdownPath = join(outDir, `judge-fit-${options.date}.md`);
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(markdownPath, renderMarkdown(report));
  return { jsonPath, markdownPath, report };
}
