// Demo keys: the engine (operator) key that signs log entries and the delegator key that seals, revokes and answers
// escalations. DEMO SHORTCUT: the backend holds the delegator's throwaway key and signs on the shopper's behalf; a
// real deployment keeps that key on the shopper's device (src/api/local/KEYS.md). Portable: the Node server loads
// key files from KEY_DIR (server/booth/keys.ts), the on-device client generates keys in memory. Never logged (I8).
import { createSigner, didKeyFromPublicKey, generateKeyPair } from "@laisee/core/crypto";
import type { Signer } from "@laisee/core/ports";

export interface DemoKeys {
  readonly engine: Signer;
  readonly delegator: Signer;
  readonly source: "KEY_DIR" | "ephemeral";
}

/** A fresh in-memory signer; the caller's copy of the secret is wiped at once. */
export function ephemeralSigner(): Signer {
  const pair = generateKeyPair();
  const signer = createSigner(pair.secretKey);
  pair.secretKey.fill(0);
  return signer;
}

export function ephemeralKeys(): DemoKeys {
  return { engine: ephemeralSigner(), delegator: ephemeralSigner(), source: "ephemeral" };
}

/** A throwaway agent identifier: the secret is wiped at once, the planner never holds a key (I4). */
export function throwawayAgentDid(): string {
  const pair = generateKeyPair();
  pair.secretKey.fill(0);
  return didKeyFromPublicKey(pair.publicKey);
}
