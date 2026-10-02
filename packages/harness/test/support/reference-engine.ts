// TEST ONLY, not the engine. A small independent implementation of the R1-R10 semantics in docs/00 and docs/02 §7, written
// from the docs and the register before lane A's engine existed. Its one job now is a differential cross-check
// (test/differential.test.ts): two implementations of the same specification must agree on every generated scenario. It
// carries its own copy of the register values on purpose, so a wrong value in @laisee/core/config shows up as a disagreement.
// It is never imported from src/ and never produces a result file.
import type { Cart, Decision, Mandate, PacketState, RuleId, RuleResult, TemplateId } from "@laisee/core/generated";
import type { DecideContext, Engine, EscalationResolution, JudgeRecord } from "@laisee/core/ports";

export const REFERENCE_ENGINE_VERSION = "harness-reference-double@test";

// Register values, typed again here on purpose: F36 and F50 thresholds, F1 ceiling and active cards, F32 velocity, F52 capture age.
const T = { inj: 0.63, sellDeny: 0.55, sellEsc: 0.42, scope: 0.55, esc: 0.5 } as const;
const RAIL = { ceilingMinor: 200_000, maxActive: 2 } as const;
const VELOCITY = { maxMints: 3, windowS: 600 } as const;
const SELLER_CHECK = { maxCaptureAgeS: 86_400 } as const;

type Fail = { readonly verdict: "DENY" | "ESCALATE"; readonly template: TemplateId };

function rule(id: RuleId, fail: Fail | null, inputs: Record<string, unknown> = {}, check?: string): RuleResult {
  const base = { id, ...(check === undefined ? {} : { check }), inputs, comparator: "<=" as const };
  return fail === null ? { ...base, result: "PASS" } : { ...base, result: "FAIL", verdict: fail.verdict, template_id: fail.template };
}

const deny = (template: TemplateId): Fail => ({ verdict: "DENY", template });
const escalate = (template: TemplateId): Fail => ({ verdict: "ESCALATE", template });

function money(mandate: Mandate, packet: PacketState, cart: Cart): readonly RuleResult[] {
  const total = cart.total_minor;
  const pp = mandate.rules.per_purchase;
  const caps = [pp?.hard_cap_minor, pp?.share_of_remaining_bp === undefined ? undefined : Math.floor((packet.remaining_minor * pp.share_of_remaining_bp) / 10_000)].filter((c): c is number => c !== undefined);
  const cap = caps.length === 0 ? undefined : Math.min(...caps);
  const r4 = cap !== undefined && total > cap ? deny("R4.over_cap") : pp?.ask_above_minor !== undefined && total > pp.ask_above_minor ? escalate("R4.ask_above") : null;
  return [
    rule("R3", total > packet.remaining_minor ? deny("R3.over_remaining") : null, { total, remaining: packet.remaining_minor }),
    pp === undefined ? { id: "R4", result: "SKIPPED", inputs: {} } : rule("R4", r4, { total, cap, ask_above: pp.ask_above_minor }),
    rule("R5", total > RAIL.ceilingMinor ? deny("R5.over_ceiling") : null, { total }),
  ];
}

function scope(mandate: Mandate, cart: Cart): RuleResult {
  const { allow, deny: denied } = mandate.rules.merchants;
  const domain = cart.merchant.domain;
  const merchantBad = denied.includes(domain) || (allow !== null && !allow.includes(domain));
  const categoryBad = cart.items.some((i) => !mandate.rules.categories.includes(i.category));
  return rule("R6", merchantBad || categoryBad ? deny("R6.off_mandate") : null, { domain });
}

function pace(mandate: Mandate, packet: PacketState, now: Date): readonly RuleResult[] {
  const v = mandate.rules.velocity ?? { max_mints: VELOCITY.maxMints, window_s: VELOCITY.windowS };
  const inWindow = packet.mint_times.filter((t) => now.getTime() - Date.parse(t) < v.window_s * 1000).length;
  return [
    rule("R7", inWindow >= v.max_mints ? deny("R7.velocity") : null, { in_window: inWindow, max: v.max_mints }),
    rule("R8", packet.active_cards.length >= RAIL.maxActive ? deny("R8.max_active") : null, { active: packet.active_cards.length }),
  ];
}

function seller(mandate: Mandate, cart: Cart, now: Date): RuleResult {
  const s = cart.scameter;
  const maxAge = mandate.rules.seller_check.max_capture_age_s ?? SELLER_CHECK.maxCaptureAgeS;
  const stale = s.captured_at === null || now.getTime() - Date.parse(s.captured_at) > maxAge * 1000;
  const fail = s.state === "FLAGGED" ? deny("R9.flagged") : mandate.rules.seller_check.require_capture && (s.state === "NOT_CHECKED" || stale) ? escalate("R9.unverified") : null;
  return rule("R9", fail, { state: s.state });
}

function judgeRules(judge: JudgeRecord): readonly RuleResult[] {
  if (judge.shadow) return [{ id: "R10", result: "SKIPPED", inputs: { shadow_verdict: true } }];
  const a = judge.answers;
  if (judge.status !== "OK" || a === undefined) return [rule("R10", escalate("R10.unavailable"), { status: judge.status }, "judge")];
  return [
    rule("R10", a.scope_fit.in_scope < T.scope ? escalate("R10.scope") : null, { p: a.scope_fit.in_scope }, "scope_fit"),
    rule("R10", a.injection_risk.suspicious + a.injection_risk.injection >= T.inj ? deny("R10.injection") : null, {}, "injection_risk"),
    rule("R10", a.seller_risk.high_risk >= T.sellDeny ? deny("R10.seller_risk") : a.seller_risk.high_risk >= T.sellEsc ? escalate("R10.seller_risk") : null, {}, "seller_risk"),
    rule("R10", a.escalate_or_proceed.escalate >= T.esc ? escalate("R10.escalate") : null, {}, "escalate_or_proceed"),
  ];
}

function mandateRules(mandate: Mandate, packet: PacketState, now: Date, ctx: DecideContext | undefined): readonly RuleResult[] {
  const revoked = packet.status === "REVOKED";
  const expired = packet.status === "EXPIRED" || now.getTime() >= Date.parse(mandate.valid_until);
  return [
    rule("R1", ctx?.mandateProofValid === true ? null : deny("R1.invalid_signature"), {}, "proof"),
    rule("R2", revoked ? deny("R2.revoked") : expired ? deny("R2.expired") : null, { status: packet.status }),
  ];
}

export function referenceDecide(
  mandate: Mandate,
  packet: PacketState,
  cart: Cart,
  judge: JudgeRecord,
  now: Date,
  _resolution?: EscalationResolution,
  ctx?: DecideContext,
): Decision {
  const rules: RuleResult[] = [
    ...mandateRules(mandate, packet, now, ctx),
    ...money(mandate, packet, cart),
    scope(mandate, cart),
    ...pace(mandate, packet, now),
    seller(mandate, cart, now),
    ...judgeRules(judge),
  ];
  const fails = rules.filter((r) => r.result === "FAIL");
  const primary = fails.find((r) => r.verdict === "DENY") ?? fails.find((r) => r.verdict === "ESCALATE");
  const outcome = primary === undefined ? "APPROVE" : (primary.verdict as "DENY" | "ESCALATE");
  const id = `dec_${cart.id.slice("crt_".length)}${now.getTime().toString(36)}`.replace(/[^A-Za-z0-9_]/g, "").slice(0, 44);
  const head = { id, mandate_id: mandate.id, cart, decided_at: now.toISOString().replace(".000Z", "Z"), packet, rules: rules as [RuleResult, ...RuleResult[]], judge, engine: { version: REFERENCE_ENGINE_VERSION, config_sha256: "0".repeat(64) } };
  if (outcome === "APPROVE") return { ...head, outcome, approved_limit_minor: cart.total_minor };
  const template = primary?.template_id ?? "R1.invalid_signature";
  const explanation = { template_id: template, inputs: {}, rendered: `Stopped by ${primary?.id ?? "R1"}.` };
  return outcome === "ESCALATE"
    ? { ...head, outcome, explanation, escalation: { state: "OPEN" as const, expires_at: new Date(now.getTime() + 60_000).toISOString().replace(".000Z", "Z") } }
    : { ...head, outcome, explanation };
}

// Test-only double: it never reports checkout drift (decideCheckout returns null = the approval stands).
export const referenceEngine: Engine = { decide: referenceDecide, decideCheckout: () => null };
