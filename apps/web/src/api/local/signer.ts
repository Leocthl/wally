// M-09 groundwork (KEYS.md): a delegator key that may sign LATER. A WebCrypto non-extractable Ed25519 key signs
// asynchronously, and a confirmation screen or a platform authenticator waits for the shopper. The core Signer port
// stays synchronous (the seal, revocation and escalation-answer signers in @laisee/core are unchanged), so
// signWithAsync bridges the two: a dry run with a placeholder signature captures the exact bytes the core signs, the
// async signer signs those bytes, and a second run uses the real signatures, refusing any byte that changed. The dry
// run's result is thrown away, so the placeholder never leaks out; an error the dry run raises after the capture (a
// check that dislikes the placeholder) is ignored because the signing run repeats every check with the real signature.
// Anything odd fails closed with AsyncSignError.
import { bytesEqual, ED25519_SIGNATURE_BYTES } from "@laisee/core/crypto";
import type { Signer } from "@laisee/core/ports";

/** The delegator's key behind an async boundary. `did` is public; the key itself never leaves the implementation. */
export interface AsyncSigner {
  readonly did: string;
  sign(message: Uint8Array): Promise<Uint8Array>;
}

export class AsyncSignError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AsyncSignError";
  }
}

/** The in-memory implementation: a core Signer (noble Ed25519, secret in a closure) behind the async interface. */
export function memoryAsyncSigner(signer: Signer): AsyncSigner {
  const did = signer.did;
  return Object.freeze({
    did,
    sign: async (message: Uint8Array): Promise<Uint8Array> => signer.sign(message),
    toJSON: (): { did: string } => ({ did }),
  });
}

/** Placeholder of signature length whose base58 form has a real signature's length (schema patterns check it). */
const PLACEHOLDER = new Uint8Array(ED25519_SIGNATURE_BYTES).fill(0xff);

/** Messages the core signing function asks to sign, captured by a dry run with the placeholder signature. */
function captureMessages<T>(did: string, build: (signer: Signer) => T): readonly Uint8Array[] {
  const seen: Uint8Array[] = [];
  try {
    build({ did, sign: (message) => (seen.push(message.slice()), PLACEHOLDER.slice()) });
  } catch (err) {
    // Before any capture this is a real refusal (wrong issuer, bad input): pass it on. After, the signing run decides.
    if (seen.length === 0) throw err;
  }
  return seen;
}

/** Runs a core signing function (sync Signer port) with an AsyncSigner. Rejects on any refusal or inconsistency. */
export async function signWithAsync<T>(signer: AsyncSigner, build: (signer: Signer) => T): Promise<T> {
  const messages = captureMessages(signer.did, build);
  if (messages.length === 0) throw new AsyncSignError("nothing to sign: the signing function asked for no signature");
  const signatures: Uint8Array[] = [];
  // One message at a time: a confirmation screen shows and signs each in turn.
  for (const message of messages) {
    const signature = await signer.sign(message.slice());
    if (!(signature instanceof Uint8Array) || signature.length !== ED25519_SIGNATURE_BYTES) throw new AsyncSignError("the signer returned a malformed signature");
    signatures.push(signature.slice());
  }
  let next = 0;
  return build({
    did: signer.did,
    sign: (message) => {
      const expected = messages[next];
      const signature = signatures[next];
      next += 1;
      if (expected === undefined || signature === undefined || !bytesEqual(expected, message)) {
        throw new AsyncSignError("the bytes to sign changed between the dry run and the signing run");
      }
      return signature.slice();
    },
  });
}
