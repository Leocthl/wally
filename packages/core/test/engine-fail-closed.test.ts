// Audit LOWs in the engine (lane s-fix-core): the outcome fold fails closed on a FAIL without a readable verdict,
// and two decisions that differ in anything never share an id.
import { describe, expect, it } from "vitest";
import { engine, outcomeOf, primaryReason } from "../src/engine";
import type { RuleResult } from "../src/generated";
import { CART_A1, CART_A3, JUDGE_TEE, M0, PACKET_AFTER_A1, PACKET_INITIAL, PROOF_OK, at } from "./engine-helpers";

const PASS: RuleResult = { id: "R3", result: "PASS", inputs: {}, comparator: "<=" };
const ESC: RuleResult = { id: "R9", result: "FAIL", verdict: "ESCALATE", inputs: {}, comparator: "==", template_id: "R9.unverified" };

describe("outcomeOf fails closed", () => {
  it("a FAIL with no verdict, or a verdict it does not know, is DENY, never APPROVE", () => {
    const noVerdict = { id: "R6", result: "FAIL", inputs: {}, comparator: "in", template_id: "R6.off_mandate" } as RuleResult;
    const oddVerdict = { ...noVerdict, verdict: "MAYBE" } as unknown as RuleResult;
    expect(outcomeOf([PASS, noVerdict])).toBe("DENY");
    expect(outcomeOf([PASS, ESC, oddVerdict])).toBe("DENY");
    expect(primaryReason([PASS, noVerdict])).toMatchObject({ id: "R6", verdict: "DENY", template_id: "R6.off_mandate" });
  });

  it("a result that is neither PASS, FAIL nor SKIPPED is DENY", () => {
    expect(outcomeOf([PASS, { ...PASS, result: "UNKNOWN" } as unknown as RuleResult])).toBe("DENY");
  });

  it("only clean PASS and SKIPPED results approve; ESCALATE needs an explicit ESCALATE verdict", () => {
    expect(outcomeOf([PASS, { id: "R12", result: "SKIPPED", inputs: {} }])).toBe("APPROVE");
    expect(outcomeOf([PASS, ESC])).toBe("ESCALATE");
    expect(primaryReason([PASS])).toBeUndefined();
  });
});

describe("decision ids", () => {
  const now = at("2026-10-03T02:12:00Z");

  it("differ when the outcome differs (same cart, same time, same phase)", () => {
    const a = engine.decide(M0, PACKET_INITIAL, CART_A3, JUDGE_TEE, now, undefined, PROOF_OK);
    const b = engine.decide(M0, PACKET_AFTER_A1, CART_A3, JUDGE_TEE, now, undefined, PROOF_OK);
    expect([a.outcome, b.outcome]).toEqual(["APPROVE", "DENY"]);
    expect(a.id).not.toBe(b.id);
  });

  it("do not depend on the judge record's latency or provider (a live run and its replay agree)", () => {
    const a = engine.decide(M0, PACKET_INITIAL, CART_A1, JUDGE_TEE, now, undefined, PROOF_OK);
    const b = engine.decide(M0, PACKET_INITIAL, CART_A1, { ...JUDGE_TEE, latency_ms: 1, provider: "replay" }, now, undefined, PROOF_OK);
    expect(b.id).toBe(a.id);
  });

  it("differ for two carts that share an id but not their contents", () => {
    const other = { ...CART_A3, id: CART_A1.id };
    const a = engine.decide(M0, PACKET_INITIAL, CART_A1, JUDGE_TEE, now, undefined, PROOF_OK);
    const b = engine.decide(M0, PACKET_INITIAL, other, JUDGE_TEE, now, undefined, PROOF_OK);
    expect(a.id).not.toBe(b.id);
    expect(a.id.slice(0, -16)).toBe(b.id.slice(0, -16)); // the readable cart prefix stays; the 16-char digest differs
  });

  it("are stable for identical inputs and total over a hostile judge record (never throws)", () => {
    const hostile = { ...JUDGE_TEE, latency_ms: Number.NaN, extra: [undefined, 1n] } as never;
    const first = engine.decide(M0, PACKET_INITIAL, CART_A1, hostile, now, undefined, PROOF_OK);
    expect(engine.decide(M0, PACKET_INITIAL, CART_A1, hostile, now, undefined, PROOF_OK).id).toBe(first.id);
  });
});
