// SHA-256 and canonical JSON for the mock log chain. @noble/hashes is the audited library core uses (docs/02 section 11).
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

export function sha256Hex(text: string): string {
  return bytesToHex(sha256(utf8ToBytes(text)));
}

/** Sorted-key JSON without whitespace (the RFC 8785 subset our payloads use: strings, integers, booleans, null, arrays, objects). */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new RangeError("canonical JSON has no NaN or Infinity");
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) return `[${value.map((v) => canonicalize(v)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`);
  return `{${entries.join(",")}}`;
}
