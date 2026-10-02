// Canonical JSON (sorted keys, RFC 8785 style for plain JSON data) and SHA-256 via @noble/hashes.
// Local on purpose: the engine does not depend on the crypto lane's module. Browser-safe (no node: imports);
// outputs are pinned in test/engine-hash-pinned.test.ts, so the backend swap changed no byte.
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import type { EngineConfig } from "../config";
import type { Cart } from "../generated";

/**
 * Canonical JSON: object keys sorted by UTF-16 code units at every depth, no whitespace, members
 * with undefined values dropped (as JSON.stringify does). Throws TypeError on data JSON cannot carry.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`canonicalJson: non-finite number ${value}`);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v: unknown) => {
      if (v === undefined) throw new TypeError("canonicalJson: undefined inside an array");
      return canonicalJson(v);
    }).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Readonly<Record<string, unknown>>;
    const keys = Object.keys(record).filter((k) => record[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`).join(",")}}`;
  }
  throw new TypeError(`canonicalJson: unsupported ${typeof value}`);
}

/** Lowercase hex SHA-256 of the UTF-8 bytes of text. */
export function sha256Hex(text: string): string {
  return bytesToHex(sha256(utf8ToBytes(text)));
}

/** engine.config_sha256: SHA-256 of the canonical JSON of the thresholds in force. */
export function configSha256(config: EngineConfig): string {
  return sha256Hex(canonicalJson(config));
}

/** Idempotency fingerprint (docs/02 section 6): SHA-256 of the canonical cart without id and proposed_at. */
export function cartFingerprint(cart: Cart): string {
  const { id: _id, proposed_at: _proposedAt, ...priced } = cart;
  return sha256Hex(canonicalJson(priced));
}
