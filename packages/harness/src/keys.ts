// Throwaway demo identities for the harness, derived from public labels. They are SIMULATED keys that sign only the
// harness's own in-memory logs and credentials; they protect nothing and are not secrets (CLAUDE.md: demo keys are throwaway).
import { createSigner, didKeyFromPublicKey, keyPairFromSeed, sha256Bytes, utf8 } from "@wally/core/crypto";
import type { Signer } from "@wally/core/ports";

const seedOf = (label: string): Uint8Array => sha256Bytes(utf8(`harness-demo-key/${label}`));

/** did:key of the Ed25519 key derived from a label. */
function didOf(label: string): string {
  return didKeyFromPublicKey(keyPairFromSeed(seedOf(label)).publicKey);
}

export const DELEGATOR_DID: string = didOf("delegator");
export const AGENT_DID: string = didOf("agent");

/** The delegator seals the mandate; the engine signs the log. */
export const delegatorSigner = (): Signer => createSigner(seedOf("delegator"));
export const engineSigner = (): Signer => createSigner(seedOf("engine"));
