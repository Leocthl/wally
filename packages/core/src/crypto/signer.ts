// Signer (ports.ts) that keeps the Ed25519 secret key in a closure. The returned object has only `did`,
// `sign` and `toJSON`; JSON, String() and Object.keys never expose key material (I8).
import type { Signer } from "../ports";
import { didKeyFromPublicKey } from "./did-key";
import { keyPairFromSeed, signEd25519 } from "./ed25519";
import { CryptoError } from "./errors";

export function createSigner(secretKey: Uint8Array): Signer {
  const pair = keyPairFromSeed(secretKey); // copies the caller's bytes
  const did = didKeyFromPublicKey(pair.publicKey);
  const secret = pair.secretKey;
  return Object.freeze({
    did,
    sign(message: Uint8Array): Uint8Array {
      if (!(message instanceof Uint8Array)) throw new CryptoError("sign() takes a Uint8Array message");
      return signEd25519(message, secret);
    },
    toJSON(): { did: string } {
      return { did };
    },
    toString(): string {
      return `Signer(${did})`;
    },
  });
}
