// R9 Scameter state and capture age [F52], R10 judge thresholds [F36, F50] (A-11, A-12).
import { describe, expect, it } from "vitest";
import { ENGINE_CONFIG } from "../src/config";
import type { JudgeRecord } from "../src/generated";
import { evaluateR9, evaluateR10 } from "../src/rules";
import { CART_A1, CART_A2, JUDGE_EARBUDS, JUDGE_FLAGGED, JUDGE_INJECTED, JUDGE_TEE, M0, at, judgeWith, withRules } from "./engine-helpers";

describe("R9 seller check: FLAGGED => DENY, NOT_CHECKED or stale => ESCALATE; no record is not safe [F6]", () => {
  const now = at("2026-10-03T02:12:00Z");
  const scameter = (patch: Partial<typeof CART_A1.scameter>) => ({ ...CART_A1, scameter: { ...CART_A1.scameter, ...patch } });

  it("passes a fresh NO_RECORD capture and records its age", () => {
    const r = evaluateR9({ mandate: M0, cart: CART_A1, now, config: ENGINE_CONFIG });
    expect(r).toMatchObject({ result: "PASS", comparator: "<=", threshold_ref: "F52" });
    expect(r.inputs).toMatchObject({ state: "NO_RECORD", capture_age_s: 2520, max_capture_age_s: 86_400 });
  });

  it("denies a FLAGGED seller (S2), even when the capture is stale or not required", () => {
    expect(evaluateR9({ mandate: M0, cart: CART_A2, now, config: ENGINE_CONFIG })).toMatchObject({ result: "FAIL", verdict: "DENY", template_id: "R9.flagged" });
    const lax = withRules(M0, { seller_check: { require_capture: false } });
    const stale = { ...CART_A2, scameter: { ...CART_A2.scameter, captured_at: "2026-09-01T00:00:00Z" } };
    expect(evaluateR9({ mandate: lax, cart: stale, now, config: ENGINE_CONFIG }).template_id).toBe("R9.flagged");
  });

  it("escalates NOT_CHECKED when a capture is required", () => {
    const r = evaluateR9({ mandate: M0, cart: scameter({ state: "NOT_CHECKED", capture_ref: null, captured_at: null, searched: [] }), now, config: ENGINE_CONFIG });
    expect(r).toMatchObject({ result: "FAIL", verdict: "ESCALATE", template_id: "R9.unverified" });
  });

  it("is fresh exactly at the max age and stale one second later [F52]", () => {
    const capturedAt = (ageS: number) => new Date(now.getTime() - ageS * 1000).toISOString();
    expect(evaluateR9({ mandate: M0, cart: scameter({ captured_at: capturedAt(86_400) }), now, config: ENGINE_CONFIG }).result).toBe("PASS");
    const r = evaluateR9({ mandate: M0, cart: scameter({ captured_at: capturedAt(86_401) }), now, config: ENGINE_CONFIG });
    expect(r).toMatchObject({ result: "FAIL", verdict: "ESCALATE", template_id: "R9.unverified" });
    expect(r.inputs["stale"]).toBe(true);
  });

  it("honours the mandate's max_capture_age_s override", () => {
    const mandate = withRules(M0, { seller_check: { require_capture: true, max_capture_age_s: 60 } });
    expect(evaluateR9({ mandate, cart: CART_A1, now, config: ENGINE_CONFIG })).toMatchObject({
      result: "FAIL",
      threshold_ref: "mandate.rules.seller_check.max_capture_age_s",
    });
  });

  it("passes unverified sellers when the delegator did not require a capture", () => {
    const lax = withRules(M0, { seller_check: { require_capture: false } });
    const cart = scameter({ state: "NOT_CHECKED", capture_ref: null, captured_at: null, searched: [] });
    expect(evaluateR9({ mandate: lax, cart, now, config: ENGINE_CONFIG }).result).toBe("PASS");
  });

  it("escalates an unknown state or a capture dated in the future (fail closed)", () => {
    expect(evaluateR9({ mandate: M0, cart: scameter({ state: "SAFE" as never }), now, config: ENGINE_CONFIG })).toMatchObject({ verdict: "ESCALATE" });
    expect(evaluateR9({ mandate: M0, cart: scameter({ captured_at: "2026-10-03T03:00:00Z" }), now, config: ENGINE_CONFIG })).toMatchObject({ verdict: "ESCALATE" });
  });
});

describe("R10 judge thresholds (typed profile [F36, F50]); the judge can only tighten (I3)", () => {
  const evaluate = (judge: unknown) => evaluateR10({ mandate: M0, judge: judge as JudgeRecord, config: ENGINE_CONFIG });
  const byCheck = (judge: unknown) => Object.fromEntries(evaluate(judge).map((r) => [r.check, r]));

  it("emits one PASS per question for a clean listing", () => {
    const results = evaluate(JUDGE_TEE);
    expect(results.map((r) => [r.id, r.check, r.result])).toEqual([
      ["R10", "scope_fit", "PASS"],
      ["R10", "injection_risk", "PASS"],
      ["R10", "seller_risk", "PASS"],
      ["R10", "escalate_or_proceed", "PASS"],
    ]);
    expect(results[1]).toMatchObject({ comparator: "<", threshold_ref: "F36.T_inj", inputs: { threshold: ENGINE_CONFIG.judge.t_inj } });
  });

  it("denies the injected listing (S3, DM5)", () => {
    expect(byCheck(JUDGE_INJECTED)["injection_risk"]).toMatchObject({ result: "FAIL", verdict: "DENY", template_id: "R10.injection" });
  });

  it("denies a high seller risk and escalates the middle band", () => {
    // The recorded flagged-seller listing scores below T_sell_deny since the fit (the gate is a weak signal, F36);
    // it is stopped by R9 and the injection gate. A clearly risky reading still denies here.
    const risky = judgeWith({ seller_risk: { low_risk: 0.05, high_risk: 0.95 } });
    expect(byCheck(risky)["seller_risk"]).toMatchObject({ verdict: "DENY", template_id: "R10.seller_risk", threshold_ref: "F36.T_sell_deny" });
    expect(JUDGE_FLAGGED).toBeDefined();
    const midP = (ENGINE_CONFIG.judge.t_sell_esc + ENGINE_CONFIG.judge.t_sell_deny) / 2;
    const middle = judgeWith({ seller_risk: { low_risk: 1 - midP, high_risk: midP } });
    expect(byCheck(middle)["seller_risk"]).toMatchObject({ verdict: "ESCALATE", template_id: "R10.seller_risk", threshold_ref: "F36.T_sell_esc" });
  });

  it("escalates an out-of-scope listing [F29]", () => {
    expect(byCheck(JUDGE_EARBUDS)["scope_fit"]).toMatchObject({ verdict: "ESCALATE", template_id: "R10.scope" });
  });

  it("applies each threshold exactly at the limit", () => {
    const t = ENGINE_CONFIG.judge;
    const step = 0.01;
    const round = (x: number) => Math.round(x * 10_000) / 10_000;
    const inj = (s: number, i: number) => byCheck(judgeWith({ injection_risk: { clean: round(1 - s - i), suspicious: s, injection: i } }))["injection_risk"];
    expect(inj(0, t.t_inj)?.result).toBe("FAIL");
    expect(inj(0, round(t.t_inj - step))?.result).toBe("PASS");
    const scope = (p: number) => byCheck(judgeWith({ scope_fit: { in_scope: p, out_of_scope: round(1 - p) } }))["scope_fit"];
    expect(scope(t.t_scope)?.result).toBe("PASS");
    expect(scope(round(t.t_scope - step))?.result).toBe("FAIL");
    const seller = (p: number) => byCheck(judgeWith({ seller_risk: { low_risk: round(1 - p), high_risk: p } }))["seller_risk"];
    expect(seller(t.t_sell_deny)?.verdict).toBe("DENY");
    expect(seller(t.t_sell_esc)?.verdict).toBe("ESCALATE");
    expect(seller(round(t.t_sell_esc - step))?.result).toBe("PASS");
    const esc = (p: number) => byCheck(judgeWith({ escalate_or_proceed: { proceed: round(1 - p), escalate: p } }))["escalate_or_proceed"];
    expect(esc(t.t_esc)).toMatchObject({ verdict: "ESCALATE", template_id: "R10.escalate", threshold_ref: "F50.T_esc" });
    expect(esc(round(t.t_esc - step))?.result).toBe("PASS");
  });

  it("reads the tighter of P(x) and 1 - P(not x) when options do not sum to 1", () => {
    const lopsided = judgeWith({ injection_risk: { clean: 0.2, suspicious: 0.1, injection: 0.1 } });
    expect(byCheck(lopsided)["injection_risk"]).toMatchObject({ result: "FAIL", verdict: "DENY" });
  });

  it.each([
    ["TIMEOUT", { status: "TIMEOUT", answers: undefined }],
    ["ERROR", { status: "ERROR", answers: undefined }],
    ["truncated input", { status: "ERROR", input_truncated: true, answers: undefined }],
    ["truncated but OK", { status: "OK", input_truncated: true }],
    ["unknown status", { status: "MAYBE" }],
    ["OK without answers", { status: "OK", answers: undefined }],
    ["NaN probability", { answers: { ...JUDGE_TEE.answers, scope_fit: { in_scope: Number.NaN, out_of_scope: 0.1 } } }],
    ["probability above 1", { answers: { ...JUDGE_TEE.answers, seller_risk: { low_risk: 2, high_risk: 0 } } }],
    ["missing option", { answers: { ...JUDGE_TEE.answers, injection_risk: { clean: 1 } } }],
    ["unknown provider", { provider: "llm" }],
  ])("escalates R10.unavailable on %s (I5)", (_name, patch) => {
    const judge = { ...JUDGE_TEE, ...patch };
    const results = evaluate(judge);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: "R10", check: "judge_status", result: "FAIL", verdict: "ESCALATE", template_id: "R10.unavailable" });
  });

  it.each([[null], [undefined], ["OK"], [42], [[]]])("escalates when the record itself is %p", (judge) => {
    expect(evaluate(judge)[0]).toMatchObject({ verdict: "ESCALATE", template_id: "R10.unavailable" });
  });

  it("records SKIPPED with the shadow verdict when the config says shadow; an unusable record still escalates (I5)", () => {
    const shadowConfig = { ...ENGINE_CONFIG, judge_mode: "shadow" as const };
    const results = evaluateR10({ mandate: M0, judge: JUDGE_INJECTED, config: shadowConfig });
    expect(results.every((r) => r.result === "SKIPPED")).toBe(true);
    expect(results.find((r) => r.check === "injection_risk")?.inputs).toMatchObject({ shadow: true, shadow_verdict: "DENY", shadow_template_id: "R10.injection" });
    const enforced = evaluateR10({ mandate: M0, judge: JUDGE_INJECTED, config: ENGINE_CONFIG });
    for (const r of results) {
      const e = enforced.find((x) => x.check === r.check);
      expect(r.inputs).toMatchObject({ shadow_verdict: e?.result === "FAIL" ? e.verdict : "PASS" });
    }
    const down = evaluateR10({ mandate: M0, judge: { ...JUDGE_TEE, status: "TIMEOUT", answers: undefined }, config: shadowConfig });
    expect(down[0]).toMatchObject({ result: "FAIL", verdict: "ESCALATE", template_id: "R10.unavailable" });
  });

  it("enforces whatever the record's own shadow flag says (the mode comes from config, audit S-JUDGE-1)", () => {
    expect(evaluate({ ...JUDGE_INJECTED, shadow: "true" }).some((r) => r.result === "FAIL")).toBe(true);
    expect(evaluate({ ...JUDGE_INJECTED, shadow: true }).some((r) => r.result === "FAIL")).toBe(true);
  });
});
