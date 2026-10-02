// Pinned engine hash outputs (browser-safe swap guard). These literals were computed with the node:crypto
// implementation before the swap to @noble/hashes; any change of backend must keep them byte-identical,
// because decision ids, cart fingerprints and config_sha256 are recorded in signed logs.
import { describe, expect, it } from "vitest";
import { ENGINE_CONFIG } from "../src/config";
import { canonicalJson, cartFingerprint, configSha256, engine, sha256Hex } from "../src/engine";
import { CART_A1, CART_A3, JUDGE_TEE, M0, PACKET_INITIAL, PROOF_OK, at } from "./engine-helpers";

describe("engine hashes are pinned", () => {
  it("sha256Hex matches the standard vectors and UTF-8 text", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("Wally é ✓ \u{1F600}")).toBe("871a819bb2d40f980f8c230b04edf473d306e92db622fd4259570ef085a1e6c7");
  });

  it("cartFingerprint of the storyline carts", () => {
    expect(cartFingerprint(CART_A1)).toBe("399108ab4387f1d0fb635bfeaa3806acb5ff0ea7059d53358d05f44864742634");
    expect(cartFingerprint(CART_A3)).toBe("3253127043cce254e155e0f38db181ed2e2a0e74de824a40e9775ae7e3e80f67");
  });

  it("config_sha256 of ENGINE_CONFIG", () => {
    expect(configSha256(ENGINE_CONFIG)).toBe("7abe179403dd0b3de9abed42a73cef395be908c497d78eab62c7b2b9f0f03720");
    expect(engine.configSha256).toBe("7abe179403dd0b3de9abed42a73cef395be908c497d78eab62c7b2b9f0f03720");
  });

  it("canonical JSON text and a deterministic decision id", () => {
    expect(canonicalJson({ b: "é", a: [1, 0.63, { z: null }] })).toBe('{"a":[1,0.63,{"z":null}],"b":"é"}');
    const d = engine.decide(M0, PACKET_INITIAL, CART_A3, JUDGE_TEE, at("2026-10-03T02:12:00Z"), undefined, PROOF_OK);
    expect(d.id).toBe("dec_demoA3470eb76d6c13c53c");
  });
});
