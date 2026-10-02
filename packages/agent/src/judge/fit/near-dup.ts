// Near-duplicate check for the judge corpus: two cases whose texts share most word 3-shingles would leak
// between the tuning and held-out splits. Han characters count as one token each (no spaces in Chinese).
import type { CorpusCase } from "./corpus";
import { splitUnit } from "./split";

/** Tooling threshold, not a product number: pairs at or above this Jaccard similarity count as near-duplicates. */
export const NEAR_DUPLICATE_JACCARD = 0.4;
const SHINGLE = 3;
const TOKEN = /\p{Script=Han}|[\p{L}\p{N}]+/gu;

export function shingles(text: string): ReadonlySet<string> {
  const words = [...(text.toLowerCase().match(TOKEN) ?? [])];
  if (words.length < SHINGLE) return new Set(words.length === 0 ? [] : [words.join(" ")]);
  return new Set(Array.from({ length: words.length - SHINGLE + 1 }, (_, i) => words.slice(i, i + SHINGLE).join(" ")));
}

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const shared = [...a].filter((x) => b.has(x)).length;
  return shared / (a.size + b.size - shared);
}

export interface NearDuplicate {
  readonly a: string;
  readonly b: string;
  readonly jaccard: number;
}

/** Pairs at or above the threshold, skipping pairs that share a split unit (they already stay together). */
export function nearDuplicatePairs(corpus: readonly CorpusCase[], threshold: number = NEAR_DUPLICATE_JACCARD): readonly NearDuplicate[] {
  const sets = corpus.map((c) => ({ c, s: shingles(c.listing.text) }));
  return sets.flatMap((x, i) =>
    sets.slice(i + 1).flatMap((y): NearDuplicate[] => {
      if (splitUnit(x.c) === splitUnit(y.c)) return [];
      const j = jaccard(x.s, y.s);
      return j >= threshold ? [{ a: x.c.id, b: y.c.id, jaccard: j }] : [];
    }),
  );
}
