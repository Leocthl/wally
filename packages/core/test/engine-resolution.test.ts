// Escalation answers, R11 expiry (T-S5) and checkout drift (R12) at engine level (A-15).
import { describe, expect, it } from "vitest";
import { ENGINE_CONFIG } from "../src/config";
import { engine } from "../src/engine";
import type { Cart, Decision, PacketState } from "../src/generated";
import { cartSha256 } from "../src/log";
import { foldPacket } from "../src/packet";
import type { EscalationAnswer, MerchantQuote } from "../src/ports";
import { validateDecision } from "../src/schema";
import { CART_A1, JUDGE_INJECTED, JUDGE_TEE, M0, PACKET_INITIAL, PROOF_OK, at, packetWith, packetWithRemaining } from "./engine-helpers";
import { append, sealedLog } from "./packet-helpers";

const T0 = "2026-10-03T02:12:00Z";
const UNVERIFIED: Cart = { ...CART_A1, scameter: { state: "NOT_CHECKED", capture_ref: null, captured_at: null, searched: [] } };

function escalated(): { decision: Decision; packet: PacketState; expiresAt: string } {
  const decision = engine.decide(M0, PACKET_INITIAL, UNVERIFIED, JUDGE_TEE, at(T0), undefined, PROOF_OK);
  expect(decision.outcome).toBe("ESCALATE");
  const packet = foldPacket(append(sealedLog(), "DECISION", decision, T0), at(T0));
  return { decision, packet, expiresAt: decision.escalation?.expires_at ?? "" };
}

const answer = (decisionId: string, choice: "APPROVE" | "DENY", answeredAt = "2026-10-03T02:12:30Z"): EscalationAnswer => ({
  decision_id: decisionId,
  mandate_id: M0.id,
  cart_sha256: cartSha256(UNVERIFIED), // laisee.resolve.v2 binding (unsigned here: the engine checks binding and timing)
  choice,
  answered_at: answeredAt,
  signer: M0.delegator,
  signature: "A".repeat(86),
});

function valid(d: Decision): Decision {
  const check = validateDecision(d);
  expect(check.ok, JSON.stringify(check)).toBe(true);
  return d;
}

describe("escalation resolution", () => {
  it("T-S5: unanswered past the window => DENY R11.expired that resolves the ESCALATE [F31]", () => {
    const { decision, packet, expiresAt } = escalated();
    expect(packet.open_escalations).toEqual([{ decision_id: decision.id, expires_at: expiresAt }]);
    const d = valid(engine.decide(M0, packet, UNVERIFIED, decision.judge, at(expiresAt), { resolves: decision.id }, PROOF_OK));
    expect(d).toMatchObject({ outcome: "DENY", resolves: decision.id, escalation: { state: "EXPIRED", expires_at: expiresAt } });
    expect(d.explanation).toMatchObject({ template_id: "R11.expired", rendered: "Stopped by R11. No answer in 1 min." });
    expect(d.id).not.toBe(decision.id);
    const after = foldPacket(append(append(sealedLog(), "DECISION", decision, T0), "DECISION", d, expiresAt), at(expiresAt));
    expect(after.open_escalations).toEqual([]);
  });

  it("a delegator APPROVE turns the answerable ESCALATE into APPROVE", () => {
    const { decision, packet, expiresAt } = escalated();
    const reply = answer(decision.id, "APPROVE");
    const d = valid(engine.decide(M0, packet, UNVERIFIED, decision.judge, at("2026-10-03T02:12:40Z"), { resolves: decision.id, answer: reply }, PROOF_OK));
    expect(d).toMatchObject({ outcome: "APPROVE", approved_limit_minor: 25900, resolves: decision.id, escalation: { state: "APPROVED", expires_at: expiresAt, answer: reply } });
    expect(d.rules.find((r) => r.id === "R9")).toMatchObject({ result: "PASS", inputs: { cleared_by: "delegator" } });
  });

  it("a delegator DENY reuses the escalating rule's template", () => {
    const { decision, packet } = escalated();
    const d = valid(engine.decide(M0, packet, UNVERIFIED, decision.judge, at("2026-10-03T02:12:40Z"), { resolves: decision.id, answer: answer(decision.id, "DENY") }, PROOF_OK));
    expect(d).toMatchObject({ outcome: "DENY", escalation: { state: "DENIED" }, explanation: { template_id: "R9.unverified" } });
    expect(d.explanation?.rendered).toBe("Stopped by R9. Seller not checked on Scameter.");
  });

  it("an APPROVE answer never overrides a hard rule (revoked meanwhile, R2)", () => {
    const { decision, packet } = escalated();
    const revoked = packetWith(packet, { status: "REVOKED" });
    const d = valid(engine.decide(M0, revoked, UNVERIFIED, decision.judge, at("2026-10-03T02:12:40Z"), { resolves: decision.id, answer: answer(decision.id, "APPROVE") }, PROOF_OK));
    expect(d).toMatchObject({ outcome: "DENY", explanation: { template_id: "R2.revoked" }, escalation: { state: "DENIED" } });
    expect(d.approved_limit_minor).toBeUndefined();
  });

  it("an APPROVE answer never overrides a budget stop (R3) or a judge DENY (R10.injection)", () => {
    const { decision, packet } = escalated();
    const reply = { resolves: decision.id, answer: answer(decision.id, "APPROVE") };
    const poor = packetWithRemaining(packet, 100);
    expect(engine.decide(M0, poor, UNVERIFIED, decision.judge, at("2026-10-03T02:12:40Z"), reply, PROOF_OK).explanation?.template_id).toBe("R3.over_remaining");
    expect(engine.decide(M0, packet, UNVERIFIED, JUDGE_INJECTED, at("2026-10-03T02:12:40Z"), reply, PROOF_OK).explanation?.template_id).toBe("R10.injection");
  });

  it("a late or forged answer is DENY R11, never approval", () => {
    const { decision, packet, expiresAt } = escalated();
    const late = engine.decide(M0, packet, UNVERIFIED, decision.judge, at(expiresAt), { resolves: decision.id, answer: answer(decision.id, "APPROVE", expiresAt) }, PROOF_OK);
    expect(late).toMatchObject({ outcome: "DENY", explanation: { template_id: "R11.expired", inputs: { answer_problem: "answered_late" } } });
    const forged = { ...answer(decision.id, "APPROVE"), signer: "did:key:z6MkMalloryXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" };
    expect(engine.decide(M0, packet, UNVERIFIED, decision.judge, at("2026-10-03T02:12:40Z"), { resolves: decision.id, answer: forged }, PROOF_OK).outcome).toBe("DENY");
  });

  it("the window comes from config [F31]", () => {
    const { decision } = escalated();
    expect(Date.parse(decision.escalation?.expires_at ?? "") - Date.parse(T0)).toBe(ENGINE_CONFIG.escalation.window_ms);
  });
});

describe("decideCheckout: R12 price drift voids the approval", () => {
  const approve = () => engine.decide(M0, PACKET_INITIAL, CART_A1, JUDGE_TEE, at("2026-10-03T02:05:00Z"), undefined, PROOF_OK);
  const quote = (total: number, shipping = 0): MerchantQuote => ({ total_minor: total, subtotal_minor: total - shipping, shipping_minor: shipping, fees_minor: 0, fx_minor: 0 });
  const now = at("2026-10-03T02:06:00Z");

  it("returns null when the re-quote matches: the approval stands, no new decision", () => {
    const approved = approve();
    expect(engine.decideCheckout({ mandate: M0, packet: PACKET_INITIAL, approved, quote: quote(25900), now, ctx: PROOF_OK })).toBeNull();
  });

  it("returns DENY R12.price_drift resolving the APPROVE when the price moved", () => {
    const approved = approve();
    const d = engine.decideCheckout({ mandate: M0, packet: PACKET_INITIAL, approved, quote: quote(27900, 2000), now, ctx: PROOF_OK });
    expect(d).not.toBeNull();
    const decision = valid(d as Decision);
    expect(decision).toMatchObject({ outcome: "DENY", resolves: approved.id, cart: approved.cart, judge: approved.judge });
    expect(decision.explanation).toMatchObject({ template_id: "R12.price_drift", rendered: "Stopped by R12. Price moved, HK$259 to HK$279." });
    expect(decision.id).not.toBe(approved.id);
    expect(decision.rules.filter((r) => r.result === "SKIPPED").map((r) => r.id)).toEqual(["R3", "R4", "R5", "R6", "R7", "R8", "R9", "R10", "R11"]);
  });

  it("denies at checkout after a revoke (R2), even with an unchanged price", () => {
    const approved = approve();
    const d = engine.decideCheckout({ mandate: M0, packet: packetWith(PACKET_INITIAL, { status: "REVOKED" }), approved, quote: quote(25900), now, ctx: PROOF_OK });
    expect(d?.explanation?.template_id).toBe("R2.revoked");
  });

  it("refuses to check out a decision that was not an APPROVE", () => {
    const denied = engine.decide(M0, PACKET_INITIAL, CART_A1, JUDGE_TEE, at("2026-10-03T02:05:00Z"));
    expect(() => engine.decideCheckout({ mandate: M0, packet: PACKET_INITIAL, approved: denied, quote: quote(25900), now })).toThrow(/APPROVE/);
  });
});
