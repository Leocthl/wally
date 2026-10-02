// Stable JSON text and SHA-256, for request hashes, cart fingerprints and the result file.
import { createHash } from "node:crypto";

/** Sorted-key JSON of plain data. `undefined` members are dropped; non-finite numbers and non-JSON values throw. */
export function stableStringify(value: unknown): string {
  if (value === undefined || value === null) return "null";
  if (typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new RangeError(`cannot serialise ${value}`);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  if (typeof value !== "object") throw new TypeError(`cannot serialise a ${typeof value}`);
  const record = value as Readonly<Record<string, unknown>>;
  const members = Object.keys(record)
    .filter((k) => record[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`);
  return `{${members.join(",")}}`;
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
