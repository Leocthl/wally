// Engine hardening (lane e-orch, item 1): a resolution binds to the logged ESCALATE it answers. The engine
// accepts it only with the escalated decision present, OPEN, named by `resolves`, on the same cart (fingerprint),
// and, with an answer, a verified delegator signature. Anything else is DENY R11 with answer_problem.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createEngine, engine } from "../src/engine";
import type { Cart, Decision, PacketState } from "../src/generated";
import { foldPacket } from "../src/packet";
import type { DecideContext, Engine, EscalationAnswer, EscalationResolution } from "../src/ports";
import { validateDecision } from "../src/schema";
import { PROPERTY_SEED } from "./engine-arbitraries";
import { CART_A1, CART_A4, JUDGE_TEE, M0, PACKET_INITIAL, at, cartWithTotal } from "./engine-helpers";
import { append, sealedLog } from "./packet-helpers";

const T0 = "2026-10-03T02:12:00Z";
const IN_WINDOW = "2026-10-03T02:12:40Z";
const NOT_CHECKED = { state: "NOT_CHECKED" as const, capture_ref: null, captured_at: null, searched: [] };
const UNVERIFIED: Cart = { ...CART_A1, scameter: NOT_CHECKED };
const SIGNED: DecideContext = { mandateProofValid: true, answerSignatureValid: true };

function escalated(cart: Cart = UNVERIFIED): { decision: Decision; packet: PacketState; expiresAt: string } {
  const decision = engine.decide(M0, PACKET_INITIAL, cart, JUDGE_TEE, at(T0), undefined, { mandateProofValid: true });
  expect(decision.outcome).toBe("ESCALATE");
  const packet = foldPacket(append(sealedLog(), "DECISION", decision, T0), at(T0));
  return { decision, packet, expiresAt: decision.escalation?.expires_at ?? "" };
}

const answer = (decisionId: string, choice: "APPROVE" | "DENY" = "APPROVE", answeredAt = "2026-10-03T02:12:30Z"): EscalationAnswer => ({
  decision_id: decisionId,
  choice,
  answered_at: answeredAt,
  signer: M0.delegator,
  signature: "A".repeat(86),
});

function decideResolution(packet: PacketState, cart: Cart, resolution: EscalationResolution, ctx: DecideContext = SIGNED, now = IN_WINDOW): Decision {
  const d = engine.decide(M0, packet, cart, JUDGE_TEE, at(now), resolution, ctx);
  const check = validateDecision(d);
  expect(check.ok, JSON.stringify(check)).toBe(true);
  return d;
}

const problemOf = (d: Decision): unknown => d.rules.find((r) => r.id === "R11")?.inputs["answer_problem"];

describe("resolution binding: a valid answer applied to the escalation it names", () => {
  it("approves when escalated, resolves, cart and signature all line up", () => {
    const { decision, packet } = escalated();
    const d = decideResolution(packet, UNVERIFIED, { resolves: decision.id, answer: answer(decision.id), escalated: decision });
    expect(d).toMatchObject({ outcome: "APPROVE", approved_limit_minor: 25900, resolves: decision.id, escalation: { state: "APPROVED" } });
  });

  it("the cart fingerprint ignores id and proposed_at: a re-built cart with the same prices still binds", () => {
    const { decision, packet } = escalated();
    const rebuilt: Cart = { ...UNVERIFIED, id: "crt_rebuiltA1x", proposed_at: "2026-10-03T02:12:20Z" };
    const d = decideResolution(packet, rebuilt, { resolves: decision.id, answer: answer(decision.id), escalated: decision });
    expect(d.outcome).toBe("APPROVE");
  });

  it("unanswered past the window stays DENY R11.expired (state EXPIRED, no answer_problem)", () => {
    const { decision, packet, expiresAt } = escalated();
    const d = decideResolution(packet, UNVERIFIED, { resolves: decision.id, escalated: decision }, { mandateProofValid: true }, expiresAt);
    expect(d).toMatchObject({ outcome: "DENY", resolves: decision.id, escalation: { state: "EXPIRED" }, explanation: { template_id: "R11.expired" } });
    expect(problemOf(d)).toBeUndefined();
    expect(d.explanation?.rendered).toBe("Stopped by R11. No answer in 1 min.");
  });
});

describe("resolution binding failures are DENY R11 with answer_problem naming the cause", () => {
  it("escalated_missing: an answer without the escalated decision never approves", () => {
    const { decision, packet } = escalated();
    const d = decideResolution(packet, UNVERIFIED, { resolves: decision.id, answer: answer(decision.id) });
    expect(d).toMatchObject({ outcome: "DENY", resolves: decision.id, explanation: { template_id: "R11.expired" } });
    expect(problemOf(d)).toBe("escalated_missing");
    expect(d.explanation?.rendered).toBe("Stopped by R11. The escalation answer was not valid (escalated_missing).");
    expect(d.escalation).toMatchObject({ state: "DENIED" });
  });

  it("escalated_missing also on the expiry path (no answer, window passed)", () => {
    const { decision, packet, expiresAt } = escalated();
    const d = decideResolution(packet, UNVERIFIED, { resolves: decision.id }, { mandateProofValid: true }, expiresAt);
    expect(d).toMatchObject({ outcome: "DENY", escalation: { state: "EXPIRED" } });
    expect(problemOf(d)).toBe("escalated_missing");
  });

  it("escalated_mismatch: the escalated decision is not the one `resolves` names", () => {
    const { decision, packet } = escalated();
    const other = { ...decision, id: "dec_someOtherEsc01" };
    const d = decideResolution(packet, UNVERIFIED, { resolves: decision.id, answer: answer(decision.id), escalated: other });
    expect(problemOf(d)).toBe("escalated_mismatch");
    expect(d.outcome).toBe("DENY");
  });

  it("not_escalated: only an ESCALATE decision can be resolved", () => {
    const { decision, packet } = escalated();
    const approved = engine.decide(M0, PACKET_INITIAL, CART_A1, JUDGE_TEE, at(T0), undefined, { mandateProofValid: true });
    const posing = { ...approved, id: decision.id };
    const d = decideResolution(packet, CART_A1, { resolves: decision.id, answer: answer(decision.id), escalated: posing });
    expect(problemOf(d)).toBe("not_escalated");
  });

  it("escalation_not_open: a decision whose escalation is closed cannot be answered", () => {
    const { decision, packet } = escalated();
    const closed: Decision = { ...decision, escalation: { state: "EXPIRED", expires_at: decision.escalation?.expires_at ?? "" } };
    const d = decideResolution(packet, UNVERIFIED, { resolves: decision.id, answer: answer(decision.id), escalated: closed });
    expect(problemOf(d)).toBe("escalation_not_open");
  });

  it("cart_mismatch: a valid APPROVE answer applied to a different cart never approves", () => {
    const { decision, packet } = escalated();
    const pricier = { ...cartWithTotal(UNVERIFIED, 30000), scameter: NOT_CHECKED };
    const d = decideResolution(packet, pricier, { resolves: decision.id, answer: answer(decision.id), escalated: decision });
    expect(d).toMatchObject({ outcome: "DENY" });
    expect(d.approved_limit_minor).toBeUndefined();
    expect(problemOf(d)).toBe("cart_mismatch");
  });

  it("cart_mismatch when the escalated decision carries no usable cart", () => {
    const { decision, packet } = escalated();
    const broken = { ...decision, cart: { ...decision.cart, total_minor: Number.NaN } };
    const d = decideResolution(packet, UNVERIFIED, { resolves: decision.id, answer: answer(decision.id), escalated: broken });
    expect(problemOf(d)).toBe("cart_mismatch");
    const missing = { ...decision, cart: null } as unknown as Decision;
    expect(problemOf(decideResolution(packet, UNVERIFIED, { resolves: decision.id, answer: answer(decision.id), escalated: missing }))).toBe("cart_mismatch");
  });

  it("escalation_not_open when the escalated decision has no escalation block at all", () => {
    const { decision, packet } = escalated();
    const { escalation: _escalation, ...bare } = decision;
    const d = decideResolution(packet, UNVERIFIED, { resolves: decision.id, answer: answer(decision.id), escalated: bare as Decision });
    expect(problemOf(d)).toBe("escalation_not_open");
  });

  it("signature_invalid: an answer needs ctx.answerSignatureValid === true", () => {
    const { decision, packet } = escalated();
    const resolution = { resolves: decision.id, answer: answer(decision.id), escalated: decision };
    for (const ctx of [{ mandateProofValid: true }, { mandateProofValid: true, answerSignatureValid: false }] as DecideContext[]) {
      const d = decideResolution(packet, UNVERIFIED, resolution, ctx);
      expect(problemOf(d)).toBe("signature_invalid");
      expect(d.outcome).toBe("DENY");
    }
  });

  it("decision_id_mismatch: the answer must name the decision it resolves", () => {
    const { decision, packet } = escalated();
    const d = decideResolution(packet, UNVERIFIED, { resolves: decision.id, answer: answer("dec_someOtherEsc01"), escalated: decision });
    expect(problemOf(d)).toBe("decision_id_mismatch");
  });

  it("a DENY answer with every binding in place is still DENY (state DENIED)", () => {
    const { decision, packet } = escalated();
    const d = decideResolution(packet, UNVERIFIED, { resolves: decision.id, answer: answer(decision.id, "DENY"), escalated: decision });
    expect(d).toMatchObject({ outcome: "DENY", escalation: { state: "DENIED" }, explanation: { template_id: "R9.unverified" } });
    expect(problemOf(d)).toBeUndefined();
  });
});

describe("resolution binding properties", () => {
  it("a valid-looking APPROVE answer applied to any other cart never approves", () => {
    const { decision, packet } = escalated();
    const otherCart = fc
      .record({ total: fc.integer({ min: 0, max: 79_000 }), base: fc.constantFrom(UNVERIFIED, { ...CART_A4, scameter: NOT_CHECKED }) })
      .map(({ total, base }) => ({ ...cartWithTotal(base, total), scameter: NOT_CHECKED }))
      .filter((c) => JSON.stringify({ ...c, id: "", proposed_at: "" }) !== JSON.stringify({ ...UNVERIFIED, id: "", proposed_at: "" }));
    fc.assert(
      fc.property(otherCart, fc.constantFrom("APPROVE" as const, "DENY" as const), (cart, choice) => {
        const d = engine.decide(M0, packet, cart, JUDGE_TEE, at(IN_WINDOW), { resolves: decision.id, answer: answer(decision.id, choice), escalated: decision }, SIGNED);
        expect(d.outcome).toBe("DENY");
        expect(d.approved_limit_minor).toBeUndefined();
      }),
      { numRuns: 200, seed: PROPERTY_SEED },
    );
  }, 60_000);

  it("approves exactly when every binding holds (escalated, id, OPEN, same cart, signature, answer target)", () => {
    const { decision, packet, expiresAt } = escalated();
    const pricier = { ...cartWithTotal(UNVERIFIED, 30000), scameter: NOT_CHECKED };
    const flags = fc.record({
      withEscalated: fc.boolean(),
      idMatches: fc.boolean(),
      open: fc.boolean(),
      sameCart: fc.boolean(),
      signature: fc.constantFrom(true, false, undefined),
      answersThis: fc.boolean(),
    });
    fc.assert(
      fc.property(flags, (b) => {
        const esc: Decision = {
          ...decision,
          id: b.idMatches ? decision.id : "dec_someOtherEsc01",
          escalation: b.open ? { state: "OPEN", expires_at: expiresAt } : { state: "DENIED", expires_at: expiresAt },
        };
        const reply = answer(b.answersThis ? decision.id : "dec_someOtherEsc01");
        const resolution: EscalationResolution = { resolves: decision.id, answer: reply, ...(b.withEscalated ? { escalated: esc } : {}) };
        const ctx: DecideContext = b.signature === undefined ? { mandateProofValid: true } : { mandateProofValid: true, answerSignatureValid: b.signature };
        const d = engine.decide(M0, packet, b.sameCart ? UNVERIFIED : pricier, JUDGE_TEE, at(IN_WINDOW), resolution, ctx);
        const binds = b.withEscalated && b.idMatches && b.open && b.sameCart && b.signature === true && b.answersThis;
        expect(d.outcome === "APPROVE").toBe(binds);
        if (!binds) expect(d.explanation?.template_id).toBe("R11.expired");
      }),
      { numRuns: 300, seed: PROPERTY_SEED },
    );
  }, 60_000);

  it("is deterministic with the binding in place", () => {
    const { decision, packet } = escalated();
    const resolution = { resolves: decision.id, answer: answer(decision.id), escalated: decision };
    const once = engine.decide(M0, packet, UNVERIFIED, JUDGE_TEE, at(IN_WINDOW), resolution, SIGNED);
    expect(JSON.stringify(engine.decide(M0, packet, UNVERIFIED, JUDGE_TEE, at(IN_WINDOW), resolution, SIGNED))).toBe(JSON.stringify(once));
  });
});

describe("Engine port", () => {
  it("exposes decideCheckout on the Engine interface", () => {
    const port: Engine = createEngine();
    const approved = port.decide(M0, PACKET_INITIAL, CART_A1, JUDGE_TEE, at(T0), undefined, { mandateProofValid: true });
    const quote = { total_minor: 25900, subtotal_minor: 25900, shipping_minor: 0, fees_minor: 0, fx_minor: 0 };
    expect(port.decideCheckout({ mandate: M0, packet: PACKET_INITIAL, approved, quote, now: at(IN_WINDOW), ctx: { mandateProofValid: true } })).toBeNull();
  });
});
