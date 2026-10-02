// A-17: Ed25519 (RFC 8032 vectors), did:key and the closure-held Signer.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  createSigner,
  CryptoError,
  didKeyFromPublicKey,
  fromHex,
  generateKeyPair,
  keyPairFromSeed,
  parseDidKey,
  parseKeyFile,
  publicKeyFromDidKey,
  serializeKeyFile,
  toBase58btc,
  toHex,
  verificationMethodId,
  verifyEd25519,
} from "../src/crypto";
import { indepBase64url, indepDidKey, indepFromHex, indepPublicKey, testSeed } from "./crypto-independent";

// RFC 8032 section 7.1, TEST 1-3 (public test vectors, not secrets).
const RFC8032 = [
  {
    secret: "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
    public: "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
    message: "",
    signature:
      "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b",
  },
  {
    secret: "4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb",
    public: "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c",
    message: "72",
    signature:
      "92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00",
  },
  {
    secret: "c5aa8df43f9f837bedb7442f31dcb7b166d38535076f094b85ce3a2e0b4458f7",
    public: "fc51cd8e6218a1a38da47ed00230f0580816ed13ba3303ac5deb911548908025",
    message: "af82",
    signature:
      "6291d657deec24024827e69c3abe01a30ce548a284743a445e3680d7db5ac3ac18ff9b538d16f290ae67f760984dc6594a7c15e9716ed28dc027beceea1ec40a",
  },
];

describe("Ed25519 (RFC 8032 vectors)", () => {
  it.each(RFC8032)("signs and verifies vector with public key $public", (v) => {
    const pair = keyPairFromSeed(fromHex(v.secret));
    expect(toHex(pair.publicKey)).toBe(v.public);
    const signer = createSigner(fromHex(v.secret));
    const message = fromHex(v.message);
    expect(toHex(signer.sign(message))).toBe(v.signature);
    expect(verifyEd25519(fromHex(v.signature), message, fromHex(v.public))).toBe(true);
  });

  it("rejects a changed message, a changed signature or another key, and never throws", () => {
    const v = RFC8032[1]!;
    const sig = fromHex(v.signature);
    const pub = fromHex(v.public);
    expect(verifyEd25519(sig, fromHex("73"), pub)).toBe(false);
    const flipped = Uint8Array.from(sig, (b, i) => (i === 10 ? b ^ 1 : b));
    expect(verifyEd25519(flipped, fromHex(v.message), pub)).toBe(false);
    expect(verifyEd25519(sig, fromHex(v.message), fromHex(RFC8032[0]!.public))).toBe(false);
    expect(verifyEd25519(sig.slice(1), fromHex(v.message), pub)).toBe(false);
    expect(verifyEd25519(sig, fromHex(v.message), pub.slice(1))).toBe(false);
  });

  it("generates distinct random key pairs", () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    expect(a.secretKey).toHaveLength(32);
    expect(a.publicKey).toHaveLength(32);
    expect(toHex(a.secretKey)).not.toBe(toHex(b.secretKey));
  });
});

describe("did:key", () => {
  it("encodes 0xed01 || key in base58btc and matches the independent path", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 32, maxLength: 32 }), (seed) => {
        const pub = indepPublicKey(seed);
        const did = didKeyFromPublicKey(pub);
        return did === indepDidKey(pub) && did.startsWith("did:key:z6Mk") && toHex(publicKeyFromDidKey(did)) === toHex(pub);
      }),
      { numRuns: 25 },
    );
  });

  it("names the verification method <did>#<multibase key>", () => {
    const did = didKeyFromPublicKey(indepPublicKey(testSeed("vm")));
    expect(verificationMethodId(did)).toBe(`${did}#${did.slice("did:key:".length)}`);
  });

  it("rejects other multicodecs, lengths and encodings without throwing from parseDidKey", () => {
    const pub = indepPublicKey(testSeed("bad-did"));
    const x25519 = new Uint8Array([0xec, 0x01, ...pub]);
    const short = new Uint8Array([0xed, 0x01, ...pub.slice(1)]);
    const bad = [
      `did:key:z${toBase58btc(x25519)}`,
      `did:key:z${toBase58btc(short)}`,
      `did:key:u${indepBase64url(new Uint8Array([0xed, 0x01, ...pub]))}`,
      "did:web:example.com",
      "did:key:z6Mk",
      `did:key:z${toBase58btc(new Uint8Array([0xed, 0x01, ...pub]))}#frag`,
      "",
    ];
    for (const did of bad) {
      expect(parseDidKey(did)).toBeNull();
      expect(() => publicKeyFromDidKey(did)).toThrow(CryptoError);
    }
  });
});

describe("Signer (private key in a closure, I8)", () => {
  const seed = testSeed("signer");

  it("signs as its did:key and verifies", () => {
    const signer = createSigner(seed);
    expect(signer.did).toBe(indepDidKey(indepPublicKey(seed)));
    const message = new TextEncoder().encode("laisee.log.v1:abc");
    expect(verifyEd25519(signer.sign(message), message, publicKeyFromDidKey(signer.did))).toBe(true);
  });

  it("copies the secret: zeroing the caller's buffer does not change the signer", () => {
    const secret = Uint8Array.from(seed);
    const signer = createSigner(secret);
    const before = toHex(signer.sign(new Uint8Array([1])));
    secret.fill(0);
    expect(toHex(signer.sign(new Uint8Array([1])))).toBe(before);
  });

  it("never serialises key material", () => {
    const signer = createSigner(seed);
    const secretHex = toHex(seed);
    const secretB64u = indepBase64url(seed);
    const views = [JSON.stringify(signer), JSON.stringify({ signer }), String(signer), Object.keys(signer).join(",")];
    for (const view of views) {
      expect(view).not.toContain(secretHex);
      expect(view).not.toContain(secretB64u);
    }
    expect(JSON.parse(JSON.stringify(signer))).toEqual({ did: signer.did });
    expect(Object.isFrozen(signer)).toBe(true);
  });

  it("rejects a secret key of the wrong length", () => {
    expect(() => createSigner(new Uint8Array(31))).toThrow(CryptoError);
  });
});

describe("key files (.keys/, throwaway demo keys)", () => {
  const seed = testSeed("key-file");

  it("round-trips a key file into a Signer with the same did", () => {
    const text = serializeKeyFile("engine", seed);
    const signer = parseKeyFile(JSON.parse(text) as unknown, "engine");
    expect(signer.did).toBe(indepDidKey(indepPublicKey(seed)));
  });

  it("rejects a wrong role, a did that does not match the key, and bad key bytes, without echoing the key", () => {
    const file = JSON.parse(serializeKeyFile("engine", seed)) as Record<string, unknown>;
    const otherDid = indepDidKey(indepPublicKey(testSeed("other")));
    const cases: unknown[] = [
      file,
      { ...file, did: otherDid },
      { ...file, secret_key: "AAAA" },
      { ...file, kind: "other" },
      { ...file, extra: 1 },
      null,
    ];
    for (const [i, c] of cases.entries()) {
      const role = i === 0 ? "delegator" : "engine";
      let message = "";
      try {
        parseKeyFile(c, role);
      } catch (err) {
        message = err instanceof Error ? err.message : String(err);
      }
      expect(message, `case ${i}`).not.toBe("");
      expect(message).not.toContain(indepBase64url(seed));
      expect(message).not.toContain(toHex(seed));
    }
  });

  it("decodes the RFC 8032 secret through a key file", () => {
    const secret = indepFromHex(RFC8032[0]!.secret);
    const signer = parseKeyFile(JSON.parse(serializeKeyFile("delegator", secret)) as unknown, "delegator");
    expect(toHex(publicKeyFromDidKey(signer.did))).toBe(RFC8032[0]!.public);
  });
});
