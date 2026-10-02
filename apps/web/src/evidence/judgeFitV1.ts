// judge-fit/v1: one fit on all cases, no held-out split (main before the tuning lane). Required: meta.date, corpus.n and
// system.current with legit and injected counts. Fit and test are the same cases, which the panel says in its limits.
import { asArr, asInt, asNum, asObj, asStr, type Obj } from "./read";
import { count, fitChip, numbers, readListing, strings, type GateFit, type JudgeFit } from "./judgeFit";
import type { Parsed } from "./types";

function readGate(x: unknown): GateFit | null {
  const o = asObj(x);
  const c = asObj(asObj(o?.["current"])?.["confusion"]);
  const [tp, fp, fn, tn] = ["tp", "fp", "fn", "tn"].map((key) => asInt(c?.[key]));
  const id = asStr(o?.["id"]);
  if (o === null || id === null || tp == null || fp == null || fn == null || tn == null) return null;
  return { id, threshold: asNum(o["currentThreshold"]), recall: { k: tp, n: tp + fn }, falseBlock: { k: fp, n: fp + tn } };
}

function readCurrent(o: Obj | null): Pick<JudgeFit["evaluated"], "approvals"> | null {
  const legit = asObj(o?.["legit"]);
  const injected = asObj(o?.["injected"]);
  const legitApproved = count(asInt(legit?.["approved"]), asInt(legit?.["n"]));
  const injN = asInt(injected?.["n"]);
  const injNotApproved = asInt(injected?.["notApproved"]);
  const injectedApproved = injN !== null && injNotApproved !== null && injNotApproved <= injN ? count(injN - injNotApproved, injN) : null;
  if (legitApproved === null || injectedApproved === null) return null;
  return { approvals: { legit: legitApproved, injected: injectedApproved, highRisk: null, outOfScope: null } };
}

export function parseJudgeFitV1(file: string, o: Obj): Parsed<JudgeFit> {
  const meta = asObj(o["meta"]);
  const date = asStr(meta?.["date"]);
  const current = asObj(asObj(o["system"])?.["current"]);
  const read = readCurrent(current);
  const corpusN = asInt(asObj(o["corpus"])?.["n"]);
  const problems = [
    ...(date === null ? ["the run date (meta.date) is missing"] : []),
    ...(corpusN === null || corpusN < 1 ? ["the corpus size (corpus.n) is missing"] : []),
    ...(read === null ? ["the end-to-end view at the current thresholds (system.current) is missing or unreadable"] : []),
  ];
  if (date === null || corpusN === null || corpusN < 1 || read === null) return { ok: false, file, problems };
  const commit = asStr(asObj(meta?.["commit"])?.["hash"]);
  const status = asObj(asObj(o["run"])?.["statusCounts"]);
  return {
    ok: true,
    value: {
      file,
      schema: "judge-fit/v1",
      date,
      commit,
      chip: fitChip(corpusN, "", date, commit),
      tuningChip: null,
      split: null,
      evaluated: { thresholds: numbers(o["thresholds"]), approvals: read.approvals, gates: (asArr(o["gates"]) ?? []).flatMap((g) => readGate(g) ?? []) },
      baseline: null,
      unfitted: [],
      fileSaysF38Met: null,
      listings: (asArr(o["anchors"]) ?? []).flatMap((a) => readListing(a) ?? []),
      variants: [],
      latency: null,
      failedCalls: status === null ? null : (asInt(status["ERROR"]) ?? 0) + (asInt(status["TIMEOUT"]) ?? 0),
      limits: strings(o["limits"]),
    },
  };
}
