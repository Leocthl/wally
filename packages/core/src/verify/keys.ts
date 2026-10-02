// data/public-keys.json (written by `pnpm keys:gen`, public keys only):
// { note?, engine: [did:key, ...], delegator: did:key, agent?: did:key }. Strict: unknown fields fail.
// Roles stay separate: a key listed as both engine and delegator would let the operator forge the
// delegator's consent, so the file is refused (and verifyChain refuses such keys too).
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
  if (engine.includes(delegator)) return invalid("the delegator key must not also be an engine key (separate roles)");
  return { ok: true, value: { engine: [...engine], delegator } };
}

/** verifyChain's own check of keys it was handed (they may not come from parsePublicKeys). Null when usable. */
export function publicKeysProblem(keys: unknown): string | null {
  if (keys === null || typeof keys !== "object") return "no public keys given";
  const { engine, delegator } = keys as { readonly engine?: unknown; readonly delegator?: unknown };
  if (!isDidKey(delegator)) return "no delegator did:key is pinned, so the credential issuer cannot be trusted: refusing to verify";
  if (!Array.isArray(engine) || !engine.every((k) => typeof k === "string")) return "engine keys must be a list of did:keys";
  return engine.includes(delegator) ? "the delegator key is also listed as an engine key: its signatures would prove nothing beyond the operator's" : null;
}
