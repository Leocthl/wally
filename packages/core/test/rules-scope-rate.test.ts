// R6 merchant and category, R7 velocity [F32], R8 active cards [F1] (A-08, A-09, A-10).
import { describe, expect, it } from "vitest";
import { ENGINE_CONFIG } from "../src/config";
import { evaluateR6, evaluateR7, evaluateR8 } from "../src/rules";
import { CART_A1, M0, PACKET_AFTER_A1, PACKET_INITIAL, at, packetWith, withRules } from "./engine-helpers";

describe("R6 merchant and category inside the mandate", () => {
  it("passes an apparel cart from any domain when allow is null", () => {
    expect(evaluateR6({ mandate: M0, cart: CART_A1 })).toMatchObject({
      result: "PASS",
      inputs: { domain: "demo-apparel.example", allow: null, categories: ["apparel"], item_categories: ["apparel"] },
      comparator: "in",
      threshold_ref: "mandate.rules.categories",
    });
  });

  it("denies an off-category item [F29]", () => {
    const cart = { ...CART_A1, items: [{ ...CART_A1.items[0], category: "electronics" }] as Cart["items"] };
    const r = evaluateR6({ mandate: M0, cart });
    expect(r).toMatchObject({ result: "FAIL", verdict: "DENY", template_id: "R6.off_mandate" });
    expect(r.inputs).toMatchObject({ reason: "category", off_categories: ["electronics"] });
  });

  it("denies a denied domain and its subdomains; deny wins over allow", () => {
    const mandate = withRules(M0, { merchants: { allow: ["demo-apparel.example"], deny: ["demo-apparel.example"] } });
    expect(evaluateR6({ mandate, cart: CART_A1 }).inputs["reason"]).toBe("merchant_denied");
    const sub = withRules(M0, { merchants: { allow: null, deny: ["apparel.example"] } });
    const cart = { ...CART_A1, merchant: { ...CART_A1.merchant, domain: "demo.apparel.example" } };
    expect(evaluateR6({ mandate: sub, cart })).toMatchObject({ result: "FAIL", template_id: "R6.off_mandate" });
  });

  it("denies a domain missing from a non-null allow list (exact match only)", () => {
    const mandate = withRules(M0, { merchants: { allow: ["apparel.example"], deny: [] } });
    const r = evaluateR6({ mandate, cart: CART_A1 });
    expect(r).toMatchObject({ result: "FAIL", template_id: "R6.off_mandate", threshold_ref: "mandate.rules.merchants.allow" });
    expect(r.inputs["reason"]).toBe("merchant_not_allowed");
    const exact = withRules(M0, { merchants: { allow: ["demo-apparel.example"], deny: [] } });
    expect(evaluateR6({ mandate: exact, cart: CART_A1 }).result).toBe("PASS");
  });
});

type Cart = typeof CART_A1;

describe("R7 velocity: more than 3 approved mints in a rolling 10 min => DENY [F32]", () => {
  const now = at("2026-10-03T02:20:00Z");
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();
  const packet = (times: string[]) => packetWith(PACKET_INITIAL, { mint_times: times });

  it("passes with 2 mints in the window and denies the 4th mint", () => {
    expect(evaluateR7({ mandate: M0, packet: packet([minutesAgo(9), minutesAgo(1)]), now, config: ENGINE_CONFIG }).result).toBe("PASS");
    const r = evaluateR7({ mandate: M0, packet: packet([minutesAgo(9), minutesAgo(5), minutesAgo(1)]), now, config: ENGINE_CONFIG });
    expect(r).toMatchObject({ result: "FAIL", verdict: "DENY", template_id: "R7.velocity", comparator: "<", threshold_ref: "F32" });
    expect(r.inputs).toEqual({ mints_in_window: 3, max_mints: 3, window_s: 600 });
  });

  it("drops a mint exactly one window old (rolling window)", () => {
    const r = evaluateR7({ mandate: M0, packet: packet([minutesAgo(10), minutesAgo(5), minutesAgo(1)]), now, config: ENGINE_CONFIG });
    expect(r).toMatchObject({ result: "PASS", inputs: { mints_in_window: 2 } });
  });

  it("honours a mandate override", () => {
    const mandate = withRules(M0, { velocity: { max_mints: 1, window_s: 60 } });
    const r = evaluateR7({ mandate, packet: packet([minutesAgo(0.5)]), now, config: ENGINE_CONFIG });
    expect(r).toMatchObject({ result: "FAIL", threshold_ref: "mandate.rules.velocity.max_mints" });
  });

  it("counts unreadable or future mint times (fail closed)", () => {
    const r = evaluateR7({ mandate: M0, packet: packet(["garbage", minutesAgo(-5), minutesAgo(1)]), now, config: ENGINE_CONFIG });
    expect(r.inputs["mints_in_window"]).toBe(3);
  });
});

describe("R8 active cards below the rail maximum [F1]", () => {
  const card = (n: number) => ({ id: `crd_test000${n}`, limit_minor: 100, expires_at: "2026-10-03T03:00:00Z" });

  it("passes with 1 active card and denies at the maximum of 2", () => {
    expect(evaluateR8({ packet: packetWith(PACKET_AFTER_A1, { active_cards: [card(1)] }), config: ENGINE_CONFIG })).toMatchObject({
      result: "PASS",
      inputs: { active_cards: 1, max_active: 2 },
      comparator: "<",
      threshold_ref: "F1.active",
    });
    expect(evaluateR8({ packet: packetWith(PACKET_AFTER_A1, { active_cards: [card(1), card(2)] }), config: ENGINE_CONFIG })).toMatchObject({
      result: "FAIL",
      verdict: "DENY",
      template_id: "R8.max_active",
    });
  });
});
