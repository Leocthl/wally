// Mock policy rules R1-R12 (docs/02 section 7) as small pure functions returning schema-shaped RuleResults.
// A stand-in for lane A's engine so the offline booth does real arithmetic: the same inputs give the same verdicts.
import type { Cart, JudgeRecord, Mandate, PacketState, RuleResult } from "@wally/core/generated";
import { MOCK_CONFIG } from "./config";

type Id = RuleResult["id"];
type Comparator = NonNullable<RuleResult["comparator"]>;
type Template = NonNullable<RuleResult["template_id"]>;
type Inputs = RuleResult["inputs"];

const MS_PER_S = 1000;

export interface RuleContext {
  readonly mandate: Mandate;
  readonly packet: PacketState;
  readonly cart: Cart;
  readonly judge: JudgeRecord;
  readonly now: Date;
  readonly revokedAt?: string;
  /** The delegator answered an ESCALATE: answerable rules (R4 ask_above, R9 unverified, R10 escalate) become PASS. */
  readonly answered?: boolean;
}

export const pass = (id: Id, comparator: Comparator, inputs: Inputs, thresholdRef?: string, check?: string): RuleResult => ({
  id,
  ...(check ? { check } : {}),
  result: "PASS",
  inputs,
  comparator,
  ...(thresholdRef ? { threshold_ref: thresholdRef } : {}),
});

export const fail = (
  id: Id,
  verdict: "DENY" | "ESCALATE",
  template: Template,
  comparator: Comparator,
  inputs: Inputs,
  thresholdRef?: string,
  check?: string,
): RuleResult => ({
  id,
  ...(check ? { check } : {}),
  result: "FAIL",
  verdict,
  inputs,
  comparator,
  ...(thresholdRef ? { threshold_ref: thresholdRef } : {}),
  template_id: template,
});

export const skipped = (id: Id, reason: string): RuleResult => ({ id, result: "SKIPPED", inputs: { reason } });

export function r1(): RuleResult {
  // SIMULATED: the mock treats its own placeholder credential as valid; the real engine takes the proof result as input.
  return pass("R1", "verify", { mandate_proof_valid: true, simulated: true });
}

export function r2(c: RuleContext): RuleResult {
  if (c.packet.status === "REVOKED") {
    return fail("R2", "DENY", "R2.revoked", "==", { revoked_at: c.revokedAt ?? c.now.toISOString() }, "mandate.valid_until");
  }
  if (c.now.getTime() >= Date.parse(c.mandate.valid_until)) {
    return fail("R2", "DENY", "R2.expired", "<", { valid_until: c.mandate.valid_until }, "mandate.valid_until");
  }
  return pass("R2", "<", { valid_until: c.mandate.valid_until }, "mandate.valid_until");
}

export function r3(c: RuleContext): RuleResult {
  const inputs = { total_minor: c.cart.total_minor, remaining_minor: c.packet.remaining_minor };
  return c.cart.total_minor <= c.packet.remaining_minor
    ? pass("R3", "<=", inputs, "packet.remaining_minor")
    : fail("R3", "DENY", "R3.over_remaining", ">", inputs, "packet.remaining_minor");
}

export function r4(c: RuleContext): RuleResult {
  const pp = c.mandate.rules.per_purchase;
  if (!pp) return skipped("R4", "no per-purchase rule, so R3 binds");
  const total = c.cart.total_minor;
  const caps = [
    pp.hard_cap_minor,
    pp.share_of_remaining_bp === undefined ? undefined : Math.floor((c.packet.remaining_minor * pp.share_of_remaining_bp) / 10_000),
  ].filter((x): x is number => x !== undefined);
  const cap = caps.length > 0 ? Math.min(...caps) : undefined;
  if (cap !== undefined && total > cap) {
    return fail("R4", "DENY", "R4.over_cap", ">", { total_minor: total, cap_minor: cap }, "mandate.rules.per_purchase.hard_cap_minor");
  }
  if (pp.ask_above_minor !== undefined && total > pp.ask_above_minor) {
    const inputs = { total_minor: total, ask_above_minor: pp.ask_above_minor };
    return c.answered
      ? pass("R4", ">", { ...inputs, answered_by: "delegator" }, "mandate.rules.per_purchase.ask_above_minor")
      : fail("R4", "ESCALATE", "R4.ask_above", ">", inputs, "mandate.rules.per_purchase.ask_above_minor");
  }
  return pass("R4", "<=", { total_minor: total }, "mandate.rules.per_purchase.hard_cap_minor");
}

export function r5(c: RuleContext): RuleResult {
  const inputs = { total_minor: c.cart.total_minor, ceiling_minor: MOCK_CONFIG.railCeilingMinor };
  return c.cart.total_minor <= MOCK_CONFIG.railCeilingMinor
    ? pass("R5", "<=", inputs, "F1.ceiling")
    : fail("R5", "DENY", "R5.over_ceiling", ">", inputs, "F1.ceiling");
}

export function r6(c: RuleContext): RuleResult {
  const { categories, merchants } = c.mandate.rules;
  const domain = c.cart.merchant.domain;
  const offCategory = c.cart.items.find((i) => !categories.includes(i.category));
  const denied = merchants.deny.includes(domain) || (merchants.allow !== null && !merchants.allow.includes(domain));
  const inputs = { categories: c.cart.items.map((i) => i.category), allowed: [...categories], domain };
  if (offCategory) return fail("R6", "DENY", "R6.off_mandate", "in", { ...inputs, what: `Category ${offCategory.category}` });
  if (denied) return fail("R6", "DENY", "R6.off_mandate", "in", { ...inputs, what: `Merchant ${domain}` });
  return pass("R6", "in", inputs);
}

export function r7(c: RuleContext): RuleResult {
  const since = c.now.getTime() - MOCK_CONFIG.velocityWindowMs;
  const prior = c.packet.mint_times.filter((t) => Date.parse(t) > since).length;
  const inputs = { n: prior + 1, max: MOCK_CONFIG.velocityMaxMints, window_s: MOCK_CONFIG.velocityWindowMs / MS_PER_S };
  return prior < MOCK_CONFIG.velocityMaxMints ? pass("R7", "<=", inputs, "F32.max_mints") : fail("R7", "DENY", "R7.velocity", ">", inputs, "F32.max_mints");
}

export function r8(c: RuleContext): RuleResult {
  const inputs = { active: c.packet.active_cards.length, max: MOCK_CONFIG.maxActiveCards };
  return inputs.active < inputs.max ? pass("R8", "<", inputs, "F1.active") : fail("R8", "DENY", "R8.max_active", ">=", inputs, "F1.active");
}

export function r9(c: RuleContext): RuleResult {
  const sc = c.cart.scameter;
  const rule = c.mandate.rules.seller_check;
  if (sc.state === "FLAGGED") {
    return fail("R9", "DENY", "R9.flagged", "==", { state: sc.state, captured_at: sc.captured_at, capture_ref: sc.capture_ref });
  }
  const maxAgeMs = rule.max_capture_age_s === undefined ? MOCK_CONFIG.maxCaptureAgeMs : rule.max_capture_age_s * MS_PER_S;
  const ageMs = sc.captured_at ? c.now.getTime() - Date.parse(sc.captured_at) : null;
  const inputs = { state: sc.state, age_s: ageMs === null ? null : Math.floor(ageMs / MS_PER_S), max_age_s: maxAgeMs / MS_PER_S };
  const unverified = rule.require_capture && (sc.state === "NOT_CHECKED" || ageMs === null || ageMs > maxAgeMs);
  if (!unverified) return pass("R9", "!=", inputs, "F52");
  return c.answered
    ? pass("R9", "!=", { ...inputs, answered_by: "delegator" }, "F52")
    : fail("R9", "ESCALATE", "R9.unverified", ">", inputs, "F52");
}

/** One result per judge question; a failed or truncated judge is one ESCALATE (I5, override 3). */
export function r10(c: RuleContext): RuleResult[] {
  const { judge } = c;
  const t = MOCK_CONFIG.judge;
  const a = judge.answers;
  if (judge.status !== "OK" || !a) {
    return [fail("R10", "ESCALATE", "R10.unavailable", "==", { status: judge.status, input_truncated: judge.input_truncated ?? false, provider: judge.provider }, "F34", "judge_status")];
  }
  const inj = a.injection_risk.suspicious + a.injection_risk.injection;
  const high = a.seller_risk.high_risk;
  const inScope = a.scope_fit.in_scope;
  const esc = a.escalate_or_proceed.escalate;
  const category = c.cart.items[0]?.category ?? "";
  const escalateTail = (rule: RuleResult): RuleResult =>
    c.answered && rule.result === "FAIL" && rule.verdict === "ESCALATE" ? pass("R10", rule.comparator ?? ">=", { ...rule.inputs, answered_by: "delegator" }, rule.threshold_ref, rule.check) : rule;
  return [
    inj >= t.tInj
      ? fail("R10", "DENY", "R10.injection", ">=", { p: inj, threshold: t.tInj }, "F36.T_inj", "injection_risk")
      : pass("R10", "<", { p: inj, threshold: t.tInj }, "F36.T_inj", "injection_risk"),
    high >= t.tSellDeny
      ? fail("R10", "DENY", "R10.seller_risk", ">=", { p: high, threshold: t.tSellDeny, verdict: "DENY" }, "F36.T_sell_deny", "seller_risk")
      : high >= t.tSellEsc
        ? escalateTail(fail("R10", "ESCALATE", "R10.seller_risk", ">=", { p: high, threshold: t.tSellEsc, verdict: "ESCALATE" }, "F36.T_sell_esc", "seller_risk"))
        : pass("R10", "<", { p: high, threshold: t.tSellEsc }, "F36.T_sell_esc", "seller_risk"),
    inScope < t.tScope
      ? escalateTail(fail("R10", "ESCALATE", "R10.scope", "<", { p: inScope, threshold: t.tScope, category }, "F36.T_scope", "scope_fit"))
      : pass("R10", ">=", { p: inScope, threshold: t.tScope }, "F36.T_scope", "scope_fit"),
    esc >= t.tEsc
      ? escalateTail(fail("R10", "ESCALATE", "R10.escalate", ">=", { p: esc, threshold: t.tEsc }, "F50.T_esc", "escalate_or_proceed"))
      : pass("R10", "<", { p: esc, threshold: t.tEsc }, "F50.T_esc", "escalate_or_proceed"),
  ];
}
