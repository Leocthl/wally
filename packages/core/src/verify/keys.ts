// data/public-keys.json (written by `pnpm keys:gen`, public keys only):
// { note?, engine: [did:key, ...], delegator: did:key, agent?: did:key }. Strict: unknown fields fail.
import { parseDidKey } from "../crypto/did-key";
import type { ValidationResult } from "../schema";
import type { PublicKeys } from "./report";

const ALLOWED = new Set(["note", "engine", "delegator", "agent"]);

const invalid = (message: string): ValidationResult<PublicKeys> => ({
  ok: false,
  errors: [{ path: "/", keyword: "public-keys", message }],
});

const isDidKey = (value: unknown): value is string => typeof value === "string" && parseDidKey(value) !== null;

export function parsePublicKeys(value: unknown): ValidationResult<PublicKeys> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return invalid("public keys must be an object");
  const file = value as Record<string, unknown>;
  const extra = Object.keys(file).filter((k) => !ALLOWED.has(k));
  if (extra.length > 0) return invalid(`unknown fields: ${extra.join(", ")}`);
  const { engine, delegator, agent, note } = file;
  if (!Array.isArray(engine) || engine.length === 0 || !engine.every(isDidKey)) {
    return invalid("engine must be a non-empty array of Ed25519 did:keys");
  }
  if (!isDidKey(delegator)) return invalid("delegator must be an Ed25519 did:key");
  if (agent !== undefined && !isDidKey(agent)) return invalid("agent must be an Ed25519 did:key");
  if (note !== undefined && typeof note !== "string") return invalid("note must be a string");
  return { ok: true, value: { engine: [...engine], delegator } };
}
