// Mock engine: assembles RuleResults into a Decision exactly as docs/02 section 7 says. Outcome = any DENY, else any
// ESCALATE, else APPROVE (I3: the judge enters only through R10). The only producer of a Decision in the mock (D3).
import type { Cart, Decision, EscalationAnswer, JudgeRecord, Mandate, PacketState, RuleResult } from "@laisee/core/generated";
import { renderStop } from "../../explain/renderStop";
import { MOCK_CONFIG } from "./config";
import { canonicalize, sha256Hex } from "./hash";
import { fail, r1, r10, r2, r3, r4, r5, r6, r7, r8, r9, skipped, type RuleContext } from "./engineRules";

const ENGINE = { version: "web-mock@0.0.0 (SIMULATED)", config_sha256: sha256Hex(canonicalize(MOCK_CONFIG)) } as const;
const iso = (d: Date): string => d.toISOString().replace(".000Z", "Z");

export interface DecideArgs extends RuleContext {
  readonly id: string;
  readonly resolves?: string;
  readonly escalation?: Decision["escalation"];
}

function evaluate(c: RuleContext): RuleResult[] {
  return [r1(), r2(c), r3(c), r4(c), r5(c), r6(c), r7(c), r8(c), r9(c), ...r10(c), skipped("R11", "no open escalation"), skipped("R12", "checked at checkout")];
}

function outcomeOf(rules: readonly RuleResult[]): Decision["outcome"] {
  const failed = rules.filter((r) => r.result === "FAIL");
  if (failed.some((r) => r.verdict === "DENY")) return "DENY";
  return failed.some((r) => r.verdict === "ESCALATE") ? "ESCALATE" : "APPROVE";
}

function explain(rules: readonly RuleResult[], outcome: Decision["outcome"]): Decision["explanation"] {
  const primary = rules.find((r) => r.result === "FAIL" && r.verdict === outcome);
  if (!primary || !primary.template_id) return undefined;
  const inputs = { ...primary.inputs, verdict: primary.verdict };
  return {
    template_id: primary.template_id,
    inputs,
    rendered: renderStop(primary.template_id, inputs, "en"),
    rendered_zh_hk: renderStop(primary.template_id, inputs, "zh-HK"),
  };
}

function assemble(c: RuleContext, id: string, rules: readonly RuleResult[], extra: Pick<DecideArgs, "resolves" | "escalation">): Decision {
  const outcome = outcomeOf(rules);
  const explanation = explain(rules, outcome);
  const escalation = outcome === "ESCALATE" && !extra.escalation ? { state: "OPEN" as const, expires_at: iso(new Date(c.now.getTime() + MOCK_CONFIG.escalationWindowMs)) } : extra.escalation;
  const [first, ...rest] = rules;
  if (!first) throw new Error("a decision needs at least one rule result");
  return {
    id,
    mandate_id: c.mandate.id,
    cart: c.cart,
    decided_at: iso(c.now),
    outcome,
    ...(outcome === "APPROVE" ? { approved_limit_minor: c.cart.total_minor } : {}),
    packet: c.packet,
    rules: [first, ...rest],
    judge: c.judge,
    ...(explanation ? { explanation } : {}),
    ...(extra.resolves ? { resolves: extra.resolves } : {}),
    ...(escalation ? { escalation } : {}),
    engine: ENGINE,
  };
}

export function decide(args: DecideArgs): Decision {
  return assemble(args, args.id, evaluate(args), args);
}

/** R11: the window passed with no answer. Copies the judge record of the decision it resolves. */
export function decideExpired(prior: Decision, packet: PacketState, mandate: Mandate, id: string, now: Date): Decision {
  const inputs = { window_s: MOCK_CONFIG.escalationWindowMs / 1000, expires_at: prior.escalation?.expires_at ?? iso(now) };
  const rules = [r1(), ...[2, 3, 4, 5, 6, 7, 8, 9].map((n) => skipped(`R${n}` as RuleResult["id"], "decided at the escalation")), skipped("R10", "decided at the escalation"), fail("R11", "DENY", "R11.expired", ">=", inputs, "F31"), skipped("R12", "checked at checkout")];
  const ctx: RuleContext = { mandate, packet, cart: prior.cart, judge: prior.judge, now };
  return assemble(ctx, id, rules, { resolves: prior.id, escalation: { state: "EXPIRED", expires_at: inputs.expires_at } });
}

/** R12: the checkout re-quote differs from the approved cart. DENY, and the caller voids the card. */
export function decideDrift(prior: Decision, packet: PacketState, mandate: Mandate, id: string, now: Date, seenMinor: number): Decision {
  const inputs = { approved_minor: prior.cart.total_minor, seen_minor: seenMinor };
  const rules = [r1(), ...[2, 3, 4, 5, 6, 7, 8, 9].map((n) => skipped(`R${n}` as RuleResult["id"], "decided at approval")), skipped("R10", "decided at approval"), skipped("R11", "no open escalation"), fail("R12", "DENY", "R12.price_drift", "==", inputs, "packet.remaining_minor")];
  const ctx: RuleContext = { mandate, packet, cart: prior.cart, judge: prior.judge, now };
  return assemble(ctx, id, rules, { resolves: prior.id });
}

/** The delegator said no: the escalating rule's template is reused (docs/02 section 8). */
export function decideDenied(prior: Decision, packet: PacketState, mandate: Mandate, id: string, now: Date, answer: EscalationAnswer): Decision {
  const rules = prior.rules.map((r) => (r.result === "FAIL" && r.verdict === "ESCALATE" ? { ...r, verdict: "DENY" as const } : r));
  const ctx: RuleContext = { mandate, packet, cart: prior.cart, judge: prior.judge, now };
  const escalation = { state: "DENIED" as const, expires_at: prior.escalation?.expires_at ?? iso(now), answer };
  return assemble(ctx, id, rules as RuleResult[], { resolves: prior.id, escalation });
}

/** The delegator said yes: re-run every rule with the answerable ones cleared; hard rules still bind (docs/00 Rules). */
export function decideApproved(prior: Decision, packet: PacketState, mandate: Mandate, id: string, now: Date, answer: EscalationAnswer): Decision {
  const escalation = { state: "APPROVED" as const, expires_at: prior.escalation?.expires_at ?? iso(now), answer };
  const ctx: DecideArgs = { id, mandate, packet, cart: prior.cart, judge: prior.judge, now, answered: true, resolves: prior.id, escalation };
  return assemble(ctx, id, evaluate(ctx), ctx);
}

export type { JudgeRecord, Cart };
