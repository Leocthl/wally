// A judge adapter that declines to ask its model because it cannot read the listing's language says so in
// JudgeRecord.version (the schema has no field for a reason). R10 reads that back into the recorded inputs of
// R10.unavailable, the explanation template picks its sentence from there, and nothing on this path can loosen a
// decision: the record is still an ERROR with no answers, so R10 escalates it (I3, I5).
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ENGINE_CONFIG } from "../src/config";
import { engine } from "../src/engine";
import { render } from "../src/explain";
import type { Decision, JudgeRecord } from "../src/generated";
import { cartSha256 } from "../src/log";
import { foldPacket } from "../src/packet";
import { JUDGE_REASON_UNSUPPORTED_LANGUAGE, JUDGE_VERSION_UNSUPPORTED_LANGUAGE, judgeSkipReason, type EscalationAnswer } from "../src/ports";
import { evaluateR10 } from "../src/rules";
import { validateDecision, validateJudgeRecord } from "../src/schema";
import { PROPERTY_SEED, judgeArb } from "./engine-arbitraries";
import { CART_A1, JUDGE_TEE, M0, PACKET_INITIAL, PROOF_OK, at } from "./engine-helpers";
import { append, sealedLog } from "./packet-helpers";

const NOW = at("2026-10-03T02:05:00Z");
const SKIPPED: JudgeRecord = {
  provider: "laya",
  model: "typed-decisions",
  version: JUDGE_VERSION_UNSUPPORTED_LANGUAGE,
  status: "ERROR",
  latency_ms: 0,
  shadow: false,
};
const DOWN: JudgeRecord = { ...SKIPPED, version: "unknown", latency_ms: 1500 };

const decide = (judge: unknown): Decision => engine.decide(M0, PACKET_INITIAL, CART_A1, judge as JudgeRecord, NOW, undefined, PROOF_OK);
const r10 = (judge: unknown) => evaluateR10({ mandate: M0, judge, config: ENGINE_CONFIG });

describe("the marker an adapter leaves when it did not ask its model", () => {
  it("is one fixed version string that the schema accepts on an ERROR record", () => {
    expect(JUDGE_REASON_UNSUPPORTED_LANGUAGE).toBe("unsupported_language");
    expect(JUDGE_VERSION_UNSUPPORTED_LANGUAGE).toBe("skipped:unsupported_language");
    expect(validateJudgeRecord(SKIPPED).ok).toBe(true);
  });

  it("is read only from an ERROR record: an answered record, a timeout or an ordinary version never carries a reason", () => {
    expect(judgeSkipReason(SKIPPED)).toBe("unsupported_language");
    expect(judgeSkipReason({ ...SKIPPED, status: "OK", answers: JUDGE_TEE.answers })).toBeNull();
    expect(judgeSkipReason({ ...SKIPPED, status: "TIMEOUT" })).toBeNull();
    expect(judgeSkipReason(DOWN)).toBeNull();
    expect(judgeSkipReason({ ...SKIPPED, version: "skipped:unsupported_language " })).toBeNull();
    expect(judgeSkipReason({ ...SKIPPED, version: "SKIPPED:UNSUPPORTED_LANGUAGE" })).toBeNull();
  });

  it.each([[null], [undefined], ["ERROR"], [42], [[]], [{}], [{ status: "ERROR" }], [{ status: "ERROR", version: 7 }]])("reads %p as no reason, never throwing", (value) => {
    expect(judgeSkipReason(value)).toBeNull();
  });
});

describe("R10 with a skipped record (ERROR, no answers)", () => {
  it("escalates R10.unavailable and records the reason in the inputs", () => {
    const results = r10(SKIPPED);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: "R10", check: "judge_status", result: "FAIL", verdict: "ESCALATE", comparator: "==", template_id: "R10.unavailable" });
    expect(results[0]?.inputs).toEqual({ status: "ERROR", input_truncated: false, problem: "status", provider: "laya", reason: "unsupported_language" });
  });

  it("leaves the inputs of every other unusable record exactly as they were (no reason key at all)", () => {
    expect(r10(DOWN)[0]?.inputs).toEqual({ status: "ERROR", input_truncated: false, problem: "status", provider: "laya" });
    expect(r10({ ...DOWN, status: "TIMEOUT" })[0]?.inputs).toEqual({ status: "TIMEOUT", input_truncated: false, problem: "status", provider: "laya" });
    expect(r10({ ...DOWN, input_truncated: true })[0]?.inputs).toEqual({ status: "ERROR", input_truncated: true, problem: "status", provider: "laya" });
    expect(r10({ ...JUDGE_TEE, answers: undefined, status: "OK" })[0]?.inputs).not.toHaveProperty("reason");
  });

  it("ignores the marker on an OK record: the answers decide, there is no R10.unavailable (the marker can only tighten)", () => {
    const answered = { ...JUDGE_TEE, version: JUDGE_VERSION_UNSUPPORTED_LANGUAGE };
    expect(r10(answered)).toEqual(r10(JUDGE_TEE));
    expect(r10(answered).map((r) => r.check)).toEqual(["scope_fit", "injection_risk", "seller_risk", "escalate_or_proceed"]);
  });

  it("still escalates in shadow mode, like any record the engine cannot read (I5)", () => {
    const shadow = evaluateR10({ mandate: M0, judge: { ...SKIPPED, shadow: true }, config: { ...ENGINE_CONFIG, judge_mode: "shadow" } });
    expect(shadow).toEqual([expect.objectContaining({ result: "FAIL", verdict: "ESCALATE", template_id: "R10.unavailable" })]);
    expect(shadow[0]?.inputs).toMatchObject({ reason: "unsupported_language" });
  });
});

describe("R10.unavailable sentences", () => {
  const language = { status: "ERROR", input_truncated: false, problem: "status", provider: "laya", reason: "unsupported_language" };

  it("EN: the listing checker reads English best and could not check this listing, so it asks you", () => {
    expect(render("R10.unavailable", language, "en")).toBe(
      "Escalated by R10. Wally's listing checker reads English best and could not check this listing, so it asks you.",
    );
  });

  it("zh-HK: the same idea in Cantonese", () => {
    expect(render("R10.unavailable", language, "zh-HK")).toBe("R10 已轉交你確認。Wally 的商品檢查器最擅長讀英文，這次未能檢查這個商品，所以請你決定。");
  });

  it("keeps every older R10.unavailable sentence for a record with no reason", () => {
    expect(render("R10.unavailable", { status: "TIMEOUT" }, "en")).toBe("Escalated by R10. The judge gave no usable answer (timed out), so you decide.");
    expect(render("R10.unavailable", { status: "ERROR" }, "en")).toBe("Escalated by R10. The judge gave no usable answer (error), so you decide.");
    expect(render("R10.unavailable", { status: "ERROR", input_truncated: true }, "en")).toBe("Escalated by R10. The judge gave no usable answer (listing cut off), so you decide.");
    expect(render("R10.unavailable", { status: "ERROR" }, "zh-HK")).toBe("R10 已轉交你確認。判斷器未能給出可用答案（錯誤），由你決定。");
  });

  it("a cut-off listing keeps its own sentence even when a reason is also recorded", () => {
    expect(render("R10.unavailable", { ...language, input_truncated: true }, "en")).toBe(
      "Escalated by R10. The judge gave no usable answer (listing cut off), so you decide.",
    );
  });

  it("an unknown reason falls back to the status sentence, never to a made-up one", () => {
    expect(render("R10.unavailable", { status: "ERROR", reason: "something_else" }, "en")).toBe("Escalated by R10. The judge gave no usable answer (error), so you decide.");
    expect(render("R10.unavailable", { status: "ERROR", reason: 7 }, "en")).toBe("Escalated by R10. The judge gave no usable answer (error), so you decide.");
  });
});

describe("the engine with a skipped record", () => {
  it("ESCALATEs a clean cart: R10.unavailable, the reason recorded, both sentences rendered from the recorded inputs", () => {
    const d = decide(SKIPPED);
    expect(d.outcome).toBe("ESCALATE");
    expect(d.escalation).toMatchObject({ state: "OPEN" });
    expect(d.approved_limit_minor).toBeUndefined();
    expect(d.explanation).toMatchObject({ template_id: "R10.unavailable", inputs: { reason: "unsupported_language", verdict: "ESCALATE" } });
    expect(d.explanation?.rendered).toBe(render("R10.unavailable", d.explanation?.inputs ?? {}, "en"));
    expect(d.explanation?.rendered_zh_hk).toBe(render("R10.unavailable", d.explanation?.inputs ?? {}, "zh-HK"));
    expect(d.explanation?.rendered).toContain("reads English best");
    expect(d.judge).toEqual(SKIPPED);
    expect(validateDecision(d).ok).toBe(true);
  });

  it("does not move the config hash: the language reason is not a threshold, and the decision records the pinned hash", () => {
    const PINNED = "a9ea2b0393fa95ecaa16bea6192f6caafac8f761b922cbf94d5d43c160a6096d"; // engine-hash-pinned.test.ts
    expect(engine.configSha256).toBe(PINNED);
    expect(decide(SKIPPED).engine.config_sha256).toBe(PINNED);
  });

  it("never approves on its own, whatever else the record says (I3, I5)", () => {
    fc.assert(
      fc.property(judgeArb, fc.constantFrom<JudgeRecord["status"]>("ERROR", "TIMEOUT", "OK"), (judge, status) => {
        const withMarker = { ...judge, status, version: JUDGE_VERSION_UNSUPPORTED_LANGUAGE };
        const withoutMarker = { ...judge, status, version: "x" };
        const outcome = decide(withMarker).outcome;
        expect(decide(withoutMarker).outcome).toBe(outcome);
        if (status !== "OK") expect(outcome).not.toBe("APPROVE");
      }),
      { numRuns: 200, seed: PROPERTY_SEED },
    );
  }, 60_000);
});

describe("an answer to a skipped-record escalation (consent by escalation, as for any other)", () => {
  const T0 = "2026-10-03T02:12:00Z";
  const SIGNED = { mandateProofValid: true, answerSignatureValid: true } as const;
  const escalated = engine.decide(M0, PACKET_INITIAL, CART_A1, SKIPPED, at(T0), undefined, PROOF_OK);
  const packet = foldPacket(append(sealedLog(), "DECISION", escalated, T0), at(T0));
  const answer = (choice: "APPROVE" | "DENY"): EscalationAnswer => ({
    decision_id: escalated.id,
    mandate_id: M0.id,
    cart_sha256: cartSha256(CART_A1),
    choice,
    answered_at: "2026-10-03T02:12:30Z",
    signer: M0.delegator,
    signature: "A".repeat(86),
  });
  const resolve = (choice: "APPROVE" | "DENY") =>
    engine.decide(M0, packet, CART_A1, escalated.judge, at("2026-10-03T02:12:40Z"), { resolves: escalated.id, answer: answer(choice), escalated }, SIGNED);

  it("a delegator APPROVE clears R10 and approves exactly the cart total", () => {
    const d = resolve("APPROVE");
    expect(d).toMatchObject({ outcome: "APPROVE", approved_limit_minor: CART_A1.total_minor, resolves: escalated.id, escalation: { state: "APPROVED" } });
    expect(d.rules.find((r) => r.id === "R10")).toMatchObject({ result: "PASS", inputs: { cleared_by: "delegator", reason: "unsupported_language" } });
    expect(validateDecision(d).ok).toBe(true);
  });

  it("a delegator DENY stays a DENY and keeps the template", () => {
    const d = resolve("DENY");
    expect(d).toMatchObject({ outcome: "DENY", escalation: { state: "DENIED" }, explanation: { template_id: "R10.unavailable" } });
    expect(d.approved_limit_minor).toBeUndefined();
  });

  it("without an answer the window runs out and R11 denies", () => {
    const expired = engine.decide(M0, packet, CART_A1, escalated.judge, at(escalated.escalation?.expires_at ?? T0), { resolves: escalated.id, escalated }, PROOF_OK);
    expect(expired).toMatchObject({ outcome: "DENY", explanation: { template_id: "R11.expired" } });
  });
});
