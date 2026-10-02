// Optional blocks of a harness result file. Each reader returns null when the block is absent and drops (and names)
// what it cannot read; nothing here invents a value.
import { parseChip } from "./chip";
import { asArr, asBool, asInt, asNum, asObj, asStr, readRate, readRates, type Dropped, type Obj } from "./read";
import { BASELINES, type AcceptanceRow, type BaselineData, type BlockedScenario, type CategoryCell, type CategoryRow, type ComponentInfo, type JudgeFalseAllow, type InjectionCorpus, type Latency } from "./types";

function readLatency(x: unknown, path: string, dropped: Dropped): Latency | null {
  const o = asObj(x);
  if (o === null) return null;
  const chip = parseChip(o["chip"]);
  if (chip === null) {
    dropped.add(path);
    return null;
  }
  if (o["measured"] === false) return { measured: false, note: asStr(o["note"]) ?? "", chip };
  const n = asInt(o["n"]);
  const p50 = asNum(o["p50_ms"]);
  const p95 = asNum(o["p95_ms"]);
  if (o["measured"] !== true || n === null || n < 1 || p50 === null || p95 === null) {
    dropped.add(path);
    return null;
  }
  return { measured: true, n, p50, p95, chip, scope: asStr(o["scope"]) };
}

export function readBaseline(o: Obj, path: string, dropped: Dropped): BaselineData {
  return {
    scenarios: asInt(o["scenarios"]),
    rates: readRates(o, path, dropped, ["latency", "cost_per_decision"]),
    latency: readLatency(o["latency"], `${path}.latency`, dropped),
  };
}

export function readComponents(x: unknown): readonly ComponentInfo[] | null {
  const o = asObj(x);
  if (o === null) return null;
  return Object.entries(o).flatMap(([key, value]) => {
    const c = asObj(value);
    if (c === null) return [];
    return [{ key, name: asStr(c["name"]) ?? key, real: asBool(c["real"]), note: asStr(c["note"]) ?? "" }];
  });
}

export function readEvidence(x: unknown): { readonly valid: boolean; readonly reasons: readonly string[] } | null {
  const o = asObj(x);
  const valid = asBool(o?.["valid_as_product_evidence"]);
  if (o === null || valid === null) return null;
  const reasons = (asArr(o["reasons"]) ?? []).flatMap((r) => (typeof r === "string" ? [r] : []));
  return { valid, reasons };
}

export function readAcceptance(x: unknown, dropped: Dropped): readonly AcceptanceRow[] | null {
  const rows = asArr(x);
  if (rows === null) return null;
  return rows.flatMap((row, i) => {
    const o = asObj(row);
    const id = asStr(o?.["id"]);
    const pass = asBool(o?.["pass"]);
    const result = readRate(o?.["result"], `acceptance[${i}].result`, dropped);
    if (o === null || id === null || pass === null || result === null) {
      dropped.add(`acceptance[${i}]`);
      return [];
    }
    return [{ id, target: asStr(o["target"]) ?? "", evaluatedOn: asStr(o["evaluated_on"]) ?? "B2", result, pass }];
  });
}

function readCell(x: unknown, path: string, dropped: Dropped): CategoryCell | null {
  const o = asObj(x);
  const scenarios = asInt(o?.["scenarios"]);
  const legitimate = asInt(o?.["legitimate"]);
  if (o === null || scenarios === null || legitimate === null) return null;
  return {
    scenarios,
    legitimate,
    completed: readRate(o["completed"], `${path}.completed`, dropped),
    falseBlock: readRate(o["false_block"], `${path}.false_block`, dropped),
    stopBreach: readRate(o["stop_breach"], `${path}.stop_breach`, dropped),
  };
}

export function readCategories(x: unknown, dropped: Dropped): readonly CategoryRow[] | null {
  const rows = asArr(x);
  if (rows === null) return null;
  return rows.flatMap((row, i) => {
    const o = asObj(row);
    const category = asStr(o?.["category"]);
    if (o === null || category === null) {
      dropped.add(`categories[${i}]`);
      return [];
    }
    const cells = Object.fromEntries(BASELINES.flatMap((b) => {
      const cell = readCell(o[b], `categories[${i}].${b}`, dropped);
      return cell ? [[b, cell]] : [];
    }));
    return [{ category, cells }];
  });
}

/** Legitimate scenarios whose B2 purchase did not complete: the false blocks a judge should be able to inspect. */
export function readB2Blocked(x: unknown): readonly BlockedScenario[] | null {
  const rows = asArr(x);
  if (rows === null) return null;
  return rows.flatMap((row) => {
    const o = asObj(row);
    const b2 = asObj(o?.["B2"]);
    const id = asStr(o?.["id"]);
    if (o === null || b2 === null || id === null || o["legitimate"] !== true || b2["completed"] !== false) return [];
    const expected = asObj(o["expected"]);
    return [{
      id,
      category: asStr(o["category"]) ?? "",
      variant: asStr(o["variant"]) ?? "",
      decision: asStr(b2["decision"]) ?? "ERROR",
      rule: asStr(b2["rule"]),
      expected: asStr(expected?.["decision"]) ?? "",
      error: asStr(b2["error"]),
    }];
  });
}

export function readJudgeFalseAllow(x: unknown, dropped: Dropped): JudgeFalseAllow | null {
  const o = asObj(x);
  if (o === null) return null;
  const m = asObj(o["at_mirror_threshold"]);
  const p = "judge_false_allow";
  return {
    falseAllow: readRate(o["false_allow_rate"], `${p}.false_allow_rate`, dropped),
    tuning: readRate(o["tuning_split"], `${p}.tuning_split`, dropped),
    heldout: readRate(o["heldout_split"], `${p}.heldout_split`, dropped),
    atMirror: m === null ? null : {
      falseAllow: readRate(m["false_allow_rate"], `${p}.at_mirror_threshold.false_allow_rate`, dropped),
      tuning: readRate(m["tuning_split"], `${p}.at_mirror_threshold.tuning_split`, dropped),
      heldout: readRate(m["heldout_split"], `${p}.at_mirror_threshold.heldout_split`, dropped),
    },
    notEvaluated: asInt(o["not_evaluated"]),
    unavailable: asInt(o["unavailable_escalated"]),
  };
}

export function readInjectionCorpus(x: unknown, dropped: Dropped): InjectionCorpus | null {
  const o = asObj(x);
  if (o === null) return null;
  const p = "injection_corpus";
  return {
    items: asInt(o["items"]),
    falseAllow: readRate(o["false_allow_rate"], `${p}.false_allow_rate`, dropped),
    tuning: readRate(o["tuning_split"], `${p}.tuning_split`, dropped),
    heldout: readRate(o["heldout_split"], `${p}.heldout_split`, dropped),
    benignFlagged: readRate(o["benign_flagged_rate"], `${p}.benign_flagged_rate`, dropped),
  };
}
