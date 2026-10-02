// judge-fit/v2: wording and thresholds fitted on a tuning split fixed by a hash rule, then one evaluation on the held-out
// split (heldout.atProposed against heldout.atRegister on the same cases). Required: meta.date, split.heldoutN and the
// held-out legit and injected counts at the proposed thresholds. Everything else is optional and read defensively.
import { asArr, asBool, asInt, asNum, asObj, asStr, type Obj } from "./read";
import { fitChip, numbers, readCount, readListing, strings, type Approvals, type GateFit, type JudgeFit, type ThresholdRun, type Variant } from "./judgeFit";
import type { Parsed } from "./types";

function readApprovals(o: Obj | null): Approvals | null {
  const legit = readCount(o?.["legitApproved"]);
  const injected = readCount(o?.["injectedApproved"]);
  if (legit === null || injected === null) return null;
  return { legit, injected, highRisk: readCount(o?.["highRiskApproved"]), outOfScope: readCount(o?.["outOfScopeApproved"]) };
}

function readGate(x: unknown): GateFit | null {
  const o = asObj(x);
  const id = asStr(o?.["id"]);
  const recall = readCount(o?.["recall"]);
  const falseBlock = readCount(o?.["falseBlock"]);
  if (o === null || id === null || recall === null || falseBlock === null) return null;
  return { id, threshold: asNum(o["threshold"]), recall, falseBlock };
}

function readRun(x: unknown): ThresholdRun | null {
  const o = asObj(x);
  const approvals = readApprovals(o);
  if (o === null || approvals === null) return null;
  return { thresholds: numbers(o["thresholds"]), approvals, gates: (asArr(o["gates"]) ?? []).flatMap((g) => readGate(g) ?? []) };
}

function readVariant(x: unknown, winner: string | null): Variant | null {
  const o = asObj(x);
  const id = asStr(o?.["id"]);
  if (o === null || id === null) return null;
  const okCalls = asInt(o["okCalls"]);
  const n = asInt(o["n"]);
  return {
    id,
    idea: asStr(o["idea"]) ?? "",
    rank: asInt(o["rank"]),
    okCalls: okCalls !== null && n !== null && okCalls <= n ? { k: okCalls, n } : null,
    meanAuc: asNum(o["meanAuc"]),
    approvals: readApprovals(asObj(o["tuning"])),
    chosen: id === winner,
  };
}

function readLatency(x: unknown, date: string): JudgeFit["latency"] {
  const o = asObj(x);
  const n = asInt(o?.["n"]);
  const p50 = asNum(o?.["p50"]);
  const p95 = asNum(o?.["p95"]);
  if (n === null || n < 1 || p50 === null || p95 === null) return null;
  return { n, p50, p95, max: asNum(o?.["max"]), chip: fitChip(n, "held-out OK calls", date, null) };
}

export function parseJudgeFitV2(file: string, o: Obj): Parsed<JudgeFit> {
  const meta = asObj(o["meta"]);
  const date = asStr(meta?.["date"]);
  const split = asObj(o["split"]);
  const heldoutN = asInt(split?.["heldoutN"]);
  const heldout = asObj(o["heldout"]);
  const evaluated = readRun(heldout?.["atProposed"]);
  const problems = [
    ...(date === null ? ["the run date (meta.date) is missing"] : []),
    ...(heldoutN === null || heldoutN < 1 ? ["the held-out split size (split.heldoutN) is missing"] : []),
    ...(evaluated === null ? ["the held-out result at the proposed thresholds (heldout.atProposed) is missing or unreadable"] : []),
  ];
  if (date === null || heldoutN === null || heldoutN < 1 || evaluated === null) return { ok: false, file, problems };
  const commit = asStr(asObj(meta?.["commit"])?.["hash"]);
  const tuningN = asInt(split?.["tuningN"]);
  const status = asObj(heldout?.["statusCounts"]);
  const winner = asStr(o["winner"]);
  return {
    ok: true,
    value: {
      file,
      schema: "judge-fit/v2",
      date,
      commit,
      chip: fitChip(heldoutN, "held-out", date, commit),
      tuningChip: tuningN === null || tuningN < 1 ? null : fitChip(tuningN, "tuning", date, commit),
      split: tuningN === null ? null : { tuningN, heldoutN, rule: asStr(split?.["rule"]) ?? "" },
      evaluated,
      baseline: readRun(heldout?.["atRegister"]),
      unfitted: asObj(o["escalate"])?.["searched"] === false ? ["T_esc"] : [],
      fileSaysF38Met: asBool(asObj(heldout?.["f38"])?.["met"]),
      listings: (asArr(o["anchors"]) ?? []).flatMap((a) => readListing(a) ?? []),
      variants: (asArr(o["variants"]) ?? []).flatMap((v) => readVariant(v, winner) ?? []),
      latency: readLatency(heldout?.["latency"], date),
      failedCalls: status === null ? null : (asInt(status["ERROR"]) ?? 0) + (asInt(status["TIMEOUT"]) ?? 0),
      limits: strings(o["limits"]),
    },
  };
}
