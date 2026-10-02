// Stable JSON text and SHA-256, for request hashes, cart fingerprints and the result file.
import { createHash } from "node:crypto";

type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json | undefined };

/** Sorted-key JSON. `undefined` members are dropped; non-finite numbers throw (they have no JSON form). */
export function stableStringify(value: Json | undefined): string {
  if (value === undefined) return "null";
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new RangeError(`cannot serialise ${value}`);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v as Json)).join(",")}]`;
  const record = value as { readonly [key: string]: Json | undefined };
  const members = Object.keys(record)
    .filter((k) => record[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`);
  return `{${members.join(",")}}`;
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
