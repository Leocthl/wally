// judge:tune, the B-19/B-20 round: the tuning split through every wording variant, the pre-stated selection rule
// and joint threshold fit, then the held-out split ONCE with the winner, the demo listings and the long-listing
// window pass. Only queries the server (POST /v1/systemone, GET /health); never starts, stops or changes it.
// The run file is rewritten after every stage, so a stopped run resumes without asking the server again, and its
// timestamps show the wording and thresholds were fixed before the held-out run started.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Mandate } from "@laisee/core/generated";
import { SystemOneJudge } from "../system-one-judge";
import { DEFAULT_WINDOWING, type WindowingOptions } from "../windows";
import { loadAnchors } from "./anchors";
import { DEFAULT_CORPUS_DIR, loadCorpus, type CorpusCase } from "./corpus";
import { ServerUnreachableError, gitInfo, loadMandate, readHealth } from "./fit-env";
import type { AnchorResult, FitMeta } from "./report";
import { inputFor, runCorpus } from "./run";
import { fitVariant, rankVariants } from "./select";
import { SPLIT_SALT, assignSplit } from "./split";
import { loadThresholds, type GateThresholds } from "./thresholds";
import type { CaseResult } from "./types";
import { WORDING_VARIANTS, variantById, type QuestionDefs } from "./variants";

export const TUNE_RUN_SCHEMA = "judge-tune-run/v1";

export interface TuneRun {
  readonly schema: typeof TUNE_RUN_SCHEMA;
  readonly meta: FitMeta;
  readonly split: { readonly salt: string; readonly tuningIds: readonly string[]; readonly heldoutIds: readonly string[] };
  readonly registerThresholds: GateThresholds;
  readonly variants: readonly { readonly id: string; readonly results: readonly CaseResult[] }[];
  readonly selection?: { readonly decidedAt: string; readonly ranking: readonly string[]; readonly winner: string; readonly proposed: GateThresholds };
  readonly heldout?: { readonly startedAt: string; readonly finishedAt: string; readonly results: readonly CaseResult[] };
  readonly anchors?: readonly AnchorResult[];
  readonly windows?: { readonly options: WindowingOptions; readonly results: readonly CaseResult[] };
}

export interface TuneOptions {
  readonly baseUrl: string;
  readonly model: string;
  readonly date: string;
  readonly timeoutMs: number;
  /** Where the run file lives between stages. */
  readonly runPath: string;
  readonly corpusDir?: string | undefined;
  readonly log?: ((line: string) => void) | undefined;
}

interface Ctx {
  readonly opts: TuneOptions;
  readonly mandate: Mandate;
  readonly tuning: readonly CorpusCase[];
  readonly heldout: readonly CorpusCase[];
  readonly log: (line: string) => void;
}

const judgeFor = (ctx: Ctx, questions: QuestionDefs, windowing = false): SystemOneJudge =>
  new SystemOneJudge({ provider: "laya", baseUrl: ctx.opts.baseUrl, model: ctx.opts.model, rotations: true, questions, windowing: windowing ? DEFAULT_WINDOWING : false });

function save(path: string, run: TuneRun): TuneRun {
  writeFileSync(path, `${JSON.stringify(run, null, 2)}\n`);
  return run;
}

function resume(path: string, fresh: TuneRun): TuneRun {
  if (!existsSync(path)) return fresh;
  const old = JSON.parse(readFileSync(path, "utf8")) as TuneRun;
  const sameSplit = JSON.stringify(old.split) === JSON.stringify(fresh.split) && old.schema === TUNE_RUN_SCHEMA;
  return sameSplit ? { ...old, meta: fresh.meta } : fresh;
}

async function runVariants(ctx: Ctx, run: TuneRun): Promise<TuneRun> {
  let current = run;
  for (const v of WORDING_VARIANTS) {
    if (current.variants.some((x) => x.id === v.id)) continue;
    const judge = judgeFor(ctx, v.questions);
    ctx.log(`variant ${v.id}: warming up, then ${ctx.tuning.length} tuning cases`);
    await judge.assess(inputFor(ctx.tuning[0]!, ctx.mandate), { timeoutMs: ctx.opts.timeoutMs });
    const results = await runCorpus(ctx.tuning, { judge, timeoutMs: ctx.opts.timeoutMs, mandate: ctx.mandate });
    current = save(ctx.opts.runPath, { ...current, variants: [...current.variants, { id: v.id, results }] });
  }
  return current;
}

function decide(ctx: Ctx, run: TuneRun): TuneRun {
  if (run.selection !== undefined) return run;
  const fits = run.variants.map((v) => fitVariant(v.id, v.results, run.registerThresholds.T_esc));
  const ranking = rankVariants(fits);
  const winner = ranking[0];
  if (winner === undefined) throw new Error("no variant was run");
  ctx.log(`selected ${winner.id}; proposed ${JSON.stringify(winner.fit.thresholds)}`);
  return save(ctx.opts.runPath, { ...run, selection: { decidedAt: new Date().toISOString(), ranking: ranking.map((f) => f.id), winner: winner.id, proposed: winner.fit.thresholds } });
}

async function runHeldout(ctx: Ctx, run: TuneRun, questions: QuestionDefs): Promise<TuneRun> {
  if (run.heldout !== undefined) return run;
  const startedAt = new Date().toISOString();
  ctx.log(`held-out: ${ctx.heldout.length} cases, once`);
  const results = await runCorpus(ctx.heldout, { judge: judgeFor(ctx, questions), timeoutMs: ctx.opts.timeoutMs, mandate: ctx.mandate });
  return save(ctx.opts.runPath, { ...run, heldout: { startedAt, finishedAt: new Date().toISOString(), results } });
}

async function runAnchors(ctx: Ctx, run: TuneRun, questions: QuestionDefs): Promise<TuneRun> {
  if (run.anchors !== undefined) return run;
  const judge = judgeFor(ctx, questions);
  const anchors: AnchorResult[] = [];
  for (const a of loadAnchors(ctx.mandate)) {
    const r = await judge.assess(a.input, { timeoutMs: ctx.opts.timeoutMs });
    anchors.push({ name: a.name, note: a.note, status: r.status, inputTruncated: r.input_truncated === true, live: r.status === "OK" ? (r.answers ?? null) : null, recorded: a.recorded });
  }
  return save(ctx.opts.runPath, { ...run, anchors });
}

async function runWindows(ctx: Ctx, run: TuneRun, questions: QuestionDefs): Promise<TuneRun> {
  if (run.windows !== undefined) return run;
  const long = [...ctx.tuning, ...ctx.heldout].filter((c) => c.listing.text.length > DEFAULT_WINDOWING.windowChars);
  ctx.log(`window pass: ${long.length} long cases`);
  const results = await runCorpus(long, { judge: judgeFor(ctx, questions, true), timeoutMs: ctx.opts.timeoutMs, mandate: ctx.mandate });
  return save(ctx.opts.runPath, { ...run, windows: { options: DEFAULT_WINDOWING, results } });
}

export async function runTune(opts: TuneOptions): Promise<TuneRun> {
  const health = await readHealth(opts.baseUrl, opts.model);
  if (health === null) throw new ServerUnreachableError(opts.baseUrl);
  const split = assignSplit(loadCorpus(opts.corpusDir ?? DEFAULT_CORPUS_DIR));
  const ctx: Ctx = { opts, mandate: loadMandate(), tuning: split.tuning, heldout: split.heldout, log: opts.log ?? (() => undefined) };
  const meta: FitMeta = { date: opts.date, commit: gitInfo(), server: { baseUrl: opts.baseUrl, model: opts.model, revision: health.revision, device: health.device }, rotations: true, timeoutMs: opts.timeoutMs };
  const fresh: TuneRun = {
    schema: TUNE_RUN_SCHEMA,
    meta,
    split: { salt: SPLIT_SALT, tuningIds: split.tuning.map((c) => c.id), heldoutIds: split.heldout.map((c) => c.id) },
    registerThresholds: loadThresholds(),
    variants: [],
  };
  const decided = decide(ctx, await runVariants(ctx, resume(opts.runPath, fresh)));
  const questions = variantById(decided.selection!.winner).questions;
  const withHeldout = await runHeldout(ctx, decided, questions);
  return runWindows(ctx, await runAnchors(ctx, withHeldout, questions), questions);
}
