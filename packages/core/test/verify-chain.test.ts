// A-19 / T-V1 / T-I7: verifyChain per docs/02 section 11. Each tamper case names the first failing seq
// and the reason. resignChain models an operator who holds the engine key and rewrites the chain.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createSigner, verificationMethodId } from "../src/crypto";
import type { MandateCredential } from "../src/generated";
import { signEscalationAnswer, signRevocation } from "../src/log";
import { signMandateCredential } from "../src/vc";
import { verifyChain } from "../src/verify";
import { testSeed } from "./crypto-independent";
import { asJson, buildDemoLog, buildLog, demoKeys, demoSteps, LOG_ID, resignChain } from "./log-helpers";

const demo = await buildDemoLog();
const KEYS = demo.keys.publicKeys;
const OTHER = createSigner(testSeed("intruder"));
const fresh = () => asJson(demo.entries);
type Json = Record<string, unknown>;
const payloadOf = (e: Json | undefined) => (e?.["payload"] ?? {}) as Json;

function withField(index: number, field: string, value: unknown): Json[] {
  return fresh().map((e, i) => (i === index ? { ...e, [field]: value } : e));
}

function withPayload(index: number, change: (p: Json) => Json): Json[] {
  return fresh().map((e, i) => (i === index ? { ...e, payload: change(payloadOf(e)) } : e));
}

describe("verifyChain: untouched logs", () => {
  it("passes and returns the head", () => {
    expect(verifyChain(fresh(), KEYS)).toEqual({ ok: true, head: demo.checkpoint });
  });

  it("passes with the current or an older checkpoint", () => {
    expect(verifyChain(fresh(), KEYS, demo.checkpoint).ok).toBe(true);
    const older = demo.entries[3]!;
    expect(verifyChain(fresh(), KEYS, { log_id: LOG_ID, seq: 3, entry_hash: older.entry_hash }).ok).toBe(true);
  });

  it("accepts more than one engine key (rotation)", () => {
    expect(verifyChain(fresh(), { ...KEYS, engine: [OTHER.did, ...KEYS.engine] }).ok).toBe(true);
  });
});

describe("verifyChain: byte-level tamper (T-V1)", () => {
  it.each([
    ["v", 2, 2, "SCHEMA"],
    ["seq", 2, 7, "SEQ"],
    ["kind", 3, "PACKET_EXPIRED", "SCHEMA"],
    ["log_id", 3, "log_demoM1", "ENTRY_HASH"],
    ["ts", 4, "2026-10-03T02:00:06.001Z", "ENTRY_HASH"],
    ["prev_hash", 4, "e".repeat(64), "PREV_HASH"],
    ["payload_hash", 5, "a".repeat(64), "PAYLOAD_HASH"],
    ["entry_hash", 6, "b".repeat(64), "ENTRY_HASH"],
    ["signer", 1, OTHER.did, "ENTRY_HASH"],
    ["signature", 7, "A".repeat(86), "SIGNATURE"],
  ])("a changed %s at seq %i fails %s", (field, seq, value, reason) => {
    expect(verifyChain(withField(seq, field, value), KEYS)).toMatchObject({ ok: false, failedSeq: seq, reason });
  });

  it("a changed payload fails PAYLOAD_HASH at that seq", () => {
    const entries = withPayload(4, (p) => ({ ...p, amount_minor: 25800 }));
    expect(verifyChain(entries, KEYS)).toMatchObject({ ok: false, failedSeq: 4, reason: "PAYLOAD_HASH" });
  });

  it("a swapped payload hash or swapped payloads fail PAYLOAD_HASH", () => {
    const entries = fresh();
    expect(verifyChain(withField(3, "payload_hash", entries[4]?.["payload_hash"]), KEYS)).toMatchObject({
      failedSeq: 3,
      reason: "PAYLOAD_HASH",
    });
    const swapped = entries.map((e, i) => (i === 3 ? { ...e, payload: entries[4]?.["payload"] } : i === 4 ? { ...e, payload: entries[3]?.["payload"] } : e));
    expect(verifyChain(swapped, KEYS)).toMatchObject({ failedSeq: 3, reason: "PAYLOAD_HASH" });
  });
});

describe("verifyChain: order, duplicates, truncation (T-V1)", () => {
  it("reorder fails SEQ at the first moved line", () => {
    const e = fresh();
    expect(verifyChain([e[0], e[1], e[2], e[4], e[3], ...e.slice(5)], KEYS)).toMatchObject({ failedSeq: 3, reason: "SEQ" });
  });

  it("a duplicate seq or a dropped middle entry fails SEQ", () => {
    const e = fresh();
    expect(verifyChain([...e.slice(0, 3), e[2], ...e.slice(3)], KEYS)).toMatchObject({ failedSeq: 3, reason: "SEQ" });
    expect(verifyChain([...e.slice(0, 5), ...e.slice(6)], KEYS)).toMatchObject({ failedSeq: 5, reason: "SEQ" });
  });

  it("truncation passes without a checkpoint (stated residual risk) and fails TRUNCATED with one", () => {
    const cut = fresh().slice(0, 6);
    expect(verifyChain(cut, KEYS).ok).toBe(true);
    expect(verifyChain(cut, KEYS, demo.checkpoint)).toMatchObject({ ok: false, failedSeq: 6, reason: "TRUNCATED" });
  });

  it("a rewritten tail fails TRUNCATED against the checkpoint even when re-signed", () => {
    const rewritten = resignChain(withPayload(9, (p) => ({ ...p, expired_at: "2026-10-30T15:59:59Z" })), demo.keys.engine);
    expect(verifyChain(rewritten, KEYS).ok).toBe(true);
    expect(verifyChain(rewritten, KEYS, demo.checkpoint)).toMatchObject({ ok: false, failedSeq: 9, reason: "TRUNCATED" });
  });

  it("a checkpoint for another log, or a malformed one, fails TRUNCATED", () => {
    expect(verifyChain(fresh(), KEYS, { ...demo.checkpoint, log_id: "log_otherLog1" })).toMatchObject({ reason: "TRUNCATED" });
    expect(verifyChain(fresh(), KEYS, { ...demo.checkpoint, seq: -1 })).toMatchObject({ reason: "TRUNCATED" });
  });

  it("an empty log fails TRUNCATED at seq 0", () => {
    expect(verifyChain([], KEYS)).toMatchObject({ ok: false, failedSeq: 0, reason: "TRUNCATED" });
  });
});

describe("verifyChain: keys and signatures", () => {
  it("a wrong engine key fails SIGNATURE at seq 0", () => {
    expect(verifyChain(fresh(), { ...KEYS, engine: [OTHER.did] })).toMatchObject({ failedSeq: 0, reason: "SIGNATURE" });
    expect(verifyChain(fresh(), { ...KEYS, engine: [] })).toMatchObject({ failedSeq: 0, reason: "SIGNATURE" });
  });

  it("a log re-signed by an unknown engine key fails SIGNATURE", () => {
    expect(verifyChain(resignChain(fresh(), OTHER), KEYS)).toMatchObject({ failedSeq: 0, reason: "SIGNATURE" });
  });

  it("a wrong expected delegator fails PAYLOAD_SIGNATURE at seq 0", () => {
    expect(verifyChain(fresh(), { ...KEYS, delegator: OTHER.did })).toMatchObject({ failedSeq: 0, reason: "PAYLOAD_SIGNATURE" });
  });

  it("refuses to run (KEYS) without a usable pinned delegator or with the delegator also listed as an engine key", () => {
    const loose = verifyChain as (entries: readonly unknown[], keys: unknown) => ReturnType<typeof verifyChain>;
    const bad: unknown[] = [
      undefined,
      null,
      "keys",
      { engine: KEYS.engine },
      { ...KEYS, delegator: "" },
      { ...KEYS, delegator: "did:key:z6MkNope" },
      { ...KEYS, delegator: 7 },
      { delegator: KEYS.delegator },
      { ...KEYS, engine: "x" },
      { ...KEYS, engine: [KEYS.engine[0], 3] },
      { ...KEYS, engine: [...KEYS.engine, KEYS.delegator] },
    ];
    for (const keys of bad) expect(loose(fresh(), keys)).toMatchObject({ ok: false, failedSeq: 0, reason: "KEYS" });
    expect(loose([], { engine: KEYS.engine })).toMatchObject({ reason: "KEYS" });
  });
});

describe("verifyChain: delegator material (step 7)", () => {
  const resigned = (entries: Json[]) => verifyChain(resignChain(entries, demo.keys.engine), KEYS);

  it("credential rules changed after signing fail PAYLOAD_SIGNATURE even with a re-signed chain", () => {
    const entries = withPayload(0, (p) => {
      const subject = p["credentialSubject"] as Json;
      const rules = subject["rules"] as Json;
      return { ...p, credentialSubject: { ...subject, rules: { ...rules, budget: { amount_minor: 8000000, currency: "HKD" } } } };
    });
    expect(verifyChain(entries, KEYS)).toMatchObject({ failedSeq: 0, reason: "PAYLOAD_HASH" });
    expect(resigned(entries)).toMatchObject({ failedSeq: 0, reason: "PAYLOAD_SIGNATURE" });
  });

  it("a credential issued by another key fails PAYLOAD_SIGNATURE", async () => {
    const keys = demoKeys();
    const steps = demoSteps(keys);
    const vc = steps[0]!.payload as MandateCredential;
    const { proof: _proof, ...unsigned } = vc;
    const byOther = signMandateCredential({ ...unsigned, issuer: OTHER.did }, OTHER, { created: new Date("2026-10-03T02:00:00Z") });
    const log = await buildLog([{ kind: "MANDATE_SEALED", payload: byOther }, ...steps.slice(1, 6)], keys);
    expect(verifyChain(asJson(log.entries), KEYS)).toMatchObject({ failedSeq: 0, reason: "PAYLOAD_SIGNATURE" });
    const lyingVm = { ...vc, proof: { ...vc.proof, verificationMethod: verificationMethodId(OTHER.did) } };
    expect(resigned(withPayload(0, () => lyingVm))).toMatchObject({ failedSeq: 0, reason: "PAYLOAD_SIGNATURE" });
  });

  it("a credential replayed as the root of another log fails PAYLOAD_SIGNATURE", () => {
    const replayed = fresh().map((e) => ({ ...e, log_id: "log_replay01" }));
    expect(resigned(replayed)).toMatchObject({ failedSeq: 0, reason: "PAYLOAD_SIGNATURE" });
  });

  it("a revocation not signed by the delegator fails PAYLOAD_SIGNATURE at its seq", () => {
    const forged = signRevocation({ mandate_id: "mnd_demoM0", revoked_at: new Date("2026-10-03T02:30:00Z") }, OTHER);
    expect(resigned(withPayload(8, () => ({ ...forged })))).toMatchObject({ failedSeq: 8, reason: "PAYLOAD_SIGNATURE" });
    expect(resigned(withPayload(8, () => ({ ...forged, signer: KEYS.delegator })))).toMatchObject({ failedSeq: 8, reason: "PAYLOAD_SIGNATURE" });
  });

  it("an escalation answer must be the delegator's and bind the escalated decision", () => {
    const answerBy = (signer: typeof OTHER, decisionId: string) =>
      signEscalationAnswer({ decision_id: decisionId, choice: "DENY", answered_at: new Date("2026-10-03T02:20:30Z") }, signer);
    const withAnswer = (answer: unknown, resolves = "dec_demoE1") =>
      withPayload(7, (p) => ({ ...p, resolves, escalation: { ...(p["escalation"] as Json), answer } }));
    expect(resigned(withAnswer(answerBy(OTHER, "dec_demoE1")))).toMatchObject({ failedSeq: 7, reason: "PAYLOAD_SIGNATURE" });
    expect(resigned(withAnswer(answerBy(demo.keys.delegator, "dec_demoA3"), "dec_demoA3"))).toMatchObject({
      failedSeq: 7,
      reason: "PAYLOAD_SIGNATURE",
    });
    expect(resigned(withAnswer(answerBy(demo.keys.delegator, "dec_demoE1"), "dec_demoA3"))).toMatchObject({
      failedSeq: 7,
      reason: "PAYLOAD_SIGNATURE",
    });
    expect(resigned(withAnswer(answerBy(demo.keys.delegator, "dec_demoE1"))).ok).toBe(true);
  });

  it("an entry for another mandate fails PAYLOAD_SIGNATURE", () => {
    const entries = withPayload(5, (p) => ({ ...p, mandate_id: "mnd_otherM1" }));
    expect(resigned(entries)).toMatchObject({ failedSeq: 5, reason: "PAYLOAD_SIGNATURE" });
    expect(resigned(withPayload(2, (p) => ({ ...p, mandate_id: "mnd_otherM1" })))).toMatchObject({ failedSeq: 2, reason: "PAYLOAD_SIGNATURE" });
  });
});

describe("verifyChain: every log appendEntry writes verifies (T-I7, property)", () => {
  it("passes for random sequences of decisions, card events, revocation and expiry", async () => {
    const keys = demoKeys();
    const steps = demoSteps(keys);
    // Step 7 answers the ESCALATE of step 6, so a 7 is kept only after some 6.
    const picks = fc.array(fc.constantFrom(1, 2, 3, 4, 5, 6, 7, 8, 9), { maxLength: 10 }).map((xs) => {
      const firstEscalate = xs.indexOf(6);
      return xs.filter((x, i) => x !== 7 || (firstEscalate >= 0 && i > firstEscalate));
    });
    await fc.assert(
      fc.asyncProperty(picks, async (sequence) => {
        const log = await buildLog([steps[0]!, ...sequence.map((i) => steps[i]!)], keys);
        const result = verifyChain(asJson(log.entries), keys.publicKeys, log.checkpoint);
        return result.ok && result.head.seq === sequence.length;
      }),
      { numRuns: 25 },
    );
  }, 60_000);
});

describe("verifyChain: structure", () => {
  it("seq 0 must be MANDATE_SEALED and nothing else may be", () => {
    const e = fresh();
    expect(verifyChain(resignChain(e.slice(1).map((x, i) => ({ ...x, seq: i })), demo.keys.engine), KEYS)).toMatchObject({
      failedSeq: 0,
      reason: "SCHEMA",
    });
    const twoSeals = [...e.slice(0, 3), { ...e[0], seq: 3 }, ...e.slice(4)];
    expect(verifyChain(resignChain(twoSeals, demo.keys.engine), KEYS)).toMatchObject({ failedSeq: 3, reason: "SCHEMA" });
  });

  it("an entry from another log spliced in fails SCHEMA even when re-signed", () => {
    const spliced = fresh().map((e, i) => (i === 4 ? { ...e, log_id: "log_otherLog1" } : e));
    expect(verifyChain(resignChain(spliced, demo.keys.engine), KEYS)).toMatchObject({ failedSeq: 4, reason: "SCHEMA" });
  });

  it("never throws, whatever the input", () => {
    fc.assert(
      fc.property(fc.array(fc.anything(), { maxLength: 4 }), (junk) => {
        const result = verifyChain(junk, KEYS);
        return result.ok === false && result.reason === (junk.length === 0 ? "TRUNCATED" : "SCHEMA");
      }),
      { numRuns: 60 },
    );
  });
});
