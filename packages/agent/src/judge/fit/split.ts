// Tuning and held-out split of the judge corpus, fixed before any tuning (B-19, docs/05 "Injection set").
// Rule, deterministic and stratified by family:
//   1. The split unit is the case's `group` when it has one (cases that share text), else the case id.
//   2. A unit belongs to the family (category) of its first case by id.
//   3. Within each family, units are ordered by SHA-256 of `${SPLIT_SALT}:${unit}` (hex, ascending).
//   4. Units at even positions (0, 2, 4, ...) go to tuning, odd positions to held-out.
// So every family with two or more units is in both splits, tuning takes the odd one out, and cases that share
// a group never straddle the split. Adding cases redraws the split: any later addition needs a fresh held-out round.
import { createHash } from "node:crypto";
import type { CorpusCase } from "./corpus";

export const SPLIT_SALT = "laisee-judge-split-v1";
export type Split = "tuning" | "heldout";

export interface SplitAssignment {
  readonly tuning: readonly CorpusCase[];
  readonly heldout: readonly CorpusCase[];
  readonly byId: ReadonlyMap<string, Split>;
}

export const splitUnit = (c: Pick<CorpusCase, "id" | "group">): string => c.group ?? c.id;

const unitHash = (unit: string): string => createHash("sha256").update(`${SPLIT_SALT}:${unit}`, "utf8").digest("hex");

/** Unit -> family of its first case by id. */
function unitFamilies(corpus: readonly CorpusCase[]): ReadonlyMap<string, string> {
  const sorted = [...corpus].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return sorted.reduce((acc, c) => (acc.has(splitUnit(c)) ? acc : new Map([...acc, [splitUnit(c), c.category]])), new Map<string, string>());
}

function unitSplits(corpus: readonly CorpusCase[]): ReadonlyMap<string, Split> {
  const families = unitFamilies(corpus);
  const byFamily = [...families.entries()].reduce<Record<string, string[]>>((acc, [unit, family]) => ({ ...acc, [family]: [...(acc[family] ?? []), unit] }), {});
  return new Map(
    Object.values(byFamily).flatMap((units) =>
      units
        .map((unit) => ({ unit, hash: unitHash(unit) }))
        .sort((a, b) => (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0))
        .map(({ unit }, i): [string, Split] => [unit, i % 2 === 0 ? "tuning" : "heldout"]),
    ),
  );
}

export function assignSplit(corpus: readonly CorpusCase[]): SplitAssignment {
  const units = unitSplits(corpus);
  const byId = new Map(corpus.map((c): [string, Split] => [c.id, units.get(splitUnit(c)) ?? "tuning"]));
  return {
    tuning: corpus.filter((c) => byId.get(c.id) === "tuning"),
    heldout: corpus.filter((c) => byId.get(c.id) === "heldout"),
    byId,
  };
}
