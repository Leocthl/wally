// Cart fingerprint (docs/02 section 6): hex SHA-256(JCS(cart without id and proposed_at)), the bytes an
// escalation answer binds (cart_sha256) and the verifier compares. Same value as the engine's cartFingerprint
// for any schema-valid cart (RFC 8785 here, sorted-key canonical JSON there; they agree on plain JSON data).
// Kept here on purpose: the signing and verifying side must not depend on engine code. Browser-safe.
import { jcsSha256Hex } from "../crypto/jcs";
import type { Cart } from "../generated";

/** Throws CryptoError for data JCS cannot carry (a lone surrogate); a schema-valid cart from a log never does. */
export function cartSha256(cart: Cart): string {
  const { id: _id, proposed_at: _proposedAt, ...priced } = cart;
  return jcsSha256Hex(priced);
}
