// Defensive readers for result files. Unknown extra fields are ignored; a malformed optional part is dropped and named,
// never repaired or guessed (fail closed: no chip or no k/n means no figure).
import { parseChip } from "./chip";
import type { Rate } from "./types";

export type Obj = Readonly<Record<string, unknown>>;

export function asObj(x: unknown): Obj | null {
  return typeof x === "object" && x !== null && !Array.isArray(x) ? (x as Obj) : null;
}

export function asStr(x: unknown): string | null {
  return typeof x === "string" && x.trim() !== "" ? x : null;
}

export function asInt(x: unknown): number | null {
  return typeof x === "number" && Number.isInteger(x) && x >= 0 ? x : null;
}

export function asNum(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null;
}

export function asBool(x: unknown): boolean | null {
  return typeof x === "boolean" ? x : null;
}

export function asArr(x: unknown): readonly unknown[] | null {
  return Array.isArray(x) ? x : null;
}

/** Collects the paths of optional parts that were present but could not be read. */
export class Dropped {
  private readonly paths: string[] = [];
  add(path: string): void {
    this.paths.push(path);
  }
  list(): readonly string[] {
    return [...this.paths];
  }
}

/** A k/n block with a chip. Absent: null silently. Present but malformed: null and the path is recorded. */
export function readRate(x: unknown, path: string, dropped: Dropped, fallbackChip?: unknown): Rate | null {
  if (x === undefined || x === null) return null;
  const o = asObj(x);
  const k = asInt(o?.["k"]);
  const n = asInt(o?.["n"]);
  const chip = parseChip(o?.["chip"] ?? fallbackChip);
  if (o === null || k === null || n === null || k > n || chip === null) {
    dropped.add(path);
    return null;
  }
  return { k, n, chip };
}

/** Reads every k/n block of an object, keyed by its own name. Non-rate fields are skipped, malformed rates dropped. */
export function readRates(o: Obj, path: string, dropped: Dropped, skip: readonly string[]): Readonly<Record<string, Rate>> {
  const out: Record<string, Rate> = {};
  for (const [key, value] of Object.entries(o)) {
    const v = asObj(value);
    if (skip.includes(key) || v === null || !("k" in v || "n" in v)) continue;
    const rate = readRate(v, `${path}.${key}`, dropped);
    if (rate) out[key] = rate;
  }
  return out;
}
