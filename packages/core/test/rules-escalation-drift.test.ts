// R11 unanswered escalation after the window [F31], R12 price drift at checkout (A-13, A-14).
import { describe, expect, it } from "vitest";
import { ENGINE_CONFIG } from "../src/config";
import { cartSha256 } from "../src/log";
import type { EscalationAnswer } from "../src/ports";
import { evaluateR11, evaluateR12 } from "../src/rules";
import { CART_A1, CART_A4, M0, PACKET_AFTER_A1, at, packetWith } from "./engine-helpers";

const ESC_ID = "dec_escalated0001";
const EXPIRES = "2026-10-03T02:13:00.000Z";
const packet = packetWith(PACKET_AFTER_A1, { open_escalations: [{ decision_id: ESC_ID, expires_at: EXPIRES }] });
const answer = (patch: Partial<EscalationAnswer> = {}): EscalationAnswer => ({
  decision_id: ESC_ID,
  mandate_id: M0.id,
  cart_sha256: cartSha256(CART_A1), // laisee.resolve.v2 binding (unsigned here: R11 checks binding and timing)
  choice: "APPROVE",
  answered_at: "2026-10-03T02:12:30Z",
  signer: M0.delegator,
  signature: "A".repeat(86),
  ...patch,
});

describe("R11 escalation answered in time, else DENY", () => {
  const evaluate = (resolution: Parameters<typeof evaluateR11>[0]["resolution"], now = at("2026-10-03T02:12:40Z"), p = packet) =>
    evaluateR11({ mandate: M0, packet: p, cart: CART_A1, resolution, now, config: ENGINE_CONFIG });

  it("is SKIPPED outside an escalation", () => {
    expect(evaluate(undefined).result).toEqual({ id: "R11", result: "SKIPPED", inputs: {} });
  });

  it("passes a valid answer given before expires_at", () => {
    const { result, answer: accepted } = evaluate({ resolves: ESC_ID, answer: answer() });
    expect(result).toMatchObject({ result: "PASS", comparator: "<", threshold_ref: "F31", inputs: { answered: true, choice: "APPROVE" } });
    expect(accepted?.choice).toBe("APPROVE");
  });

  it("denies with R11.expired when no answer came in the window (S5)", () => {
    const { result, answer: accepted } = evaluate({ resolves: ESC_ID }, at(EXPIRES));
    expect(result).toMatchObject({ result: "FAIL", verdict: "DENY", template_id: "R11.expired" });
    expect(result.inputs).toMatchObject({ answered: false, expires_at: EXPIRES, window_s: 60 });
    expect(accepted).toBeNull();
  });

  it.each([
    ["decision_id_mismatch", answer({ decision_id: "dec_someoneElse01" })],
    ["mandate_id_mismatch", answer({ mandate_id: "mnd_otherMandate1" })],
    ["cart_sha256_mismatch", answer({ cart_sha256: cartSha256(CART_A4) })],
    ["signer_mismatch", answer({ signer: "did:key:z6MkMalloryXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" })],
    ["invalid_choice", answer({ choice: "MAYBE" as never })],
    ["answered_late", answer({ answered_at: EXPIRES })],
    ["invalid_time", answer({ answered_at: "yesterday" })],
  ])("denies an invalid answer (%s), never treats it as approval", (problem, bad) => {
    const { result, answer: accepted } = evaluate({ resolves: ESC_ID, answer: bad });
    expect(result).toMatchObject({ result: "FAIL", verdict: "DENY", template_id: "R11.expired", inputs: { answer_problem: problem } });
    expect(accepted).toBeNull();
  });

  it("denies a resolution for an escalation that is not open", () => {
    const { result } = evaluate({ resolves: "dec_notOpen0001", answer: answer({ decision_id: "dec_notOpen0001" }) });
    expect(result).toMatchObject({ result: "FAIL", verdict: "DENY", inputs: { answer_problem: "not_open" } });
  });

  it("denies a timer firing before the window ends (fail closed)", () => {
    const { result } = evaluate({ resolves: ESC_ID }, at("2026-10-03T02:12:59Z"));
    expect(result).toMatchObject({ result: "FAIL", verdict: "DENY", inputs: { answer_problem: "window_open" } });
  });
});

describe("R12 price drift between approval and checkout voids the approval", () => {
  const quote = (patch: Partial<Record<string, number>> = {}) => ({
    total_minor: CART_A1.total_minor,
    subtotal_minor: CART_A1.subtotal_minor,
    shipping_minor: CART_A1.shipping_minor,
    fees_minor: CART_A1.fees_minor,
    fx_minor: 0,
    ...patch,
  });

  it("passes an identical re-quote", () => {
    expect(evaluateR12({ approved: CART_A1, quote: quote() })).toMatchObject({ id: "R12", result: "PASS", comparator: "==" });
  });

  it("denies any change, up or down, and names the changed fields", () => {
    const up = evaluateR12({ approved: CART_A1, quote: quote({ total_minor: 27900, shipping_minor: 2000 }) });
    expect(up).toMatchObject({ result: "FAIL", verdict: "DENY", template_id: "R12.price_drift" });
    expect(up.inputs).toEqual({ approved_total_minor: 25900, checkout_total_minor: 27900, changed: ["total_minor", "shipping_minor"] });
    expect(evaluateR12({ approved: CART_A1, quote: quote({ total_minor: 25800, subtotal_minor: 25800 }) }).result).toBe("FAIL");
  });

  it("denies a malformed quote (fail closed)", () => {
    expect(evaluateR12({ approved: CART_A1, quote: quote({ fx_minor: Number.NaN }) }).result).toBe("FAIL");
  });
});
