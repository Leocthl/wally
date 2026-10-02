// R3 total <= remaining, R4 per-purchase cap / ask_above, R5 rail ceiling [F1] (A-05, A-06, A-07).
import { describe, expect, it } from "vitest";
import { ENGINE_CONFIG } from "../src/config";
import { evaluateR3, evaluateR4, evaluateR5 } from "../src/rules";
import { CART_A1, CART_A3, M0, PACKET_AFTER_A1, cartWithTotal, packetWithRemaining, withRules } from "./engine-helpers";

describe("R3 total <= packet remaining (total includes shipping, fees, FX)", () => {
  it("denies HK$550 against HK$541 left [F22]", () => {
    const r = evaluateR3({ cart: CART_A3, packet: PACKET_AFTER_A1 });
    expect(r).toEqual({
      id: "R3",
      result: "FAIL",
      verdict: "DENY",
      inputs: { total_minor: 55000, remaining_minor: 54100 },
      comparator: "<=",
      threshold_ref: "packet.remaining_minor",
      template_id: "R3.over_remaining",
    });
  });

  it("passes exactly at the limit and fails one cent over", () => {
    const packet = packetWithRemaining(PACKET_AFTER_A1, 30000);
    expect(evaluateR3({ cart: cartWithTotal(CART_A1, 30000), packet }).result).toBe("PASS");
    expect(evaluateR3({ cart: cartWithTotal(CART_A1, 30001), packet }).result).toBe("FAIL");
  });

  it("counts shipping: HK$520 subtotal fits HK$541, HK$550 with shipping does not [F22]", () => {
    const noShipping = { ...CART_A3, shipping_minor: 0, total_minor: 52000 };
    expect(evaluateR3({ cart: noShipping, packet: PACKET_AFTER_A1 }).result).toBe("PASS");
    expect(evaluateR3({ cart: CART_A3, packet: PACKET_AFTER_A1 }).result).toBe("FAIL");
  });

  it("counts the FX fee", () => {
    const fx = { listed_currency: "USD", listed_amount_minor: 3300, rate: "7.8", rate_observed_at: "2026-10-03T02:00:00Z", rate_source_ref: "SIM-rate", fee_minor: 300, fee_ref: "F3.fx_settled_hkd" };
    const cart = { ...cartWithTotal(CART_A1, 54000), fx, total_minor: 54300 };
    expect(evaluateR3({ cart, packet: PACKET_AFTER_A1 })).toMatchObject({ result: "FAIL", template_id: "R3.over_remaining" });
  });

  it("denies a cart whose total does not add up (fail closed)", () => {
    const cheatTotal = { ...CART_A3, total_minor: 50000 };
    const r = evaluateR3({ cart: cheatTotal, packet: PACKET_AFTER_A1 });
    expect(r).toMatchObject({ result: "FAIL", verdict: "DENY", template_id: "R3.over_remaining" });
    expect(r.inputs).toMatchObject({ total_mismatch: true, computed_total_minor: 55000 });
    const cheatItems = { ...CART_A1, subtotal_minor: 100, total_minor: 100 };
    expect(evaluateR3({ cart: cheatItems, packet: PACKET_AFTER_A1 }).inputs["total_mismatch"]).toBe(true);
  });

  it("denies a currency that is not the packet currency", () => {
    const r = evaluateR3({ cart: { ...CART_A1, currency: "USD" as never }, packet: PACKET_AFTER_A1 });
    expect(r).toMatchObject({ result: "FAIL", template_id: "R3.over_remaining" });
    expect(r.inputs["currency_mismatch"]).toBe(true);
  });
});

describe("R4 per-purchase cap (fixed or adaptive) and ask_above", () => {
  const cart = (total: number) => cartWithTotal(CART_A1, total);

  it("is SKIPPED when the mandate has no per_purchase rule (M0: R3 binds)", () => {
    expect(evaluateR4({ mandate: M0, packet: PACKET_AFTER_A1, cart: CART_A3 })).toEqual({ id: "R4", result: "SKIPPED", inputs: { per_purchase: null } });
  });

  it("enforces a fixed cap, passing exactly at the cap", () => {
    const mandate = withRules(M0, { per_purchase: { hard_cap_minor: 30000 } });
    expect(evaluateR4({ mandate, packet: PACKET_AFTER_A1, cart: cart(30000) })).toMatchObject({ result: "PASS", comparator: "<=", threshold_ref: "mandate.rules.per_purchase.hard_cap_minor" });
    expect(evaluateR4({ mandate, packet: PACKET_AFTER_A1, cart: cart(30001) })).toMatchObject({ result: "FAIL", verdict: "DENY", template_id: "R4.over_cap" });
  });

  it("enforces an adaptive share of remaining, floored to whole cents", () => {
    const mandate = withRules(M0, { per_purchase: { share_of_remaining_bp: 5000 } });
    const packet = packetWithRemaining(PACKET_AFTER_A1, 54101); // half = 27050.5 -> cap 27050
    const ok = evaluateR4({ mandate, packet, cart: cart(27050) });
    expect(ok).toMatchObject({ result: "PASS", threshold_ref: "mandate.rules.per_purchase.share_of_remaining_bp" });
    expect(ok.inputs).toMatchObject({ cap_minor: 27050, share_cap_minor: 27050 });
    expect(evaluateR4({ mandate, packet, cart: cart(27051) })).toMatchObject({ result: "FAIL", template_id: "R4.over_cap" });
  });

  it("uses the smaller of the fixed and adaptive caps", () => {
    const mandate = withRules(M0, { per_purchase: { hard_cap_minor: 20000, share_of_remaining_bp: 5000 } });
    const r = evaluateR4({ mandate, packet: PACKET_AFTER_A1, cart: cart(20001) });
    expect(r).toMatchObject({ result: "FAIL", threshold_ref: "mandate.rules.per_purchase.hard_cap_minor" });
    expect(r.inputs["cap_minor"]).toBe(20000);
  });

  it("escalates above ask_above, passing exactly at it", () => {
    const mandate = withRules(M0, { per_purchase: { ask_above_minor: 30000 } });
    expect(evaluateR4({ mandate, packet: PACKET_AFTER_A1, cart: cart(30000) }).result).toBe("PASS");
    expect(evaluateR4({ mandate, packet: PACKET_AFTER_A1, cart: cart(35000) })).toMatchObject({
      result: "FAIL",
      verdict: "ESCALATE",
      template_id: "R4.ask_above",
      threshold_ref: "mandate.rules.per_purchase.ask_above_minor",
    });
  });

  it("denies over the cap even when ask_above would only escalate", () => {
    const mandate = withRules(M0, { per_purchase: { hard_cap_minor: 40000, ask_above_minor: 30000 } });
    expect(evaluateR4({ mandate, packet: PACKET_AFTER_A1, cart: cart(45000) })).toMatchObject({ verdict: "DENY", template_id: "R4.over_cap" });
  });
});

describe("R5 rail ceiling [F1]", () => {
  const ceiling = ENGINE_CONFIG.rail.ceiling_minor;

  it("passes at the ceiling and denies one cent over", () => {
    expect(evaluateR5({ cart: cartWithTotal(CART_A1, ceiling), config: ENGINE_CONFIG })).toMatchObject({
      result: "PASS",
      inputs: { total_minor: ceiling, ceiling_minor: ceiling },
      comparator: "<=",
      threshold_ref: "F1.ceiling",
    });
    expect(evaluateR5({ cart: cartWithTotal(CART_A1, ceiling + 1), config: ENGINE_CONFIG })).toMatchObject({
      result: "FAIL",
      verdict: "DENY",
      template_id: "R5.over_ceiling",
    });
  });
});
