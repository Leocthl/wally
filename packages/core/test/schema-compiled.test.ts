// The shipped validators are compiled ahead of time (src/schema/compiled, ajv standalone): no new Function at run time,
// so the verifier page and the PWA need no 'unsafe-eval'. This cross-checks them against ajv compiling the same
// schemas at run time with the same options: identical verdicts and identical error lists on every schema example,
// every fixture and golden log entry, a mutation corpus built from them (missing and extra keys, wrong types, bad
// date-time and uri formats, flipped if/then/else discriminators, too-long strings, bad numbers) and random JSON.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import * as compiled from "../src/schema/compiled/validators";
import * as shipped from "../src/schema";
import { dynamicValidators, schemaFiles, VALIDATOR_NAMES, verdictOf, type ValidatorName } from "./schema-dynamic";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Fn = ((data: unknown) => boolean) & { errors?: null | [] };

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const DYNAMIC = dynamicValidators();
const COMPILED = compiled as unknown as Readonly<Record<ValidatorName, Fn>>;

function jsonFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? jsonFiles(join(dir, d.name)) : d.name.endsWith(".json") ? [join(dir, d.name)] : []));
}

/** Valid samples: schema examples, fixture envelopes' data, the golden demo log. */
function samples(): readonly Json[] {
  const examples = schemaFiles().flatMap(({ json }) => (json["examples"] ?? []) as Json[]);
  const fixtures = jsonFiles(join(ROOT, "data/fixtures")).map((f) => (JSON.parse(readFileSync(f, "utf8")) as { data: Json }).data);
  const golden = readFileSync(join(ROOT, "packages/core/test/golden/demo-log.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as Json);
  return [...examples, ...fixtures, ...golden];
}

/** Values the if/then/else rules switch on, collected from the samples (plus the opposite booleans). */
const DISCRIMINATORS = ["outcome", "status", "result", "kind", "input_truncated", "event", "choice", "verdict"];

function discriminatorValues(values: readonly Json[]): ReadonlyMap<string, readonly Json[]> {
  const seen = new Map<string, Set<string>>();
  const walk = (v: Json): void => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v === null || typeof v !== "object") return;
    for (const [k, child] of Object.entries(v)) {
      if (DISCRIMINATORS.includes(k)) seen.set(k, new Set([...(seen.get(k) ?? []), JSON.stringify(child), "true", "false", '"UNKNOWN"']));
      walk(child);
    }
  };
  values.forEach(walk);
  return new Map([...seen].map(([k, set]) => [k, [...set].map((s) => JSON.parse(s) as Json)]));
}

const BAD_STRINGS: readonly Json[] = ["", "x".repeat(5_000), "2026-13-45T25:61:61Z", "2026-10-04 05:00:00", "not a uri", "http//missing-colon", "dec_", "1".repeat(16)];
const BAD_NUMBERS: readonly Json[] = [-1, 0, 1.5, 1e21, 2 ** 53];

/** Mutants of one sample: every leaf replaced, every key dropped, an extra key per object, discriminators flipped. */
function mutants(value: Json, flips: ReadonlyMap<string, readonly Json[]>, depth = 0): Json[] {
  if (depth > 6) return [];
  if (Array.isArray(value)) {
    const inner = value.slice(0, 2).flatMap((child, i) => mutants(child, flips, depth + 1).map((m) => value.map((c, j) => (j === i ? m : c))));
    return [[], [...value, ...value.slice(0, 1)], ...inner];
  }
  if (value === null || typeof value !== "object") {
    const swaps: Json[] = [null, true, "text", 7, { a: 1 }, [1]];
    return [...swaps, ...(typeof value === "string" ? BAD_STRINGS : []), ...(typeof value === "number" ? BAD_NUMBERS : [])];
  }
  const keys = Object.keys(value);
  const dropped = keys.map((k) => Object.fromEntries(Object.entries(value).filter(([key]) => key !== k)));
  const flipped = keys.flatMap((k) => (flips.get(k) ?? []).map((v) => ({ ...value, [k]: v })));
  const deeper = keys.flatMap((k) => mutants(value[k] as Json, flips, depth + 1).map((m) => ({ ...value, [k]: m })));
  return [{ ...value, unexpected_key: 1 }, ...dropped, ...flipped, ...deeper];
}

/** Compiled and run-time verdicts must be identical; the message is built only on a mismatch. Returns the verdict. */
function agree(name: ValidatorName, data: unknown): boolean {
  const ours = verdictOf(COMPILED[name], data);
  const theirs = verdictOf(DYNAMIC[name], data);
  if (!isDeepStrictEqual(ours, theirs)) expect(ours, `${name} on ${JSON.stringify(data).slice(0, 300)}`).toEqual(theirs);
  return theirs.valid;
}

describe("compiled validators", () => {
  const valid = samples();
  const flips = discriminatorValues(valid);

  it("export exactly the manifest's validators, each a plain function", () => {
    expect(Object.keys(compiled).sort()).toEqual([...VALIDATOR_NAMES].sort());
    for (const name of VALIDATOR_NAMES) expect(typeof COMPILED[name]).toBe("function");
  });

  it("back every shipped validator (no run-time compile left in src/schema)", () => {
    const source = readFileSync(join(ROOT, "packages/core/src/schema/validators.ts"), "utf8");
    expect(source).not.toMatch(/from "ajv\/dist\/2020"|from "ajv-formats"|new Ajv/);
    for (const name of VALIDATOR_NAMES) expect(typeof (shipped as Record<string, unknown>)[name]).toBe("function");
  });

  it("agree with run-time ajv on every valid sample, for every validator", () => {
    expect(valid.length).toBeGreaterThan(40);
    for (const data of valid) for (const name of VALIDATOR_NAMES) agree(name, data);
  });

  it("agree on a mutation corpus: formats, conditionals, missing and extra keys, wrong types, limits", () => {
    const corpus = valid.flatMap((v) => mutants(v, flips));
    expect(corpus.length).toBeGreaterThan(5_000);
    let invalid = 0;
    for (const data of corpus) {
      for (const name of VALIDATOR_NAMES) if (!agree(name, data)) invalid += 1;
    }
    expect(invalid).toBeGreaterThan(corpus.length);
  }, 120_000);

  it("agree on the format and conditional edge cases by name", () => {
    const decision = valid.find((v) => shipped.validateDecision(v).ok) as { [key: string]: Json } | undefined;
    const judge = valid.find((v) => shipped.validateJudgeRecord(v).ok) as { [key: string]: Json } | undefined;
    if (decision === undefined || judge === undefined) throw new Error("samples lack a decision or a judge record");
    const cases: readonly [ValidatorName, Json][] = [
      ["validateDecision", { ...decision, outcome: "APPROVE" }],
      ["validateDecision", { ...decision, outcome: "ESCALATE" }],
      ["validateDecision", { ...decision, ts: "2026-02-30T10:00:00Z" }],
      ["validateJudgeRecord", { ...judge, status: "OK", answers: undefined as unknown as Json }],
      ["validateJudgeRecord", { ...judge, status: "OK", input_truncated: true }],
      ["validateJudgeRecord", { ...judge, status: "ERROR", input_truncated: true }],
    ];
    for (const [name, data] of cases) agree(name, JSON.parse(JSON.stringify(data)) as Json);
  });

  it("agree on random JSON (fast-check)", () => {
    fc.assert(
      fc.property(fc.jsonValue({ maxDepth: 4 }), (data) => {
        for (const name of VALIDATOR_NAMES) agree(name, data);
      }),
      { numRuns: 300, seed: 7 },
    );
  }, 60_000);
});
