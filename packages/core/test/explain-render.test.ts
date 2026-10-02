import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { TEMPLATE_IDS, formatDuration, formatHkd, formatHkt, formatProbability, render } from "../src/explain";
import type { TemplateId } from "../src/ports";
import { PROPERTY_SEED } from "./engine-arbitraries";

describe("formatHkd (integer cents to HK$)", () => {
  it.each([
    [0, "HK$0"],
    [55000, "HK$550"],
    [54100, "HK$541"],
    [200_000, "HK$2,000"],
    [123_456_789, "HK$1,234,567.89"],
    [5, "HK$0.05"],
    [12_345_60, "HK$12,345.60"],
  ])("%d -> %s", (minor, text) => expect(formatHkd(minor)).toBe(text));

  it.each([[-1], [1.5], [Number.NaN], ["550"], [null], [undefined]])("renders %p as unknown", (bad) => {
    expect(formatHkd(bad)).toBe("HK$?");
  });

  it("round-trips any safe amount through its digits", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }), (minor) => {
        const text = formatHkd(minor);
        const digits = text.replace(/^HK\$/, "").replace(/,/g, "");
        const [whole = "", cents = "00"] = digits.split(".");
        expect(BigInt(whole) * 100n + BigInt(cents)).toBe(BigInt(minor));
      }),
      { seed: PROPERTY_SEED },
    );
  });
});

describe("small formatters", () => {
  it("formats probabilities, durations and HK time", () => {
    expect(formatProbability(0.6808)).toBe("0.68");
    expect(formatProbability(2)).toBe("?");
    expect(formatDuration(60, "en")).toBe("1 min");
    expect(formatDuration(600, "en")).toBe("10 min");
    expect(formatDuration(86_400, "en")).toBe("24 h");
    expect(formatDuration(45, "en")).toBe("45 s");
    expect(formatDuration(600, "zh-HK")).toBe("10 分鐘");
    expect(formatDuration(-3, "en")).toBe("?");
    expect(formatHkt("2026-10-03T02:12:00Z")).toBe("2026-10-03 10:12 HKT");
    expect(formatHkt("2026-10-31T15:59:59Z")).toBe("2026-10-31 23:59 HKT");
    expect(formatHkt("not a time")).toBe("?");
  });
});

describe("render (pure, from template id + recorded inputs)", () => {
  it("renders the documented R3 example [F21, F22]", () => {
    const inputs = { total_minor: 55000, remaining_minor: 54100 };
    expect(render("R3.over_remaining", inputs, "en")).toBe("Stopped by R3. Total HK$550 is over the HK$541 left.");
    expect(render("R3.over_remaining", inputs, "zh-HK")).toBe("由 R3 攔截。總額 HK$550 超過剩餘的 HK$541。");
  });

  it("has an EN and a zh-HK line for every template id in the schema", () => {
    expect(TEMPLATE_IDS).toHaveLength(19);
    for (const id of TEMPLATE_IDS) {
      const en = render(id, {}, "en");
      const zh = render(id, {}, "zh-HK");
      const rule = id.split(".")[0] ?? "";
      expect(en, id).toMatch(new RegExp(`^(Stopped|Escalated) by ${rule}\\. `));
      expect(zh, id).toContain(rule);
      expect(zh, id).not.toBe(en);
    }
  });

  it("uses the verdict for the prefix (a delegator DENY reuses the escalating template)", () => {
    expect(render("R9.unverified", { state: "NO_RECORD" }, "en")).toMatch(/^Escalated by R9\./);
    expect(render("R9.unverified", { state: "NO_RECORD", verdict: "DENY" }, "en")).toMatch(/^Stopped by R9\./);
    expect(render("R10.seller_risk", { verdict: "ESCALATE", p_high_risk: 0.45, threshold: 0.42 }, "en")).toBe(
      "Escalated by R10. Seller risk 0.45 is at or over 0.42.",
    );
  });

  const cases: readonly [TemplateId, Record<string, unknown>, string][] = [
    ["R1.invalid_signature", { proof: "invalid" }, "Stopped by R1. The mandate signature did not verify."],
    ["R1.invalid_signature", { proof: "not_checked" }, "Stopped by R1. The mandate signature was not checked."],
    ["R1.invalid_signature", { proof: "valid", binding: "agent_mismatch" }, "Stopped by R1. This cart is not covered by the mandate."],
    ["R2.revoked", { status: "REVOKED" }, "Stopped by R2. The mandate was revoked."],
    ["R2.expired", { valid_until: "2026-10-31T15:59:59Z" }, "Stopped by R2. Mandate expired at 2026-10-31 23:59 HKT."],
    ["R2.expired", { not_yet_valid: true, valid_from: "2026-10-03T02:00:00Z" }, "Stopped by R2. Mandate is not valid until 2026-10-03 10:00 HKT."],
    ["R3.over_remaining", { total_minor: 55000, computed_total_minor: 56000, total_mismatch: true }, "Stopped by R3. Total HK$550 does not match its parts (HK$560)."],
    ["R4.over_cap", { total_minor: 40000, cap_minor: 27050 }, "Stopped by R4. Total HK$400 is over the HK$270.50 per-purchase cap."],
    ["R4.ask_above", { total_minor: 35000, ask_above_minor: 30000 }, "Escalated by R4. Total HK$350 is over the HK$300 ask-first amount."],
    ["R5.over_ceiling", { total_minor: 210000, ceiling_minor: 200000 }, "Stopped by R5. Total HK$2,100 is over the HK$2,000 card ceiling."],
    ["R6.off_mandate", { reason: "category", off_categories: ["electronics"], categories: ["apparel"] }, "Stopped by R6. Category electronics is outside apparel."],
    ["R6.off_mandate", { reason: "merchant_denied", domain: "bad.example" }, "Stopped by R6. Merchant bad.example is on the deny list."],
    ["R6.off_mandate", { reason: "merchant_not_allowed", domain: "x.example" }, "Stopped by R6. Merchant x.example is not on the allow list."],
    ["R7.velocity", { mints_in_window: 3, max_mints: 3, window_s: 600 }, "Stopped by R7. 3 mints in 10 min already; the limit is 3."],
    ["R8.max_active", { active_cards: 2, max_active: 2 }, "Stopped by R8. 2 cards are active; the rail allows 2."],
    ["R9.flagged", { captured_at: "2026-10-03T01:40:00Z" }, "Stopped by R9. Seller flagged on Scameter (2026-10-03 09:40 HKT)."],
    ["R9.unverified", { state: "NOT_CHECKED" }, "Escalated by R9. Seller not checked on Scameter."],
    ["R9.unverified", { state: "NO_RECORD", stale: true, max_capture_age_s: 86400 }, "Escalated by R9. Scameter check is older than 24 h."],
    ["R9.unverified", { state: "NO_RECORD" }, "Escalated by R9. No record, not proof of safety."],
    ["R10.injection", { p_injection_risk: 0.6818, threshold: 0.63 }, "Stopped by R10. Injection risk 0.68 is at or over 0.63."],
    ["R10.scope", { p_in_scope: 0.4396, threshold: 0.55, categories: ["apparel"] }, "Escalated by R10. May be outside apparel (in scope 0.44, under 0.55)."],
    ["R10.escalate", { p_escalate: 0.55, threshold: 0.5 }, "Escalated by R10. The judge leans to asking you first (0.55, limit 0.50)."],
    ["R10.unavailable", { status: "TIMEOUT" }, "Escalated by R10. The judge gave no usable answer (timed out), so you decide."],
    ["R10.unavailable", { status: "ERROR", input_truncated: true }, "Escalated by R10. The judge gave no usable answer (listing cut off), so you decide."],
    ["R11.expired", { window_s: 60 }, "Stopped by R11. No answer in 1 min."],
    ["R11.expired", { answer_problem: "signer_mismatch" }, "Stopped by R11. The escalation answer was not valid (signer_mismatch)."],
    ["R11.expired", { choice: "DENY" }, "Stopped by R11. You said no."],
    ["R12.price_drift", { approved_total_minor: 25900, checkout_total_minor: 27900 }, "Stopped by R12. Price moved, HK$259 to HK$279."],
  ];

  it.each(cases)("%s %j", (id, inputs, text) => expect(render(id, inputs, "en")).toBe(text));

  it("never throws and never leaks a stack on hostile inputs", () => {
    fc.assert(
      fc.property(fc.constantFrom(...TEMPLATE_IDS), fc.dictionary(fc.string(), fc.anything()), fc.constantFrom("en", "zh-HK"), (id, inputs, locale) => {
        const text = render(id, inputs, locale as "en" | "zh-HK");
        expect(typeof text).toBe("string");
        expect(text.length).toBeGreaterThan(0);
      }),
      { seed: PROPERTY_SEED },
    );
  });

  it("is pure: same inputs give the same text", () => {
    const inputs = Object.freeze({ total_minor: 55000, remaining_minor: 54100 });
    expect(render("R3.over_remaining", inputs, "en")).toBe(render("R3.over_remaining", inputs, "en"));
  });

  it("falls back to a fail-safe line for an unknown template id", () => {
    expect(render("R99.nope" as TemplateId, {}, "en")).toBe("Stopped. Unknown rule template R99.nope.");
  });
});
