// Audit (lane s-audit): the verifier's trust anchors. verifyChain failed open when the delegator key was
// missing at runtime (root cause S-VC-1), and parsePublicKeys accepted one key in both roles, after which a
// delegator signature proves nothing beyond the engine's. Both fixed (lane s-fix-crypto): KEYS, refused.
import { describe, expect, it } from "vitest";
import { createSigner } from "../src/crypto";
import { parsePublicKeys, verifyChain } from "../src/verify";
import { testSeed } from "./crypto-independent";
import { asJson, buildLog, demoKeys, demoSteps, type DemoKeys } from "./log-helpers";

const keys = demoKeys();
const mallory = createSigner(testSeed("audit-mallory-delegator"));
const forgedKeys: DemoKeys = { ...keys, delegator: mallory, publicKeys: { engine: keys.publicKeys.engine, delegator: mallory.did } };
// The real engine key, but Mallory's credential, answer and revocation.
const FORGED = await buildLog(demoSteps(forgedKeys), forgedKeys);
const PINNED = verifyChain(asJson(FORGED.entries), keys.publicKeys);
const UNPINNED = verifyChain(asJson(FORGED.entries), { engine: keys.publicKeys.engine } as unknown as typeof keys.publicKeys);
const SAME_KEY = parsePublicKeys({ engine: [keys.delegator.did], delegator: keys.delegator.did });
const SHARED_IN_CHAIN = verifyChain(asJson(FORGED.entries), { engine: [...keys.publicKeys.engine, mallory.did], delegator: mallory.did });

describe("controls", () => {
  it("with the real delegator pinned, Mallory's credential fails at seq 0", () => {
    expect(PINNED).toMatchObject({ ok: false, failedSeq: 0, reason: "PAYLOAD_SIGNATURE" });
  });
});

describe("S-VER-2 (fixed): verifier trust anchors", () => {
  it("verifyChain without a delegator key fails closed (it used to trust the credential's own issuer)", () => {
    expect(UNPINNED.ok).toBe(false);
    expect(UNPINNED).toMatchObject({ ok: false, failedSeq: 0, reason: "KEYS" });
  });

  it("parsePublicKeys refuses a key listed as both engine and delegator", () => {
    expect(SAME_KEY.ok).toBe(false);
  });

  it("verifyChain refuses keys handed to it directly with the delegator also listed as an engine key", () => {
    expect(SHARED_IN_CHAIN).toMatchObject({ ok: false, failedSeq: 0, reason: "KEYS" });
  });
});
