// Independent second path for golden vectors (A-17, A-31): only @noble primitives plus tiny local
// encoders written here, so one bug cannot hide in both this file and src/crypto.
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const B64U = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** base58btc (Bitcoin alphabet) via BigInt; leading zero bytes become '1'. */
export function indepBase58(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = "";
  while (n > 0n) {
    out = B58.charAt(Number(n % 58n)) + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = `1${out}`;
  }
  return out;
}

/** base64url without padding, bit by bit. */
export function indepBase64url(bytes: Uint8Array): string {
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  while (bits.length % 6 !== 0) bits += "0";
  let out = "";
  for (let i = 0; i < bits.length; i += 6) out += B64U.charAt(Number.parseInt(bits.slice(i, i + 6), 2));
  return out;
}

export function indepHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function indepFromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Minimal RFC 8785 for ASCII strings, integers, booleans, null, arrays and objects (our data). */
export function indepJcs(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(indepJcs).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${indepJcs(obj[k])}`).join(",")}}`;
}

const enc = new TextEncoder();

export function indepSha256Hex(text: string): string {
  return indepHex(sha256(enc.encode(text)));
}

/** did:key for an Ed25519 public key: 'did:key:z' + base58btc(0xed 0x01 || key). */
export function indepDidKey(publicKey: Uint8Array): string {
  const prefixed = new Uint8Array(2 + publicKey.length);
  prefixed.set([0xed, 0x01], 0);
  prefixed.set(publicKey, 2);
  return `did:key:z${indepBase58(prefixed)}`;
}

/** Deterministic test seed: SHA-256 of a label. Test-only key material, never used outside tests. */
export function testSeed(label: string): Uint8Array {
  return sha256(enc.encode(`laisee-test-seed:${label}`));
}

export function indepPublicKey(seed: Uint8Array): Uint8Array {
  return ed25519.getPublicKey(seed);
}

/** eddsa-jcs-2022 proofValue computed from scratch. */
export function indepProofValue(credential: Record<string, unknown>, seed: Uint8Array): string {
  const { proof, ...unsecured } = credential;
  const { proofValue: _ignored, ...options } = proof as Record<string, unknown>;
  const proofConfig = { ...options, "@context": unsecured["@context"] };
  const hashData = new Uint8Array(64);
  hashData.set(sha256(enc.encode(indepJcs(proofConfig))), 0);
  hashData.set(sha256(enc.encode(indepJcs(unsecured))), 32);
  return `z${indepBase58(ed25519.sign(hashData, seed))}`;
}

/** Log entry hashes and engine signature computed from scratch (log-entry.schema.json). */
export function indepEntryHashes(entry: Record<string, unknown>, seed: Uint8Array) {
  const payloadHash = indepSha256Hex(indepJcs(entry["payload"]));
  const header = {
    v: entry["v"],
    log_id: entry["log_id"],
    seq: entry["seq"],
    kind: entry["kind"],
    ts: entry["ts"],
    prev_hash: entry["prev_hash"],
    payload_hash: payloadHash,
    signer: entry["signer"],
  };
  const entryHash = indepSha256Hex(indepJcs(header));
  const signature = indepBase64url(ed25519.sign(enc.encode(`laisee.log.v1:${entryHash}`), seed));
  return { payloadHash, entryHash, signature };
}

/** Delegator payload signature (laisee.revoke.v1 / laisee.resolve.v1) computed from scratch. */
export function indepDelegatorSignature(domain: string, unsigned: Record<string, unknown>, seed: Uint8Array): string {
  const message = `${domain}:${indepSha256Hex(indepJcs(unsigned))}`;
  return indepBase64url(ed25519.sign(enc.encode(message), seed));
}

/** A Luhn-valid digit string of the given length built at runtime (no card-like literal in the repo, I8). */
export function luhnValidDigits(length: number, lead = "5"): string {
  let body = lead;
  while (body.length < length - 1) body += String((body.length * 7) % 10);
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    let d = Number(body[body.length - 1 - i]);
    if (i % 2 === 0) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  }
  return body + String((10 - (sum % 10)) % 10);
}
