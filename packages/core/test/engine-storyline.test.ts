// Storyline F20-F23 end to end at engine level, plus the stops T-S1, T-S2, T-S3, T-S6 (A-15).
import { describe, expect, it } from "vitest";
import { ENGINE_CONFIG } from "../src/config";
import { engine } from "../src/engine";
import type { Cart, Decision, JudgeRecord, LogEntry, PacketState } from "../src/generated";
import { foldPacket } from "../src/packet";
import { validateDecision } from "../src/schema";
import {
  CART_A1,
  CART_A2,
  CART_A3,
  CART_A3B,
  CART_A4,
  JUDGE_FLAGGED,
  JUDGE_INJECTED,
  JUDGE_JACKET,
  JUDGE_SOCKS,
  JUDGE_TEE,
  M0,
  PACKET_INITIAL,
  PROOF_OK,
  at,
  packetWith,
} from "./engine-helpers";
import { CREDENTIAL, MANDATE_ID, append, card, cardEvent, sealedLog } from "./packet-helpers";

function decideValid(packet: PacketState, cart: Cart, judge: JudgeRecord, now: string): Decision {
  const d = engine.decide(M0, packet, cart, judge, at(now), undefined, PROOF_OK);
  const check = validateDecision(d);
  expect(check.ok, JSON.stringify(check)).toBe(true);
  return d;
}

/** Log the decision, mint for an APPROVE and settle the exact amount (rail SIMULATED, as the orchestrator would). */
function record(log: LogEntry[], d: Decision, n: number): LogEntry[] {
  const logged = append(log, "DECISION", d, d.decided_at);
  if (d.outcome !== "APPROVE") return logged;
  const minted = card(n, d.approved_limit_minor ?? -1, d.decided_at);
  const withCard = append(logged, "CARD_MINTED", minted, minted.minted_at);
  return append(withCard, "CARD_EVENT", cardEvent(minted.id, "AUTHORISED", d.decided_at, minted.limit_minor), d.decided_at);
}

describe("storyline: packet HK$800, mint HK$259, HK$541 left, HK$550 stopped by R3, HK$120 mint, HK$421 left", () => {
  it("runs DM2-DM6 through foldPacket and engine.decide", () => {
    let log = sealedLog();
    const initial = foldPacket(log, at("2026-10-03T02:05:00Z"));
    expect(initial.remaining_minor).toBe(80000); // HK$800 [F20]

    const a1 = decideValid(initial, CART_A1, JUDGE_TEE, "2026-10-03T02:05:00Z");
    expect(a1).toMatchObject({ outcome: "APPROVE", approved_limit_minor: 25900 }); // HK$259 [F21]
    expect(a1.explanation).toBeUndefined();
    log = record(log, a1, 1);
    expect(foldPacket(log, at("2026-10-03T02:06:00Z")).remaining_minor).toBe(54100); // HK$541 left

    const a2 = decideValid(foldPacket(log, at("2026-10-03T02:08:00Z")), CART_A2, JUDGE_FLAGGED, "2026-10-03T02:08:00Z");
    expect(a2).toMatchObject({ outcome: "DENY", explanation: { template_id: "R9.flagged" } }); // S2, DM3
    expect(a2.approved_limit_minor).toBeUndefined();
    log = record(log, a2, 2);

    const a3 = decideValid(foldPacket(log, at("2026-10-03T02:12:00Z")), CART_A3, JUDGE_JACKET, "2026-10-03T02:12:00Z");
    expect(a3.outcome).toBe("DENY"); // S1, DM4 [F22]
    expect(a3.explanation).toMatchObject({
      template_id: "R3.over_remaining",
      inputs: { total_minor: 55000, remaining_minor: 54100, verdict: "DENY" },
      rendered: "Stopped by R3. Total HK$550 is over the HK$541 left.",
      rendered_zh_hk: "由 R3 攔截。總額 HK$550 超過剩餘的 HK$541。",
    });
    log = record(log, a3, 3);

    const a3b = decideValid(foldPacket(log, at("2026-10-03T02:14:00Z")), CART_A3B, JUDGE_INJECTED, "2026-10-03T02:14:00Z");
    expect(a3b).toMatchObject({ outcome: "DENY", explanation: { template_id: "R10.injection" } }); // S3, DM5
    log = record(log, a3b, 4);

    const a4 = decideValid(foldPacket(log, at("2026-10-03T02:20:00Z")), CART_A4, JUDGE_SOCKS, "2026-10-03T02:20:00Z");
    expect(a4).toMatchObject({ outcome: "APPROVE", approved_limit_minor: 12000 }); // HK$120 [F23]
    log = record(log, a4, 5);
    const end = foldPacket(log, at("2026-10-03T02:21:00Z"));
    expect(end).toMatchObject({ remaining_minor: 42100, spent_minor: 37900, committed_minor: 0, mint_times: [a1.decided_at, a4.decided_at] }); // HK$421 left
  });

  it("records every rule R1..R12 in order, one R10 result per judge question", () => {
    const d = decideValid(PACKET_INITIAL, CART_A1, JUDGE_TEE, "2026-10-03T02:05:00Z");
    expect(d.rules.map((r) => r.check === undefined ? r.id : `${r.id}.${r.check}`)).toEqual([
      "R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9",
      "R10.scope_fit", "R10.injection_risk", "R10.seller_risk", "R10.escalate_or_proceed",
      "R11", "R12",
    ]);
    expect(d.rules.find((r) => r.id === "R4")?.result).toBe("SKIPPED"); // M0 has no per-purchase cap: R3 binds
    expect(d.rules.find((r) => r.id === "R12")?.result).toBe("SKIPPED"); // before checkout
    expect(d.engine.config_sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("stops at engine level", () => {
  const now = "2026-10-03T02:12:00Z";

  it("T-S1: R3 DENY, no limit approved, primary reason R3 [F22]", () => {
    const d = decideValid(foldPacket(append(sealedLog(), "CARD_MINTED", card(1, 25900, "2026-10-03T02:05:02Z"), "2026-10-03T02:05:02Z"), at(now)), CART_A3, JUDGE_JACKET, now);
    expect(d).toMatchObject({ outcome: "DENY", explanation: { template_id: "R3.over_remaining" } });
    expect(d.rules.find((r) => r.id === "R3")).toMatchObject({ result: "FAIL", verdict: "DENY" });
  });

  it("T-S2: flagged seller DENY R9.flagged; unverified seller ESCALATE R9.unverified with an open window [F31]", () => {
    expect(decideValid(PACKET_INITIAL, CART_A2, JUDGE_TEE, now).explanation?.template_id).toBe("R9.flagged");
    const unverified = { ...CART_A1, scameter: { state: "NOT_CHECKED" as const, capture_ref: null, captured_at: null, searched: [] } };
    const d = decideValid(PACKET_INITIAL, unverified, JUDGE_TEE, now);
    expect(d).toMatchObject({ outcome: "ESCALATE", explanation: { template_id: "R9.unverified" } });
    expect(d.escalation).toEqual({ state: "OPEN", expires_at: new Date(Date.parse(now) + ENGINE_CONFIG.escalation.window_ms).toISOString() });
  });

  it("T-S3: injected listing DENY R10.injection, injection risk over T_inj [F36]", () => {
    const d = decideValid(PACKET_INITIAL, CART_A3B, JUDGE_INJECTED, now);
    const r10 = d.rules.find((r) => r.check === "injection_risk");
    expect(r10).toMatchObject({ result: "FAIL", verdict: "DENY", template_id: "R10.injection", threshold_ref: "F36.T_inj" });
    expect(Number(r10?.inputs["p_injection_risk"])).toBeGreaterThanOrEqual(ENGINE_CONFIG.judge.t_inj);
  });

  it("T-S6: a velocity burst is DENY R7.velocity; an expired packet is DENY R2.expired [F32]", () => {
    const burst = packetWith(PACKET_INITIAL, { mint_times: ["2026-10-03T02:03:00Z", "2026-10-03T02:06:00Z", "2026-10-03T02:10:00Z"] });
    expect(decideValid(burst, CART_A4, JUDGE_SOCKS, now).explanation?.template_id).toBe("R7.velocity");
    const expiredLog = append(sealedLog(), "PACKET_EXPIRED", { mandate_id: MANDATE_ID, expired_at: "2026-10-03T02:11:00Z" }, "2026-10-03T02:11:00Z");
    const expired = foldPacket(expiredLog, at(now));
    expect(expired.status).toBe("EXPIRED");
    expect(decideValid(expired, CART_A4, JUDGE_SOCKS, now).explanation?.template_id).toBe("R2.expired");
  });

  it("T-S4 engine part: after MANDATE_REVOKED every cart is DENY R2.revoked", () => {
    const revocation = { mandate_id: MANDATE_ID, revoked_at: "2026-10-03T02:10:00Z", signer: CREDENTIAL.issuer, signature: "A".repeat(86) };
    const revoked = foldPacket(append(sealedLog(), "MANDATE_REVOKED", revocation, revocation.revoked_at), at(now));
    expect(decideValid(revoked, CART_A4, JUDGE_SOCKS, now)).toMatchObject({ outcome: "DENY", explanation: { template_id: "R2.revoked" } });
  });

  it("fails closed without a proof flag: DENY R1.invalid_signature", () => {
    const d = engine.decide(M0, PACKET_INITIAL, CART_A1, JUDGE_TEE, at(now));
    expect(d).toMatchObject({ outcome: "DENY", explanation: { template_id: "R1.invalid_signature" } });
  });

  it("escalates R10.unavailable when the judge times out or the input was truncated (I5)", () => {
    const { answers: _a, ...noAnswers } = JUDGE_TEE;
    const timeout: JudgeRecord = { ...noAnswers, status: "TIMEOUT" };
    expect(decideValid(PACKET_INITIAL, CART_A1, timeout, now)).toMatchObject({ outcome: "ESCALATE", explanation: { template_id: "R10.unavailable" } });
    const truncated: JudgeRecord = { ...noAnswers, status: "ERROR", input_truncated: true };
    expect(decideValid(PACKET_INITIAL, CART_A1, truncated, now)).toMatchObject({ outcome: "ESCALATE", explanation: { template_id: "R10.unavailable" } });
    const okWithoutAnswers = noAnswers as JudgeRecord; // schema-invalid: status OK needs answers
    expect(engine.decide(M0, PACKET_INITIAL, CART_A1, okWithoutAnswers, at(now), undefined, PROOF_OK).outcome).toBe("ESCALATE");
  });

  it("records the judge without effect in shadow mode", () => {
    const d = decideValid(PACKET_INITIAL, CART_A3B, { ...JUDGE_INJECTED, shadow: true }, now);
    expect(d.outcome).toBe("APPROVE");
    expect(d.rules.find((r) => r.check === "injection_risk")).toMatchObject({ result: "SKIPPED", inputs: { shadow_verdict: "DENY" } });
  });
});
