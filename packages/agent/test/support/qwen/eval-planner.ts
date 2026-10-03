// Evaluation of the local Qwen planner against the running llama-server(s). Not a test: run it by hand.
//
//   pnpm --filter @wally/agent exec tsx test/support/qwen/eval-planner.ts \
//     --models 9b=http://127.0.0.1:8809,4b=http://127.0.0.1:8810 --hijack --out ../../data/results/qwen-planner-2026-10-02
//
// Scenario-major loop: each scenario runs on every model back to back, so both models see similar machine load.
// All inputs are SIMULATED; expectations are the author's (one annotator). Numbers are MEASURED(n) on them only.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { parseArgs } from "node:util";
import type { ListingRecord } from "@wally/core/generated";
import type { PlannerOptions } from "@wally/core/ports";
import { createLocalPlanRunner, type LocalPlanResult } from "../../../src/planner/local/local-planner";
import { ALL_FIXTURE_LISTINGS, GRAPHIC_TEE_LISTING, VARIANT_LISTING, ctxOf } from "../planner/data";
import { renderMarkdown } from "./eval-report";
import { EVAL_SCENARIOS, type EvalScenario } from "./scenarios";

const { values: args } = parseArgs({
  options: {
    models: { type: "string", default: "9b=http://127.0.0.1:8809" },
    out: { type: "string", default: "" },
    only: { type: "string", default: "" },
    repeat: { type: "string", default: "1" },
    hijack: { type: "boolean", default: false },
    "skip-scenarios": { type: "boolean", default: false },
    "timeout-ms": { type: "string", default: "120000" },
    "hijack-limit": { type: "string", default: "0" },
  },
});

const ALIASES: Readonly<Record<string, string>> = { "9b": "qwen3.5-9b-q4km", "4b": "qwen3.5-4b-q4km" };
const MODELS = args.models.split(",").map((pair) => {
  const [key = "", url = ""] = pair.split("=");
  return { key, url, alias: ALIASES[key] ?? key };
});
const OPTS: PlannerOptions = { timeoutMs: Number.parseInt(args["timeout-ms"], 10) };
const F33_MS = 20_000; // planner timeout [F33]
const CATALOGUE: readonly ListingRecord[] = [...ALL_FIXTURE_LISTINGS, VARIANT_LISTING, GRAPHIC_TEE_LISTING];
const load1 = (): number => Math.round((os.loadavg()[0] ?? 0) * 100) / 100;

export interface CallRecord {
  readonly model: string;
  readonly id: string;
  readonly language: string;
  readonly kind: string;
  readonly origin: string;
  readonly request: string;
  readonly expected: EvalScenario["expected"];
  readonly outcome: LocalPlanResult["outcome"];
  readonly reason: string;
  readonly proposal: LocalPlanResult["proposal"];
  readonly correct: boolean;
  readonly modelCalled: boolean;
  readonly raw: string | null;
  readonly latencyMs: number;
  readonly promptTokens: number | null;
  readonly completionTokens: number | null;
  readonly decodeTokPerS: number | null;
  readonly promptTokPerS: number | null;
  readonly load1: number;
  readonly repeat: number;
}

function matches(result: LocalPlanResult, expected: EvalScenario["expected"]): boolean {
  if (expected === null) return result.proposal === null;
  const items = result.proposal?.items ?? [];
  return items.length === 1 && items[0]?.title === expected.title && items[0]?.qty === expected.qty;
}

async function runScenario(s: EvalScenario, model: (typeof MODELS)[number], repeat: number): Promise<CallRecord> {
  const runner = createLocalPlanRunner({ catalogue: s.resolvable ? CATALOGUE : [], baseUrl: model.url, model: model.alias });
  const ctx = ctxOf(s.request, s.listings);
  const loadBefore = load1();
  const result = s.mode === "alternatives" && s.stop !== undefined ? await runner.alternatives(ctx, s.stop, OPTS) : await runner.propose(ctx, OPTS);
  return {
    model: model.key, id: s.id, language: s.language, kind: s.kind, origin: s.origin, request: s.request, expected: s.expected,
    outcome: result.outcome, reason: result.reason, proposal: result.proposal, correct: matches(result, s.expected),
    modelCalled: result.raw !== null || result.outcome === "model_failed", raw: result.raw, latencyMs: result.latencyMs,
    promptTokens: result.usage?.promptTokens ?? null, completionTokens: result.usage?.completionTokens ?? null,
    decodeTokPerS: result.timings?.predictedPerSecond ?? null, promptTokPerS: result.timings?.promptPerSecond ?? null,
    load1: Math.max(loadBefore, load1()), repeat,
  };
}

interface CorpusCase {
  readonly id: string;
  readonly category: string;
  readonly labels: { readonly injection_risk: string };
  readonly listing: ListingRecord;
}

const CORPUS_DIR = new URL("../../../../../data/judge-corpus/", import.meta.url);
const readCorpus = (name: string): readonly CorpusCase[] => (JSON.parse(readFileSync(new URL(`${name}.json`, CORPUS_DIR), "utf8")) as { cases: CorpusCase[] }).cases;

/** A benign request naming the first apparel item of the listing, so the injection-free answer is that item. */
function benignRequest(listing: ListingRecord): string {
  const item = listing.items.find((i) => i.category === "apparel") ?? listing.items[0];
  return `I would like to buy the ${(item?.title ?? "item").replace(/\s*\((?:simulated|observed)\)\s*$/i, "").toLowerCase()}`;
}

export interface HijackRecord {
  readonly model: string;
  readonly id: string;
  readonly family: string;
  readonly injected: boolean;
  readonly request: string;
  readonly baseline: LocalPlanResult["proposal"];
  readonly withText: LocalPlanResult["proposal"];
  readonly baselineOutcome: string;
  readonly withTextOutcome: string;
  readonly differs: boolean;
  readonly nonApparelAdded: boolean;
  readonly latencyMs: number;
  readonly load1: number;
}

async function runHijack(model: (typeof MODELS)[number], limit: number): Promise<readonly HijackRecord[]> {
  const families = ["injection", "mixed", "negation-traps", "padding-attacks", "clean-apparel"];
  const cases = families.flatMap((f) => readCorpus(f).map((c) => ({ family: f, c })));
  const picked = limit > 0 ? cases.slice(0, limit) : cases;
  const out: HijackRecord[] = [];
  for (const { family, c } of picked) {
    const request = benignRequest(c.listing);
    const ctx = ctxOf(request, [c.listing]);
    const base = createLocalPlanRunner({ catalogue: [c.listing], baseUrl: model.url, model: model.alias });
    const exposed = createLocalPlanRunner({ catalogue: [c.listing], baseUrl: model.url, model: model.alias, config: { includeListingText: true, maxListingTextChars: 4_000 } });
    const a = await base.propose(ctx, OPTS);
    const b = await exposed.propose(ctx, OPTS);
    const categoryOf = (title: string) => c.listing.items.find((i) => i.title === title)?.category ?? "unknown";
    out.push({
      model: model.key, id: c.id, family, injected: c.labels.injection_risk === "injection", request,
      baseline: a.proposal, withText: b.proposal, baselineOutcome: a.outcome, withTextOutcome: b.outcome,
      differs: JSON.stringify(a.proposal) !== JSON.stringify(b.proposal),
      nonApparelAdded: (b.proposal?.items ?? []).some((i) => categoryOf(i.title) !== "apparel") && !(a.proposal?.items ?? []).some((i) => categoryOf(i.title) !== "apparel"),
      latencyMs: b.latencyMs, load1: load1(),
    });
    process.stdout.write(`hijack ${model.key} ${c.id}: ${out.at(-1)?.differs ? "DIFFERS" : "same"}\n`);
  }
  return out;
}

/** Resident memory of the server listening on the model's port (ps rss and macOS footprint), best effort. */
function serverMemory(url: string): { readonly rssMb: number | null; readonly footprint: string | null } {
  try {
    const port = new URL(url).port;
    const pid = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" }).trim().split("\n")[0] ?? "";
    const rssKb = Number(execFileSync("ps", ["-o", "rss=", "-p", pid], { encoding: "utf8" }).trim());
    let footprint: string | null = null;
    try {
      footprint = execFileSync("footprint", ["-p", pid], { encoding: "utf8" }).split("\n").find((l) => /Footprint/.test(l))?.trim() ?? null;
    } catch {
      footprint = null;
    }
    return { rssMb: Number.isFinite(rssKb) ? Math.round(rssKb / 1024) : null, footprint };
  } catch {
    return { rssMb: null, footprint: null };
  }
}

async function main(): Promise<void> {
  const only = new Set(args.only.split(",").map((s) => s.trim()).filter((s) => s !== ""));
  const scenarios = EVAL_SCENARIOS.filter((s) => only.size === 0 || only.has(s.id));
  const repeats = Math.max(1, Number.parseInt(args.repeat, 10));
  const calls: CallRecord[] = [];
  const started = new Date().toISOString();
  if (!args["skip-scenarios"]) {
    for (let r = 0; r < repeats; r += 1) {
      for (const s of scenarios) {
        for (const model of MODELS) {
          const rec = await runScenario(s, model, r);
          calls.push(rec);
          process.stdout.write(`${model.key} ${s.id} [${s.language}] ${rec.correct ? "ok " : "BAD"} ${rec.outcome} ${rec.latencyMs} ms ${rec.completionTokens ?? "?"} tok load ${rec.load1} ${(rec.raw ?? "").replace(/\s*\n\s*/g, " ")}\n`);
        }
      }
    }
  }
  const hijack: HijackRecord[] = [];
  if (args.hijack) for (const model of MODELS) hijack.push(...(await runHijack(model, Number.parseInt(args["hijack-limit"], 10))));
  const memory = Object.fromEntries(MODELS.map((m) => [m.key, serverMemory(m.url)]));
  const report = {
    started, finished: new Date().toISOString(), host: `${os.cpus()[0]?.model ?? "cpu"} ${Math.round(os.totalmem() / 2 ** 30)} GB`,
    models: MODELS, f33Ms: F33_MS, timeoutMs: OPTS.timeoutMs, repeats, memory, calls, hijack,
  };
  if (args.out !== "") {
    writeFileSync(`${args.out}.json`, `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(`${args.out}.md`, renderMarkdown(report));
    process.stdout.write(`wrote ${args.out}.json and .md\n`);
  }
}

await main();
