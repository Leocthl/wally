// Node-only fixture loader for data/fixtures (@laisee/core/testing/fixtures).
// Every fixture file is an envelope: { fixture, provenance: "SIMULATED", schema, note, data }.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { formatIssues, isSchemaName, validateBySchemaName, type SchemaName, type SchemaTypes } from "../schema";

export const FIXTURES_DIR = fileURLToPath(new URL("../../../../data/fixtures/", import.meta.url));

export interface FixtureEnvelope<T = unknown> {
  readonly fixture: string;
  readonly provenance: "SIMULATED";
  readonly schema: SchemaName;
  readonly note: string;
  readonly data: T;
}

export class FixtureError extends Error {
  constructor(file: string, problem: string) {
    super(`fixture ${file}: ${problem}`);
    this.name = "FixtureError";
  }
}

const ENVELOPE_KEYS = ["fixture", "provenance", "schema", "note", "data"];

/** Relative paths (posix style) of every *.json under data/fixtures, sorted. */
export function listFixtureFiles(dir: string = FIXTURES_DIR): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".json"))
    .map((f) => relative(dir, join(dir, f)).split(sep).join("/"))
    .sort();
}

function parseEnvelope(file: string, raw: unknown): FixtureEnvelope {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new FixtureError(file, "not an object");
  const env = raw as Record<string, unknown>;
  const keys = Object.keys(env).sort();
  if (keys.join() !== [...ENVELOPE_KEYS].sort().join()) throw new FixtureError(file, `envelope keys must be ${ENVELOPE_KEYS.join(", ")}`);
  if (env["provenance"] !== "SIMULATED") throw new FixtureError(file, "provenance must be SIMULATED");
  if (typeof env["fixture"] !== "string" || typeof env["note"] !== "string" || !env["note"].includes("SIMULATED")) {
    throw new FixtureError(file, "fixture must be a string and note must say SIMULATED");
  }
  const schema = env["schema"];
  if (typeof schema !== "string" || !isSchemaName(schema)) throw new FixtureError(file, `unknown schema ${String(schema)}`);
  const result = validateBySchemaName(schema, env["data"]);
  if (!result.ok) throw new FixtureError(file, formatIssues(result.errors));
  return { fixture: env["fixture"], provenance: "SIMULATED", schema, note: env["note"], data: env["data"] };
}

/** Reads and validates one fixture (envelope and data). Throws FixtureError on any problem. */
export function readFixture(file: string, dir: string = FIXTURES_DIR): FixtureEnvelope {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(join(dir, file), "utf8"));
  } catch (err) {
    throw new FixtureError(file, err instanceof Error ? err.message : String(err));
  }
  return parseEnvelope(file, raw);
}

/** Typed data of one fixture; the envelope must name the expected schema. */
export function loadFixture<N extends SchemaName>(file: string, schema: N, dir: string = FIXTURES_DIR): SchemaTypes[N] {
  const env = readFixture(file, dir);
  if (env.schema !== schema) throw new FixtureError(file, `schema is ${env.schema}, expected ${schema}`);
  return env.data as SchemaTypes[N];
}
