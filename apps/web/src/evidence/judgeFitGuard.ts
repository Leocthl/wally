// Guard for data/results/judge-fit-*.json (schema judge-fit/v1, packages/agent judge fit). Required: schema, meta.date and
// the end-to-end view at the thresholds in force (system.current). Gates and demo listings are optional.
import { type FileChip } from "./chip";
import { asArr, asInt, asNum, asObj, asStr, type Obj } from "./read";
import type { Parsed } from "./types";

export const JUDGE_FIT_SCHEMA = "judge-fit/v1";

export interface Count {
  readonly k: number;
  readonly n: number;
}

export interface GateFit {
  readonly id: string;
  readonly thresholdName: string;
  readonly threshold: number | null;
  /** Should-stop cases the gate stopped (k = TP, n = TP + FN). */
  readonly recall: Count;
  /** Should-pass cases the gate stopped (k = FP, n = FP + TN). */
  readonly falseBlock: Count;
}

export interface DemoListing {
  readonly name: string;
  readonly note: string;
  readonly status: string;
  readonly live: Readonly<Record<string, string>>;
  readonly recorded: Readonly<Record<string, string>>;
}

export interface JudgeFit {
  readonly file: string;
  readonly date: string;
  readonly commit: string | null;
  readonly chip: FileChip;
  readonly corpusN: number | null;
  readonly thresholds: Readonly<Record<string, number>>;
  readonly legitApproved: Count;
  readonly legitBlockedIds: readonly string[];
  readonly injectedApproved: Count;
  readonly injectedApprovedIds: readonly string[];
  readonly gates: readonly GateFit[];
  readonly listings: readonly DemoListing[];
  readonly failedCalls: number | null;
  readonly limits: readonly string[];
}

const strings = (x: unknown): readonly string[] => (asArr(x) ?? []).flatMap((s) => (typeof s === "string" ? [s] : []));
const verdicts = (x: unknown): Readonly<Record<string, string>> => Object.fromEntries(Object.entries(asObj(x) ?? {}).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));

function count(k: number | null, n: number | null): Count | null {
  return k !== null && n !== null && k <= n ? { k, n } : null;
}

function readGate(x: unknown): GateFit | null {
  const o = asObj(x);
  const c = asObj(asObj(o?.["current"])?.["confusion"]);
  const [tp, fp, fn, tn] = ["tp", "fp", "fn", "tn"].map((key) => asInt(c?.[key]));
  const id = asStr(o?.["id"]);
  if (o === null || id === null || tp == null || fp == null || fn == null || tn == null) return null;
  return { id, thresholdName: asStr(o["thresholdName"]) ?? "", threshold: asNum(o["currentThreshold"]), recall: { k: tp, n: tp + fn }, falseBlock: { k: fp, n: fp + tn } };
}

function readListing(x: unknown): DemoListing | null {
  const o = asObj(x);
  const name = asStr(o?.["name"]);
  if (o === null || name === null) return null;
  return { name, note: asStr(o["note"]) ?? "", status: asStr(o["status"]) ?? "", live: verdicts(o["liveVerdicts"]), recorded: verdicts(o["recordedVerdicts"]) };
}

function readSystem(o: Obj | null): Pick<JudgeFit, "legitApproved" | "legitBlockedIds" | "injectedApproved" | "injectedApprovedIds"> | null {
  const legit = asObj(o?.["legit"]);
  const injected = asObj(o?.["injected"]);
  const legitApproved = count(asInt(legit?.["approved"]), asInt(legit?.["n"]));
  const injN = asInt(injected?.["n"]);
  const injNotApproved = asInt(injected?.["notApproved"]);
  const injectedApproved = injN !== null && injNotApproved !== null ? count(injN - injNotApproved, injN) : null;
  if (legitApproved === null || injectedApproved === null) return null;
  return { legitApproved, legitBlockedIds: strings(legit?.["blockedIds"]), injectedApproved, injectedApprovedIds: strings(injected?.["approvedIds"]) };
}

export function parseJudgeFit(file: string, raw: unknown): Parsed<JudgeFit> {
  const o = asObj(raw);
  const meta = asObj(o?.["meta"]);
  const date = asStr(meta?.["date"]);
  const system = readSystem(asObj(asObj(o?.["system"])?.["current"]));
  const corpusN = asInt(asObj(o?.["corpus"])?.["n"]);
  const problems = [
    ...(o?.["schema"] === JUDGE_FIT_SCHEMA ? [] : [`the schema is not ${JUDGE_FIT_SCHEMA}`]),
    ...(date === null ? ["the run date (meta.date) is missing"] : []),
    ...(corpusN === null || corpusN < 1 ? ["the corpus size (corpus.n) is missing"] : []),
    ...(system === null ? ["the end-to-end view at the current thresholds (system.current) is missing or unreadable"] : []),
  ];
  if (o === null || date === null || system === null || corpusN === null || problems.length > 0) {
    return { ok: false, file, problems: problems.length > 0 ? problems : ["the file is not a JSON object"] };
  }
  const commit = asStr(asObj(meta?.["commit"])?.["hash"]);
  const thresholds = Object.fromEntries(Object.entries(asObj(o["thresholds"]) ?? {}).flatMap(([k, v]) => (asNum(v) === null ? [] : [[k, v as number]])));
  const chipText = `MEASURED(n=${corpusN}, ${date}${commit ? `, commit=${commit.slice(0, 7)}` : ""})`;
  const status = asObj(asObj(o["run"])?.["statusCounts"]);
  return {
    ok: true,
    value: {
      file,
      date,
      commit,
      chip: { kind: "MEASURED", text: chipText },
      corpusN,
      thresholds,
      ...system,
      gates: (asArr(o["gates"]) ?? []).flatMap((g) => readGate(g) ?? []),
      listings: (asArr(o["anchors"]) ?? []).flatMap((a) => readListing(a) ?? []),
      failedCalls: status === null ? null : (asInt(status["ERROR"]) ?? 0) + (asInt(status["TIMEOUT"]) ?? 0),
      limits: strings(o["limits"]),
    },
  };
}
