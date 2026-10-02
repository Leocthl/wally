// Standards conformance on PUBLISHED vectors (audit lane s-audit): W3C vc-di-eddsa eddsa-jcs-2022
// (Recommendation 15 May 2025), RFC 8785 (JCS) and RFC 8032 (Ed25519). Vector data and provenance live in
// test/golden/w3c/. Every value is reproduced with our exported primitives (src/crypto, src/vc) and, where it
// matters, with an independent path written from the spec text using only @noble/curves, @noble/hashes,
// @scure/base and canonicalize.
import { readFileSync } from "node:fs";
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { base58 } from "@scure/base";
import canonicalize from "canonicalize";
import { describe, expect, it } from "vitest";
import {
  concat,
  createSigner,
  CryptoError,
  didKeyFromPublicKey,
  fromHex,
  fromMultibase58btc,
  jcs,
  jcsSha256,
  keyPairFromSeed,
  parseDidKey,
  sha256Hex,
  toHex,
  toMultibase58btc,
  verificationMethodId,
  verifyEd25519,
} from "../src/crypto";
import type { MandateCredential } from "../src/generated";
import { loadFixture } from "../src/testing/fixtures";
import { signMandateCredential, verifyMandateCredential, type UnsignedMandateCredential } from "../src/vc";
import { indepDidKey, indepPublicKey, testSeed } from "./crypto-independent";

type Json = Record<string, unknown>;

function golden<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`./golden/w3c/${name}`, import.meta.url), "utf8")) as T;
}

interface W3cJcsVectors {
  keyPair: { publicKeyMultibase: string; privateKeyMultibase: string };
  unsigned: Json;
  proofConfig: Json;
  proofCanon: string;
  canonDoc: string;
  proofHashHex: string;
  docHashHex: string;
  combinedHashHex: string;
  signatureHex: string;
  proofValue: string;
  signed: Json & { proof: Json };
}
interface Rfc8785Vectors {
  section322: { inputJsonText: string; canonical: string; canonicalUtf8Hex: string };
  section323: { inputJsonText: string; sortedValues: string[] };
  appendixB: { ieee754: string; json: string | null; comment: string }[];
}
interface Rfc8032Vectors {
  vectors: { name: string; secretKey: string; publicKey: string; message: string; signature: string }[];
}

const W3C = golden<W3cJcsVectors>("eddsa-jcs-2022.json");
const JCS = golden<Rfc8785Vectors>("rfc8785-jcs.json");
const ED = golden<Rfc8032Vectors>("rfc8032-ed25519.json");

// ---- independent path, written from the REC text (sections 3.3.1 to 3.3.7) ----------------------------

function canon(value: unknown): string {
  const out = canonicalize(value);
  if (out === undefined) throw new Error("no canonical form");
  return out;
}

function indepMultibase(value: string): Uint8Array {
  if (!value.startsWith("z")) throw new Error("not multibase base58btc");
  return base58.decode(value.slice(1));
}

/** did:key verification method '<did>#<key>': fragment must repeat the key; multicodec ed25519-pub 0xed 0x01. */
function indepKeyFromVerificationMethod(vm: string): Uint8Array {
  const m = /^did:key:(z[1-9A-HJ-NP-Za-km-z]+)#(z[1-9A-HJ-NP-Za-km-z]+)$/.exec(vm);
  if (m === null || m[1] !== m[2]) throw new Error("not a did:key verification method");
  const bytes = indepMultibase(m[1]!);
  if (bytes.length !== 34 || bytes[0] !== 0xed || bytes[1] !== 0x01) throw new Error("not an ed25519-pub key");
  return bytes.slice(2);
}

function indepHashData(canonicalProofConfig: string, transformedData: string): Uint8Array {
  // 3.3.4: proofConfigHash first, then transformedDocumentHash.
  return concatBytes(sha256(utf8ToBytes(canonicalProofConfig)), sha256(utf8ToBytes(transformedData)));
}

/** 3.3.1 Create Proof: proof = clone(options); proof.@context = document @context; proofConfig = JCS(proof). */
function recCreateProof(unsecured: Json, options: Json, secretKey: Uint8Array): Json {
  const proof: Json = { ...options };
  if ("@context" in unsecured) proof["@context"] = unsecured["@context"];
  const hashData = indepHashData(canon(proof), canon(unsecured));
  return { ...unsecured, proof: { ...proof, proofValue: `z${base58.encode(ed25519.sign(hashData, secretKey))}` } };
}

/** 3.3.2 Verify Proof: proofConfig = JCS(proof without proofValue), exactly as carried by the document. */
function recVerifyProof(secured: Json): boolean {
  const { proof, ...unsecuredDocument } = secured as Json & { proof: Json };
  const { proofValue, ...proofOptions } = proof;
  if (proofOptions["type"] !== "DataIntegrityProof" || proofOptions["cryptosuite"] !== "eddsa-jcs-2022") return false;
  if (typeof proofValue !== "string") return false;
  const doc: Json = { ...unsecuredDocument };
  if ("@context" in proofOptions) {
    const docContext = secured["@context"];
    const proofContext = proofOptions["@context"];
    if (!Array.isArray(docContext) || !Array.isArray(proofContext)) return false;
    if (proofContext.some((c: unknown, i: number) => docContext[i] !== c)) return false;
    doc["@context"] = proofContext;
  }
  try {
    const hashData = indepHashData(canon(proofOptions), canon(doc));
    const publicKey = indepKeyFromVerificationMethod(String(proofOptions["verificationMethod"]));
    return ed25519.verify(indepMultibase(proofValue), hashData, publicKey, { zip215: false });
  } catch {
    return false;
  }
}

// ---- our credential (M0 fixture with test-only seeds derived from public labels) -----------------------

const DELEGATOR_SEED = testSeed("delegator");
const AGENT_SEED = testSeed("agent");
const CREATED = new Date("2026-10-03T02:00:00Z");

function unsignedM0(): UnsignedMandateCredential {
  const { proof: _proof, ...fixture } = loadFixture("mandate/m0.credential.json", "mandate-credential");
  return {
    ...fixture,
    issuer: indepDidKey(indepPublicKey(DELEGATOR_SEED)),
    credentialSubject: { ...fixture.credentialSubject, id: indepDidKey(indepPublicKey(AGENT_SEED)) },
  };
}

function signedM0(): MandateCredential {
  return signMandateCredential(unsignedM0(), createSigner(DELEGATOR_SEED), { created: CREATED });
}

function proofOptionsFor(issuer: string, overrides: Json = {}): Json {
  return {
    type: "DataIntegrityProof",
    cryptosuite: "eddsa-jcs-2022",
    created: "2026-10-03T02:00:00.000Z",
    verificationMethod: `${issuer}#${issuer.slice("did:key:".length)}`,
    proofPurpose: "assertionMethod",
    ...overrides,
  };
}

/** Signs exactly like signMandateCredential (proof = options + document @context, hashed as carried), with any options. */
function issuerSigned(unsecured: Json, options: Json): Json {
  const proofConfig = "@context" in unsecured ? { ...options, "@context": unsecured["@context"] } : { ...options };
  const hashData = indepHashData(canon(proofConfig), canon(unsecured));
  return { ...unsecured, proof: { ...proofConfig, proofValue: `z${base58.encode(ed25519.sign(hashData, DELEGATOR_SEED))}` } };
}

/** The delegator our credentials are pinned to (S-VC-1: verification needs the expected issuer). */
const PIN = { expectedIssuer: indepDidKey(indepPublicKey(DELEGATOR_SEED)) } as const;

// ---- W3C vc-di-eddsa eddsa-jcs-2022 ---------------------------------------------------------------------

describe("W3C vc-di-eddsa eddsa-jcs-2022 published test vectors (REC 15 May 2025)", () => {
  const did = `did:key:${W3C.keyPair.publicKeyMultibase}`;
  const privateKey = fromMultibase58btc(W3C.keyPair.privateKeyMultibase);
  const seed = privateKey.slice(2);

  it("decodes the key pair: multicodec prefixes, did:key, verification method fragment", () => {
    expect(Array.from(privateKey.slice(0, 2))).toEqual([0x80, 0x26]); // ed25519-priv varint
    expect(privateKey.length).toBe(34);
    const publicKey = parseDidKey(did);
    expect(publicKey).not.toBeNull();
    expect(toHex(keyPairFromSeed(seed).publicKey)).toBe(toHex(publicKey!));
    expect(didKeyFromPublicKey(publicKey!)).toBe(did);
    expect(createSigner(seed).did).toBe(did);
    expect(verificationMethodId(did)).toBe(W3C.proofConfig["verificationMethod"]);
    expect(bytesToHex(indepKeyFromVerificationMethod(verificationMethodId(did)))).toBe(toHex(publicKey!));
  });

  it("canonicalises proof configuration and document byte for byte (jcs and canonicalize)", () => {
    expect(jcs(W3C.proofConfig)).toBe(W3C.proofCanon);
    expect(jcs(W3C.unsigned)).toBe(W3C.canonDoc);
    expect(canon(W3C.proofConfig)).toBe(W3C.proofCanon);
    expect(canon(W3C.unsigned)).toBe(W3C.canonDoc);
  });

  it("reproduces proofConfigHash, documentHash and hashData with the config hash first", () => {
    expect(sha256Hex(jcs(W3C.proofConfig))).toBe(W3C.proofHashHex);
    expect(sha256Hex(jcs(W3C.unsigned))).toBe(W3C.docHashHex);
    expect(toHex(concat(jcsSha256(W3C.proofConfig), jcsSha256(W3C.unsigned)))).toBe(W3C.combinedHashHex);
    expect(toHex(concat(jcsSha256(W3C.unsigned), jcsSha256(W3C.proofConfig)))).not.toBe(W3C.combinedHashHex);
    expect(bytesToHex(indepHashData(W3C.proofCanon, W3C.canonDoc))).toBe(W3C.combinedHashHex);
  });

  it("options without @context plus the document @context (the proof our signer emits) give the same bytes", () => {
    const { "@context": _ctx, ...optionsWithoutContext } = W3C.proofConfig;
    const proofConfig = { ...optionsWithoutContext, "@context": W3C.unsigned["@context"] }; // Create Proof step 2
    expect(toHex(concat(jcsSha256(proofConfig), jcsSha256(W3C.unsigned)))).toBe(W3C.combinedHashHex);
  });

  it("reproduces the signature and the multibase base58btc proofValue", () => {
    const signature = createSigner(seed).sign(fromHex(W3C.combinedHashHex));
    expect(toHex(signature)).toBe(W3C.signatureHex);
    expect(bytesToHex(ed25519.sign(hexToBytes(W3C.combinedHashHex), seed))).toBe(W3C.signatureHex);
    expect(toMultibase58btc(signature)).toBe(W3C.proofValue);
    expect(toHex(fromMultibase58btc(W3C.proofValue))).toBe(W3C.signatureHex);
    expect(verifyEd25519(signature, fromHex(W3C.combinedHashHex), parseDidKey(did)!)).toBe(true);
  });

  it("the published secured credential carries proof.@context and verifies under the REC algorithm", () => {
    const { proofValue, ...options } = W3C.signed.proof;
    expect(options).toEqual(W3C.proofConfig);
    expect(W3C.signed.proof["@context"]).toEqual(W3C.signed["@context"]);
    expect(proofValue).toBe(W3C.proofValue);
    expect(recVerifyProof(W3C.signed)).toBe(true);
    expect(recVerifyProof({ ...W3C.signed, validFrom: "2023-01-02T00:00:00Z" })).toBe(false);
    const { "@context": _ctx, ...proofWithoutContext } = W3C.signed.proof;
    expect(recVerifyProof({ ...W3C.signed, proof: proofWithoutContext })).toBe(false);
  });

  it("the REC Create Proof path reproduces the published secured credential exactly", () => {
    const { "@context": _ctx, ...options } = W3C.proofConfig;
    expect(recCreateProof(W3C.unsigned, options, seed)).toEqual(W3C.signed);
  });
});

describe("AgentDelegationCredential against the REC eddsa-jcs-2022 algorithm", () => {
  it("signs the same signature bytes as a REC signer (identical hashData)", () => {
    const vc = signedM0();
    const rec = recCreateProof(unsignedM0() as unknown as Json, proofOptionsFor(vc.issuer), DELEGATOR_SEED);
    expect((rec["proof"] as Json)["proofValue"]).toBe(vc.proof.proofValue);
  });

  it("accepts a credential secured by a REC signer (proof carries @context)", () => {
    const rec = recCreateProof(unsignedM0() as unknown as Json, proofOptionsFor(signedM0().issuer), DELEGATOR_SEED);
    expect(recVerifyProof(rec)).toBe(true);
    expect(verifyMandateCredential(rec, PIN)).toEqual({ valid: true, reason: null });
  });

  it("minimal fix for C-1: copying the document @context into proof verifies everywhere, proofValue unchanged", () => {
    const vc = signedM0();
    const fixed = { ...vc, proof: { ...vc.proof, "@context": vc["@context"] } };
    expect(recVerifyProof(fixed)).toBe(true);
    expect(verifyMandateCredential(fixed, PIN)).toEqual({ valid: true, reason: null });
  });

  it("the REC Create Proof path reproduces our signer's output exactly", () => {
    const vc = signedM0();
    expect(recCreateProof(unsignedM0() as unknown as Json, proofOptionsFor(vc.issuer), DELEGATOR_SEED)).toEqual(vc);
  });

  it("a proof without @context (the pre-fix format) fails both the REC verifier and ours", () => {
    const vc = signedM0();
    const { "@context": _ctx, ...legacyProof } = vc.proof;
    const legacy = { ...vc, proof: legacyProof };
    expect(recVerifyProof(legacy as unknown as Json)).toBe(false);
    expect(verifyMandateCredential(legacy, PIN).valid).toBe(false);
  });
});

describe("C-1 (fixed): the emitted proof carries @context (REC 3.3.1 step 2)", () => {
  it("signMandateCredential output verifies under a REC-conformant eddsa-jcs-2022 verifier", () => {
    const vc = signedM0();
    expect(vc.proof["@context"]).toEqual(vc["@context"]); // what we emit since the fix
    expect(recVerifyProof(vc as unknown as Json)).toBe(true); // the verifier hashes the proof as carried
  });

  it("the committed golden log's sealed credential (seq 0) verifies under the REC verifier", () => {
    const line = readFileSync(new URL("./golden/demo-log.jsonl", import.meta.url), "utf8").split("\n")[0] ?? "";
    const sealed = (JSON.parse(line) as { payload: Json }).payload;
    expect(recVerifyProof(sealed)).toBe(true);
    expect(recVerifyProof({ ...sealed, validUntil: "2027-10-31T15:59:59Z" })).toBe(false);
  });
});

describe("verifyMandateCredential rejects validly signed variants (no reliance on a broken signature)", () => {
  const base = unsignedM0() as unknown as Json;
  const issuer = String(base["issuer"]);

  it("the helper produces credentials our verifier accepts (control)", () => {
    expect(verifyMandateCredential(issuerSigned(base, proofOptionsFor(issuer)), PIN)).toEqual({ valid: true, reason: null });
  });

  it.each(["eddsa-rdfc-2022", "ecdsa-jcs-2019", "eddsa-2022", "EDDSA-JCS-2022"])("another cryptosuite %s => SCHEMA", (suite) => {
    const vc = issuerSigned(base, proofOptionsFor(issuer, { cryptosuite: suite }));
    expect(verifyMandateCredential(vc, PIN)).toMatchObject({ valid: false, reason: "SCHEMA" });
  });

  it("another proof type or proof purpose => SCHEMA", () => {
    for (const o of [{ type: "Ed25519Signature2020" }, { proofPurpose: "authentication" }, { proofPurpose: "capabilityInvocation" }]) {
      expect(verifyMandateCredential(issuerSigned(base, proofOptionsFor(issuer, o)), PIN)).toMatchObject({ valid: false, reason: "SCHEMA" });
    }
  });

  it("a missing or different document @context => SCHEMA", () => {
    const { "@context": _ctx, ...noContext } = base;
    expect(verifyMandateCredential(issuerSigned(noContext, proofOptionsFor(issuer)), PIN)).toMatchObject({ valid: false, reason: "SCHEMA" });
    const onlyBase = { ...base, "@context": ["https://www.w3.org/ns/credentials/v2"] };
    expect(verifyMandateCredential(issuerSigned(onlyBase, proofOptionsFor(issuer)), PIN)).toMatchObject({ valid: false, reason: "SCHEMA" });
  });

  it("a proof @context that is only a prefix of the document's (allowed by REC 3.3.2) => SCHEMA (stricter, fail closed)", () => {
    const options = proofOptionsFor(issuer, { "@context": ["https://www.w3.org/ns/credentials/v2"] });
    const vc = recCreateProof(base, options, DELEGATOR_SEED);
    const prefixOnly = { ...vc, proof: { ...(vc["proof"] as Json), "@context": ["https://www.w3.org/ns/credentials/v2"] } };
    expect(verifyMandateCredential(prefixOnly, PIN).valid).toBe(false);
  });

  it("a verification method other than <issuer>#<issuer key>, signed by the issuer key => rejected", () => {
    const other = indepDidKey(indepPublicKey(testSeed("other-delegator")));
    const methods = [`${issuer}#key-1`, `${other}#${other.slice(8)}`, `${issuer}#${other.slice(8)}`, `${other}#${issuer.slice(8)}`];
    for (const verificationMethod of methods) {
      const result = verifyMandateCredential(issuerSigned(base, proofOptionsFor(issuer, { verificationMethod })), PIN);
      expect(result.valid).toBe(false);
      expect(["SCHEMA", "VERIFICATION_METHOD"]).toContain(result.reason);
    }
  });

  it("a modified document or modified proof options after signing => SIGNATURE", () => {
    const vc = issuerSigned(base, proofOptionsFor(issuer));
    const subject = vc["credentialSubject"] as Json;
    const proof = vc["proof"] as Json;
    const variants: Json[] = [
      { ...vc, credentialSubject: { ...subject, intent_text: "HK$900, clothes, verified sellers." } },
      { ...vc, validFrom: "2026-10-03T02:00:00.000Z" },
      { ...vc, proof: { ...proof, created: "2026-10-03T02:00:00Z" } },
    ];
    for (const v of variants) expect(verifyMandateCredential(v, PIN)).toMatchObject({ valid: false, reason: "SIGNATURE" });
  });

  it("created with a UTC offset (valid XSD dateTimeStamp) => SCHEMA: our Timestamp pins 'Z' (stricter than VC-DI)", () => {
    const vc = issuerSigned(base, proofOptionsFor(issuer, { created: "2026-10-03T10:00:00+08:00" }));
    expect(verifyMandateCredential(vc, PIN)).toMatchObject({ valid: false, reason: "SCHEMA" });
  });

  it("non-canonical multibase spellings of the proofValue are rejected", () => {
    const vc = issuerSigned(base, proofOptionsFor(issuer));
    const proof = vc["proof"] as Json;
    const value = String(proof["proofValue"]);
    const spellings = [`z1${value.slice(1)}`, `Z${value.slice(1)}`, `u${value.slice(1)}`, `${value} `, `z${value.slice(1).replace(/1/g, "l")}`];
    for (const proofValue of spellings) {
      if (proofValue === value) continue;
      expect(verifyMandateCredential({ ...vc, proof: { ...proof, proofValue } }, PIN).valid).toBe(false);
    }
  });
});

// ---- RFC 8785 ----------------------------------------------------------------------------------------------

describe("RFC 8785 (JCS) published examples through jcs()", () => {
  it("section 3.2.2 example: text and UTF-8 bytes (section 3.2.4)", () => {
    const value = JSON.parse(JCS.section322.inputJsonText) as unknown;
    const out = jcs(value);
    expect(out).toBe(JCS.section322.canonical);
    expect(bytesToHex(utf8ToBytes(out)).match(/../g)!.join(" ")).toBe(JCS.section322.canonicalUtf8Hex);
  });

  it("section 3.2.3: properties sorted by UTF-16 code units", () => {
    const out = jcs(JSON.parse(JCS.section323.inputJsonText) as unknown);
    const values = Array.from(out.matchAll(/:"([^"]*)"/g), (m) => m[1]);
    expect(values).toEqual(JCS.section323.sortedValues);
  });

  it.each(JCS.appendixB.map((r) => [r.ieee754, r.json, r.comment] as const))("appendix B 0x%s => %s %s", (bits, expected) => {
    const view = new DataView(new ArrayBuffer(8));
    view.setBigUint64(0, BigInt(`0x${bits}`));
    const n = view.getFloat64(0);
    if (expected === null) expect(() => jcs(n)).toThrow(CryptoError);
    else expect(jcs(n)).toBe(expected);
  });

  it("section 3.2.2.2 string rules: control escapes lowercase, short forms, everything else as is", () => {
    const ch = (c: number) => String.fromCharCode(c);
    const bs = ch(92);
    const input = [0x00, 0x08, 0x09, 0x0a, 0x0c, 0x0d, 0x1f, 0x22, 0x2f, 0x5c, 0x7f, 0x2028, 0x2029, 0xfeff].map(ch).join("");
    const expected =
      `"${bs}u0000${bs}b${bs}t${bs}n${bs}f${bs}r${bs}u001f${bs}"/${bs}${bs}` + `${ch(0x7f)}${ch(0x2028)}${ch(0x2029)}${ch(0xfeff)}"`;
    expect(jcs(input)).toBe(expected);
    expect(() => jcs(ch(0xd800))).toThrow(CryptoError);
    expect(() => jcs({ [ch(0xdc00)]: 1 })).toThrow(CryptoError);
  });
});

// ---- RFC 8032 ----------------------------------------------------------------------------------------------

describe("RFC 8032 Ed25519 TEST 1-3 through keyPairFromSeed, createSigner and verifyEd25519", () => {
  it.each(ED.vectors.map((v) => [v.name, v] as const))("%s", (_name, v) => {
    const secret = fromHex(v.secretKey);
    const message = fromHex(v.message);
    expect(toHex(keyPairFromSeed(secret).publicKey)).toBe(v.publicKey);
    const signer = createSigner(secret);
    expect(toHex(signer.sign(message))).toBe(v.signature);
    expect(toHex(parseDidKey(signer.did)!)).toBe(v.publicKey);
    expect(verifyEd25519(fromHex(v.signature), message, fromHex(v.publicKey))).toBe(true);
  });

  const v = ED.vectors[2]!;
  const L = 2n ** 252n + 27742317777372353535851937790883648493n;
  const le = (n: bigint) => Uint8Array.from({ length: 32 }, (_, i) => Number((n >> BigInt(8 * i)) & 0xffn));
  const fromLe = (b: Uint8Array) => b.reduceRight((acc, x) => (acc << 8n) | BigInt(x), 0n);

  it("rejects the malleated signature S + L (RFC 8032 5.1.7 requires S < L)", () => {
    const sig = fromHex(v.signature);
    const malleated = concat(sig.slice(0, 32), le(fromLe(sig.slice(32)) + L));
    expect(verifyEd25519(malleated, fromHex(v.message), fromHex(v.publicKey))).toBe(false);
  });

  it("rejects the small-order key forgery that a ZIP-215 verifier accepts (strict mode matters)", () => {
    const identity = le(1n); // y = 1: the neutral element, order 1
    const forged = concat(identity, new Uint8Array(32)); // R = identity, S = 0 verifies any message under A = identity
    const message = utf8ToBytes("laisee.log.v1:any entry hash");
    expect(ed25519.verify(forged, message, identity, { zip215: true })).toBe(true);
    expect(verifyEd25519(forged, message, identity)).toBe(false);
  });

  it("rejects a non-canonical public key encoding (y >= p)", () => {
    const p = 2n ** 255n - 19n;
    const nonCanonicalIdentity = le(p + 1n);
    expect(verifyEd25519(concat(nonCanonicalIdentity, new Uint8Array(32)), new Uint8Array(0), nonCanonicalIdentity)).toBe(false);
    expect(parseDidKey(`did:key:z${base58.encode(concat(Uint8Array.of(0xed, 0x01), nonCanonicalIdentity))}`)).toBeNull();
  });
});
