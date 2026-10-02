// Test-time only: the boundary validators compiled at run time by ajv (new Function), with the options and refs of
// src/schema/manifest.json. The shipped validators are the ahead-of-time compiled ones (src/schema/compiled); this is
// the cross-check that they behave exactly the same.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ErrorObject, ValidateFunction } from "ajv";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import manifest from "../src/schema/manifest.json" with { type: "json" };

export const SCHEMA_DIR = fileURLToPath(new URL("../../../schemas/", import.meta.url));
export const SCHEMA_ID_BASE = "https://laisee.local/schemas/";

export type ValidatorName = keyof typeof manifest.validators;
export const VALIDATOR_NAMES = Object.keys(manifest.validators) as ValidatorName[];

export function schemaFiles(): readonly { readonly file: string; readonly json: Record<string, unknown> }[] {
  return readdirSync(SCHEMA_DIR)
    .filter((f) => f.endsWith(".schema.json"))
    .sort()
    .map((file) => ({ file, json: JSON.parse(readFileSync(join(SCHEMA_DIR, file), "utf8")) as Record<string, unknown> }));
}

export function dynamicValidators(): Readonly<Record<ValidatorName, ValidateFunction>> {
  const ajv = new Ajv2020({ ...manifest.options });
  addFormats(ajv);
  for (const { json } of schemaFiles()) ajv.addSchema(json);
  const entries = VALIDATOR_NAMES.map((name) => {
    const fn = ajv.getSchema(`${SCHEMA_ID_BASE}${manifest.validators[name]}`);
    if (fn === undefined) throw new Error(`schema not registered: ${manifest.validators[name]}`);
    return [name, fn] as const;
  });
  return Object.fromEntries(entries) as Record<ValidatorName, ValidateFunction>;
}

/** What a validator says about one value: valid or not, and the exact error list (allErrors). */
export interface Verdict {
  readonly valid: boolean;
  readonly errors: readonly { readonly instancePath: string; readonly schemaPath: string; readonly keyword: string; readonly params: unknown; readonly message: string | undefined }[];
}

export function verdictOf(fn: ((data: unknown) => boolean) & { errors?: ErrorObject[] | null }, data: unknown): Verdict {
  const valid = fn(data);
  const errors = (fn.errors ?? []).map(({ instancePath, schemaPath, keyword, params, message }) => ({ instancePath, schemaPath, keyword, params, message }));
  return { valid, errors: valid ? [] : errors };
}
