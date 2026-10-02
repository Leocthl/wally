// Determinism, config pinning and cart fingerprint (idempotency, docs/02 section 6).
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ENGINE_CONFIG } from "../src/config";
import { ENGINE_VERSION, canonicalJson, cartFingerprint, configSha256, createEngine, engine } from "../src/engine";
import { CART_A1, CART_A3, JUDGE_TEE, M0, PACKET_INITIAL, PROOF_OK, at } from "./engine-helpers";

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

describe("canonicalJson (sorted keys, RFC 8785 style for JSON data)", () => {
  it("sorts keys at every depth and drops undefined members", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: true, y: null }], c: "x" }, u: undefined })).toBe('{"a":{"c":"x","d":[2,{"y":null,"z":true}]},"b":1}');
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
  });

  it.each([[Number.NaN], [Number.POSITIVE_INFINITY], [10n], [() => 1], [[undefined]]])("rejects non-JSON data %p", (v) => {
    expect(() => canonicalJson(v)).toThrow(TypeError);
  });
});

describe("engine.config_sha256 pins the thresholds in force", () => {
  it("equals SHA-256 of the canonical JSON of the config", () => {
    expect(configSha256(ENGINE_CONFIG)).toBe(sha(canonicalJson(ENGINE_CONFIG)));
    expect(engine.configSha256).toBe(configSha256(ENGINE_CONFIG));
    const d = engine.decide(M0, PACKET_INITIAL, CART_A1, JUDGE_TEE, at("2026-10-03T02:05:00Z"), undefined, PROOF_OK);
    expect(d.engine).toEqual({ version: ENGINE_VERSION, config_sha256: engine.configSha256 });
  });

  it("changes when a threshold changes, and the engine applies the override", () => {
    const strict = createEngine({ config: { ...ENGINE_CONFIG, judge: { ...ENGINE_CONFIG.judge, t_scope: 0.9 } }, version: "core@test+abc123" });
    expect(strict.configSha256).not.toBe(engine.configSha256);
    const d = strict.decide(M0, PACKET_INITIAL, CART_A1, JUDGE_TEE, at("2026-10-03T02:05:00Z"), undefined, PROOF_OK);
    expect(d).toMatchObject({ outcome: "ESCALATE", explanation: { template_id: "R10.scope" }, engine: { version: "core@test+abc123" } });
  });

  it("refuses an invalid config at construction (fail fast)", () => {
    expect(() => createEngine({ config: { ...ENGINE_CONFIG, judge: { ...ENGINE_CONFIG.judge, t_inj: 2 } } })).toThrow(/t_inj/);
  });
});

describe("determinism", () => {
  it("gives byte-identical decisions for identical inputs, with a deterministic id", () => {
    const run = () => engine.decide(M0, PACKET_INITIAL, CART_A3, JUDGE_TEE, at("2026-10-03T02:12:00Z"), undefined, PROOF_OK);
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
    expect(run().id).toMatch(/^dec_[A-Za-z0-9]{6,40}$/);
    const later = engine.decide(M0, PACKET_INITIAL, CART_A3, JUDGE_TEE, at("2026-10-03T02:12:01Z"), undefined, PROOF_OK);
    expect(later.id).not.toBe(run().id);
  });

  it("does not mutate its inputs", () => {
    const frozen = <T>(v: T): T => JSON.parse(JSON.stringify(v), (_k, x) => (x !== null && typeof x === "object" ? Object.freeze(x) : x)) as T;
    expect(() => engine.decide(frozen(M0), frozen(PACKET_INITIAL), frozen(CART_A1), frozen(JUDGE_TEE), at("2026-10-03T02:05:00Z"), undefined, PROOF_OK)).not.toThrow();
  });
});

describe("cartFingerprint = SHA-256(JCS(cart minus id, proposed_at))", () => {
  it("ignores id and proposed_at, nothing else", () => {
    const same = { ...CART_A1, id: "crt_anotherId01", proposed_at: "2026-10-03T03:00:00Z" };
    expect(cartFingerprint(same)).toBe(cartFingerprint(CART_A1));
    const { id: _i, proposed_at: _p, ...rest } = CART_A1;
    expect(cartFingerprint(CART_A1)).toBe(sha(canonicalJson(rest)));
    expect(cartFingerprint({ ...CART_A1, total_minor: 25901 })).not.toBe(cartFingerprint(CART_A1));
    expect(cartFingerprint({ ...CART_A1, merchant: { ...CART_A1.merchant, domain: "other.example" } })).not.toBe(cartFingerprint(CART_A1));
    expect(cartFingerprint(CART_A1)).toMatch(/^[0-9a-f]{64}$/);
  });
});
