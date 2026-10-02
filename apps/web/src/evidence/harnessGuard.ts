// Guard for data/results/harness-*.json (schema laisee.harness.result/v1, packages/harness/src/report/result.ts).
// Required: schema, mode, run.run_at_utc8 and at least one readable rate in B0, B1 or B2. Missing any of these: the file
// is refused with reasons in words. Everything else is optional and read defensively.
import {
  readAcceptance,
  readB2Blocked,
  readBaseline,
  readCategories,
  readComponents,
  readEvidence,
  readInjectionCorpus,
  readJudgeFalseAllow,
} from "./harnessParts";
import { asBool, asInt, asObj, asStr, Dropped, type Obj } from "./read";
import { BASELINES, type BaselineData, type BaselineId, type HarnessRun, type Parsed } from "./types";

export const HARNESS_SCHEMA = "laisee.harness.result/v1";

interface Head {
  readonly mode: "live" | "recorded";
  readonly runAt: string;
  readonly runAtMs: number;
  readonly baselines: Obj;
}

function readHead(o: Obj | null): Head | readonly string[] {
  if (o === null) return ["the file is not a JSON object"];
  const problems: string[] = [];
  if (o["schema"] !== HARNESS_SCHEMA) problems.push(`the schema is ${JSON.stringify(o["schema"] ?? null)}, expected ${HARNESS_SCHEMA}`);
  const mode = o["mode"];
  if (mode !== "live" && mode !== "recorded") problems.push("mode is missing or not live or recorded");
  const runAt = asStr(asObj(o["run"])?.["run_at_utc8"]);
  const runAtMs = runAt === null ? Number.NaN : Date.parse(runAt);
  if (Number.isNaN(runAtMs)) problems.push("the run time (run.run_at_utc8) is missing or unreadable");
  const baselines = asObj(o["baselines"]);
  if (baselines === null) problems.push("the baselines block is missing");
  if (problems.length > 0 || baselines === null || runAt === null) return problems;
  return { mode: mode as Head["mode"], runAt, runAtMs, baselines };
}

function readBaselines(o: Obj, dropped: Dropped): Partial<Record<BaselineId, BaselineData>> {
  return Object.fromEntries(
    BASELINES.flatMap((b) => {
      const block = asObj(o[b]);
      return block === null ? [] : [[b, readBaseline(block, `baselines.${b}`, dropped)]];
    }),
  );
}

function readStrings(x: unknown): Readonly<Record<string, string>> {
  const o = asObj(x);
  return o === null ? {} : Object.fromEntries(Object.entries(o).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
}

export function parseHarnessFile(file: string, raw: unknown): Parsed<HarnessRun> {
  const o = asObj(raw);
  const head = readHead(o);
  if (o === null || !("mode" in head)) return { ok: false, file, problems: head as readonly string[] };
  const dropped = new Dropped();
  const baselines = readBaselines(head.baselines, dropped);
  const anyRate = Object.values(baselines).some((b) => b !== undefined && Object.keys(b.rates).length > 0);
  if (!anyRate) return { ok: false, file, problems: ["the baselines block holds no readable k/n rate for B0, B1 or B2"] };
  const run = asObj(o["run"]);
  const definitions = asObj(o["definitions"]);
  return {
    ok: true,
    value: {
      file,
      mode: head.mode,
      label: asStr(o["label"]),
      provenance: asStr(o["provenance"]),
      runAt: head.runAt,
      runAtMs: head.runAtMs,
      seed: asInt(run?.["seed"]),
      commit: asStr(run?.["commit"]),
      dirty: asBool(run?.["working_tree_dirty"]),
      components: readComponents(o["components"]),
      evidence: readEvidence(o["evidence"]),
      baselines,
      descriptions: readStrings(definitions?.["system_descriptions"]),
      definitions: readStrings(definitions),
      judgeFalseAllow: readJudgeFalseAllow(o["judge_false_allow"], dropped),
      injectionCorpus: readInjectionCorpus(o["injection_corpus"], dropped),
      categories: readCategories(o["categories"], dropped),
      acceptance: readAcceptance(o["acceptance"], dropped),
      b2Blocked: readB2Blocked(o["scenarios"]),
      dropped: dropped.list(),
    },
  };
}
