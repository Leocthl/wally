// Where the harness's labels meet the real engine at a limit. Each table row is one question the labels had to settle:
// does a value equal to the limit pass, and what is the reason when two limits are crossed. The engine's answer is pinned
// here next to the reading of the register or docs/02 section 7 that supports it; a row that cannot cite a reading says so.
// The generator places the same values inside its scenarios (equality at R3, R4, R5, the capture age on its limit, an
// expiry at validUntil), so the labelled sweep and this file must agree.
//
// R1 binds the packet to the mandate (budget, currency, expiry) and the cart to the mandate (agent, currency), because the
// packet is folded from the sealed credential and a copy that disagrees was not built from it. Every fixture here is therefore
// a consistent pair: a helper that changes the budget changes it in both, and `decide` refuses an inconsistent fixture with
// a plain message instead of letting R1 deny it and hide the rule under test. The R1 rows build inconsistent ones on purpose.
import { describe, expect, it } from "vitest";
import { ENGINE_CONFIG } from "@laisee/core/config";
import { engine } from "@laisee/core/engine";
import type { Cart, Decision, Mandate, PacketState } from "@laisee/core/generated";
import { MintError, type JudgeRecord } from "@laisee/core/ports";
import { evaluateR2 } from "@laisee/core/rules";
import { CLEAN_ANSWERS } from "@laisee/core/testing";
import { RailSim, seededRandom } from "@laisee/rail-sim";
import { RAIL, SELLER_CHECK, VELOCITY } from "../src/config";
import { generateScenarios } from "../src/scenario/generate";

interface Case {
  readonly mandate: Mandate;
  readonly packet: PacketState;
  readonly cart: Cart;
  readonly now: Date;
  readonly judge: JudgeRecord;
}

const SEED = generateScenarios({ seed: 7, n: 36 }).find((s) => s.category === "within_budget" && s.variant === "plain");
if (SEED === undefined) throw new Error("seed 7 has no within_budget/plain scenario in its first 36");

const CLEAN_JUDGE: JudgeRecord = { provider: "laya", model: "typed-decisions", version: "test", status: "OK", latency_ms: 10, shadow: false, answers: CLEAN_ANSWERS };
const NOW = new Date(SEED.now);
const BASE: Case = { mandate: SEED.mandate, packet: SEED.packet, cart: SEED.cart, now: NOW, judge: CLEAN_JUDGE };

// ---------- immutable builders: each returns a new Case ----------

const decideRaw = (c: Case): Decision => engine.decide(c.mandate, c.packet, c.cart, c.judge, c.now, undefined, { mandateProofValid: true });

const sameInstant = (a: string, b: string): boolean => Date.parse(a) === Date.parse(b);

/** What R1 binds, as plain findings: empty when the packet and the cart belong to the mandate. */
function bindingProblems(c: Case): readonly string[] {
  const budget = c.mandate.rules.budget;
  return [
    c.packet.budget_minor !== budget.amount_minor ? `packet budget ${c.packet.budget_minor} differs from the mandate's ${budget.amount_minor}` : null,
    c.packet.currency !== budget.currency ? "packet currency differs from the mandate's" : null,
    !sameInstant(c.packet.expires_at, c.mandate.valid_until) ? `packet expiry ${c.packet.expires_at} differs from the mandate's ${c.mandate.valid_until}` : null,
    c.cart.currency !== budget.currency ? "cart currency differs from the mandate's" : null,
    c.cart.agent !== c.mandate.agent || c.cart.mandate_id !== c.mandate.id || c.packet.mandate_id !== c.mandate.id ? "cart or packet names another mandate or agent" : null,
    c.packet.budget_minor !== c.packet.committed_minor + c.packet.spent_minor + c.packet.remaining_minor ? "packet budget is not committed + spent + remaining" : null,
  ].filter((p): p is string => p !== null);
}

/** The engine's decision for a fixture that is a consistent pair; an inconsistent one is a bug in the test, said plainly. */
function decide(c: Case): Decision {
  const problems = bindingProblems(c);
  if (problems.length > 0) throw new Error(`inconsistent fixture (R1 would deny it before the rule under test): ${problems.join("; ")}`);
  return decideRaw(c);
}

const verdictFrom = (d: Decision): string => (d.outcome === "APPROVE" ? "APPROVE" : `${d.outcome} ${d.explanation?.template_id ?? "?"}`);

/** "APPROVE", or the outcome with the primary reason: the pair the generator labels every stop with. */
const verdictOf = (c: Case): string => verdictFrom(decide(c));

const withPacket = (c: Case, over: Partial<PacketState>): Case => ({ ...c, packet: { ...c.packet, ...over } });
const withMandate = (c: Case, over: Partial<Mandate>): Case => ({ ...c, mandate: { ...c.mandate, ...over } });

/** A budget for the mandate and the packet together; what is spent follows, so budget = committed + spent + remaining holds. */
function withBudget(c: Case, amountMinor: number): Case {
  const spent = amountMinor - c.packet.committed_minor - c.packet.remaining_minor;
  if (spent < 0) throw new RangeError(`a budget of ${amountMinor} cannot hold ${c.packet.committed_minor} committed and ${c.packet.remaining_minor} remaining`);
  const budget = { ...c.mandate.rules.budget, amount_minor: amountMinor };
  return { ...c, mandate: { ...c.mandate, rules: { ...c.mandate.rules, budget } }, packet: { ...c.packet, budget_minor: amountMinor, spent_minor: spent } };
}

/** What the packet has left, with what is spent following from it. */
function withRemaining(c: Case, remainingMinor: number): Case {
  const spent = c.packet.budget_minor - c.packet.committed_minor - remainingMinor;
  if (spent < 0) throw new RangeError(`${remainingMinor} remaining does not fit a budget of ${c.packet.budget_minor}`);
  return { ...c, packet: { ...c.packet, remaining_minor: remainingMinor, spent_minor: spent } };
}
const withRules = (c: Case, over: Partial<Mandate["rules"]>): Case => withMandate(c, { rules: { ...c.mandate.rules, ...over } });

/** Same cart priced at exactly `total`: one item, quantity 1, the unit price absorbs the difference. */
function withTotal(c: Case, total: number): Case {
  const fixed = c.cart.shipping_minor + c.cart.fees_minor + (c.cart.fx?.fee_minor ?? 0);
  const subtotal = total - fixed;
  const [first] = c.cart.items;
  if (first === undefined || subtotal < 1) throw new RangeError(`cannot price the cart at ${total}`);
  return { ...c, cart: { ...c.cart, items: [{ ...first, qty: 1, unit_price_minor: subtotal }], subtotal_minor: subtotal, total_minor: total } };
}

function withPerPurchase(c: Case, perPurchase: NonNullable<Mandate["rules"]["per_purchase"]> | undefined): Case {
  const { per_purchase: _dropped, ...rest } = c.mandate.rules;
  return withMandate(c, { rules: perPurchase === undefined ? rest : { ...rest, per_purchase: perPurchase } });
}

const iso = (ms: number): string => new Date(ms).toISOString();
const secondsBefore = (s: number): string => iso(NOW.getTime() - s * 1000);

/** Plenty of money, no per-purchase rule: only the limit under test can bind. */
const ROOMY: Case = withPerPurchase(withRemaining(withBudget(BASE, 300_000), 150_000), undefined);

describe("the base case is clean", () => {
  it("approves with nothing binding, so every row below isolates one limit", () => {
    expect(verdictOf(withTotal(ROOMY, 10_000))).toBe("APPROVE");
  });
});

describe("R3 total <= remaining, R5 total <= rail ceiling [F1.ceiling]: equal passes, one minor unit over stops", () => {
  it.each([
    ["total equals remaining", withTotal(ROOMY, 150_000), "APPROVE"],
    ["total is one minor unit over remaining", withTotal(ROOMY, 150_001), "DENY R3.over_remaining"],
    ["remaining equals the ceiling and the total equals both", withTotal(withRemaining(ROOMY, RAIL.ceilingMinor), RAIL.ceilingMinor), "APPROVE"],
    ["total is one minor unit over the ceiling with money to spare", withTotal(withRemaining(ROOMY, RAIL.ceilingMinor + 5_000), RAIL.ceilingMinor + 1), "DENY R5.over_ceiling"],
    ["total over both remaining and ceiling: R3 comes first", withTotal(withRemaining(ROOMY, RAIL.ceilingMinor), RAIL.ceilingMinor + 1), "DENY R3.over_remaining"],
  ] as const)("%s", (_name, c, expected) => {
    expect(verdictOf(c)).toBe(expected);
  });
});

describe("R4 per-purchase rules: the cap is min(hard cap, floor(share of remaining)); ask_above asks, it does not stop", () => {
  const hard = { hard_cap_minor: 30_000 };
  const ask = { ask_above_minor: 20_000 };
  const share = { share_of_remaining_bp: 2_500 };
  const odd = withRemaining(ROOMY, 100_003); // 25% of this is 25,000.75: the cap must round down

  it.each([
    ["hard cap: equal passes", withTotal(withPerPurchase(ROOMY, hard), 30_000), "APPROVE"],
    ["hard cap: one over stops", withTotal(withPerPurchase(ROOMY, hard), 30_001), "DENY R4.over_cap"],
    ["share of remaining rounds down: equal to the floor passes", withTotal(withPerPurchase(odd, share), 25_000), "APPROVE"],
    ["share of remaining rounds down: one over the floor stops", withTotal(withPerPurchase(odd, share), 25_001), "DENY R4.over_cap"],
    ["both set: the smaller cap binds (share 25,000 under hard 30,000)", withTotal(withPerPurchase(odd, { ...hard, ...share }), 25_001), "DENY R4.over_cap"],
    ["ask_above: equal passes", withTotal(withPerPurchase(ROOMY, ask), 20_000), "APPROVE"],
    ["ask_above: one over escalates", withTotal(withPerPurchase(ROOMY, ask), 20_001), "ESCALATE R4.ask_above"],
    ["over the cap and over ask_above: over_cap, not ask_above (DENY outranks ESCALATE)", withTotal(withPerPurchase(ROOMY, { ...hard, ...ask }), 30_001), "DENY R4.over_cap"],
    ["between ask_above and the cap: ask_above", withTotal(withPerPurchase(ROOMY, { ...hard, ...ask }), 25_000), "ESCALATE R4.ask_above"],
    ["over remaining and over ask_above: R3 DENY outranks R4 ESCALATE", withTotal(withPerPurchase(withRemaining(ROOMY, 25_000), ask), 25_001), "DENY R3.over_remaining"],
  ] as const)("%s", (_name, c, expected) => {
    expect(verdictOf(c)).toBe(expected);
  });
});

describe("R2 not expired: the credential ceases to be valid at validUntil, and the packet ends with it", () => {
  const ending = (c: Case, offsetMs: number): Case => {
    const at = iso(c.now.getTime() + offsetMs);
    return withPacket(withMandate(c, { valid_until: at }), { expires_at: at });
  };
  it.each([
    ["now is one millisecond before validUntil", ending(BASE, 1), "APPROVE"],
    ["now equals validUntil (the same reading as RailSim, which needs expiry > now)", ending(BASE, 0), "DENY R2.expired"],
    ["now is one second after validUntil, packet still reads ACTIVE", ending(BASE, -1_000), "DENY R2.expired"],
    ["now equals validFrom", withMandate(BASE, { valid_from: iso(NOW.getTime()) }), "APPROVE"],
    ["now is one millisecond before validFrom", withMandate(BASE, { valid_from: iso(NOW.getTime() + 1) }), "DENY R2.expired"],
    ["packet flagged EXPIRED stops even with a future validUntil", withPacket(BASE, { status: "EXPIRED" }), "DENY R2.expired"],
    ["packet REVOKED stops with its own reason", withPacket(BASE, { status: "REVOKED" }), "DENY R2.revoked"],
  ] as const)("%s", (_name, c, expected) => {
    expect(verdictOf(c)).toBe(expected);
  });
});

describe("R2 on its own reads the earlier of the mandate's end and the packet's end", () => {
  it("a packet that ends first is expired at its own end", () => {
    const c = withPacket(withMandate(BASE, { valid_until: iso(NOW.getTime() + 3_600_000) }), { expires_at: iso(NOW.getTime()) });
    // The rule is asked directly: the engine never gets here with such a pair, R1 refuses it first (next block).
    const r2 = evaluateR2({ mandate: c.mandate, packet: c.packet, now: c.now });
    expect(r2).toMatchObject({ id: "R2", result: "FAIL", verdict: "DENY", template_id: "R2.expired" });
  });

  it("a mandate that ends first is expired at its own end", () => {
    const c = withPacket(withMandate(BASE, { valid_until: iso(NOW.getTime()) }), { expires_at: iso(NOW.getTime() + 3_600_000) });
    expect(evaluateR2({ mandate: c.mandate, packet: c.packet, now: c.now })).toMatchObject({ result: "FAIL", template_id: "R2.expired" });
  });
});

describe("R1 binds the packet and the cart to the mandate: a copy that disagrees with the credential is refused before any other rule", () => {
  const R1 = "DENY R1.invalid_signature";
  const ends = (ms: number): string => iso(Date.parse(BASE.mandate.valid_until) + ms);
  it.each([
    ["the packet's budget differs from the mandate's by one minor unit", withPacket(BASE, { budget_minor: BASE.packet.budget_minor + 1 })],
    ["the packet's currency differs", withPacket(BASE, { currency: "USD" as never })],
    ["the packet's expiry is a second later than the mandate's", withPacket(BASE, { expires_at: ends(1_000) })],
    ["the packet's expiry is a second earlier than the mandate's", withPacket(BASE, { expires_at: ends(-1_000) })],
    ["the cart's currency differs", { ...BASE, cart: { ...BASE.cart, currency: "USD" as never } }],
    ["the cart names another agent", { ...BASE, cart: { ...BASE.cart, agent: "did:key:zSomeoneElse" } }],
    ["the cart names another mandate", { ...BASE, cart: { ...BASE.cart, mandate_id: "mnd_other000" } }],
    ["the packet names another mandate", withPacket(BASE, { mandate_id: "mnd_other000" })],
  ] as const)("%s", (_name, c) => {
    expect(bindingProblems(c).length, "the fixture really is inconsistent").toBeGreaterThan(0);
    expect(verdictFrom(decideRaw(c))).toBe(R1);
  });

  it("is the primary reason even when another rule also fails, because R1 comes first in rule order", () => {
    const c = withTotal(withPacket(ROOMY, { budget_minor: ROOMY.packet.budget_minor + 1 }), 150_001); // over remaining as well
    expect(verdictFrom(decideRaw(c))).toBe(R1);
  });

  it("compares instants, not strings: the same expiry written with milliseconds binds", () => {
    const same = iso(Date.parse(BASE.mandate.valid_until)); // 2026-...Z written as 2026-...00.000Z
    expect(same).not.toBe(BASE.mandate.valid_until);
    expect(verdictOf(withPacket(BASE, { expires_at: same }))).toBe("APPROVE");
  });
});

describe("R7 velocity [F32]: one more approved mint is denied once the limit is in the rolling window", () => {
  const { maxMints, windowS } = VELOCITY;
  const agesIn = (n: number): number[] => Array.from({ length: n }, (_, i) => 60 * (i + 1));
  const mints = (ages: readonly number[]): Case => withPacket(BASE, { mint_times: ages.map(secondsBefore) });

  it.each([
    ["one under the limit inside the window", mints(agesIn(maxMints - 1)), "APPROVE"],
    ["the limit reached inside the window", mints(agesIn(maxMints)), "DENY R7.velocity"],
    ["one mint 1 s inside the window edge counts", mints([...agesIn(maxMints - 1), windowS - 1]), "DENY R7.velocity"],
    // The register says "in a rolling 10 min" and the engine counts (now - window, now]: a mint exactly window_s old has left.
    // The register is silent at exactly window_s, so the generator keeps its mint ages 100 s away from the edge (state.ts).
    ["a mint exactly window_s old has left the window (engine reading, register silent)", mints([...agesIn(maxMints - 1), windowS]), "APPROVE"],
    ["a mint 1 s past the window edge has left", mints([...agesIn(maxMints - 1), windowS + 1]), "APPROVE"],
    ["a mint dated in the future counts (an unreadable clock must not loosen the limit)", mints([...agesIn(maxMints - 1), -30]), "DENY R7.velocity"],
  ] as const)("%s", (_name, c, expected) => {
    expect(verdictOf(c)).toBe(expected);
  });

  it("a mandate may tighten the limit: its own window and count replace the default", () => {
    const tight = (c: Case): Case => withRules(c, { velocity: { max_mints: 2, window_s: 900 } });
    expect(verdictOf(tight(mints([60, 120])))).toBe("DENY R7.velocity");
    expect(verdictOf(tight(mints([60, 901])))).toBe("APPROVE");
  });
});

describe("R8 active cards [F1.active]: the rail holds two at once, a third needs one to end", () => {
  const cards = (n: number): Case =>
    withPacket(BASE, { active_cards: Array.from({ length: n }, (_, i) => ({ id: `crd_boundary${i}`, limit_minor: 3_000, expires_at: iso(NOW.getTime() + 600_000) })) });
  it.each([
    ["no active card", cards(0), "APPROVE"],
    ["one active card", cards(RAIL.maxActive - 1), "APPROVE"],
    ["two active cards", cards(RAIL.maxActive), "DENY R8.max_active"],
  ] as const)("%s", (_name, c, expected) => {
    expect(verdictOf(c)).toBe(expected);
  });
});

describe("R9 seller check [F52]: older than the limit is stale, so a capture exactly as old as the limit is fresh", () => {
  const maxAgeMs = SELLER_CHECK.maxCaptureAgeS * 1000;
  const captured = (c: Case, state: "NO_RECORD" | "FLAGGED" | "NOT_CHECKED", ageMs: number | null): Case => ({
    ...c,
    cart: { ...c.cart, scameter: { ...c.cart.scameter, state, captured_at: ageMs === null ? null : iso(c.now.getTime() - ageMs) } },
  });
  const optional = (c: Case): Case => withRules(c, { seller_check: { require_capture: false } });

  it.each([
    ["capture exactly as old as the limit", captured(BASE, "NO_RECORD", maxAgeMs), "APPROVE"],
    ["capture one millisecond older", captured(BASE, "NO_RECORD", maxAgeMs + 1), "ESCALATE R9.unverified"],
    ["capture one second older", captured(BASE, "NO_RECORD", maxAgeMs + 1_000), "ESCALATE R9.unverified"],
    // A capture dated after the decision cannot be a capture of the past: the engine reads it as missing. The register says
    // nothing about it; the stricter reading is adopted by the engine, and the harness never generates one.
    ["capture dated in the future is unverified (engine reading, register silent)", captured(BASE, "NO_RECORD", -1_000), "ESCALATE R9.unverified"],
    ["no capture and the mandate requires one", captured(BASE, "NOT_CHECKED", null), "ESCALATE R9.unverified"],
    ["a stale capture does not matter when the mandate does not require one", optional(captured(BASE, "NO_RECORD", maxAgeMs + 1_000)), "APPROVE"],
    ["flagged is a DENY at any age", captured(BASE, "FLAGGED", maxAgeMs + 1_000), "DENY R9.flagged"],
    ["flagged is a DENY even when no capture is required", optional(captured(BASE, "FLAGGED", 3_600_000)), "DENY R9.flagged"],
    ["a mandate may shorten the age: equal passes", withRules(captured(BASE, "NO_RECORD", 3_600_000), { seller_check: { require_capture: true, max_capture_age_s: 3_600 } }), "APPROVE"],
    ["a mandate may shorten the age: one second more stops", withRules(captured(BASE, "NO_RECORD", 3_601_000), { seller_check: { require_capture: true, max_capture_age_s: 3_600 } }), "ESCALATE R9.unverified"],
  ] as const)("%s", (_name, c, expected) => {
    expect(verdictOf(c)).toBe(expected);
  });
});

describe("R10 thresholds [F36, F50] read from the config: at the threshold the stricter side applies, just under passes", () => {
  const T = ENGINE_CONFIG.judge;
  const EPS = 0.001;
  const answered = (over: Partial<NonNullable<JudgeRecord["answers"]>>): Case => ({ ...BASE, judge: { ...CLEAN_JUDGE, answers: { ...CLEAN_ANSWERS, ...over } } });
  const injection = (p: number) => answered({ injection_risk: { clean: 1 - p, suspicious: 0, injection: p } });
  const seller = (p: number) => answered({ seller_risk: { low_risk: 1 - p, high_risk: p } });
  const scope = (p: number) => answered({ scope_fit: { in_scope: p, out_of_scope: 1 - p } });
  const escalate = (p: number) => answered({ escalate_or_proceed: { proceed: 1 - p, escalate: p } });

  it.each([
    ["injection at T_inj: DENY (>=)", injection(T.t_inj), "DENY R10.injection"],
    ["injection just under T_inj: passes", injection(T.t_inj - EPS), "APPROVE"],
    ["seller risk at T_sell_deny: DENY (>=)", seller(T.t_sell_deny), "DENY R10.seller_risk"],
    ["seller risk at T_sell_esc: ESCALATE (>=)", seller(T.t_sell_esc), "ESCALATE R10.seller_risk"],
    ["seller risk just under T_sell_esc: passes", seller(T.t_sell_esc - EPS), "APPROVE"],
    ["scope at T_scope: passes (only below escalates)", scope(T.t_scope), "APPROVE"],
    ["scope just under T_scope: ESCALATE", scope(T.t_scope - EPS), "ESCALATE R10.scope"],
    ["escalate_or_proceed at T_esc: ESCALATE (>=)", escalate(T.t_esc), "ESCALATE R10.escalate"],
    ["escalate_or_proceed just under T_esc: passes", escalate(T.t_esc - EPS), "APPROVE"],
  ] as const)("%s", (_name, c, expected) => {
    expect(verdictOf(c)).toBe(expected);
  });

  it("a judge that failed, timed out or truncated is R10.unavailable, never a pass (I5)", () => {
    for (const judge of [{ ...CLEAN_JUDGE, status: "TIMEOUT" }, { ...CLEAN_JUDGE, status: "ERROR" }, { ...CLEAN_JUDGE, input_truncated: true }] as const) {
      expect(verdictOf({ ...BASE, judge: judge as JudgeRecord })).toBe("ESCALATE R10.unavailable");
    }
  });
});

describe("the rail agrees with the engine at its own limits (RailSim, SIMULATED)", () => {
  const approvedAt = (total: number): Decision => {
    const d = decide(withTotal(withRemaining(ROOMY, RAIL.ceilingMinor), total));
    if (d.outcome !== "APPROVE") throw new Error(`expected an approval at ${total}, got ${verdictOf(withTotal(ROOMY, total))}`);
    return d;
  };
  const sim = (): RailSim => new RailSim({ random: seededRandom(5) });
  const mint = (rail: RailSim, decision: Decision) => rail.mint({ decision, ttlMs: RAIL.cardTtlMs, now: NOW, merchantLock: BASE.cart.merchant.domain, purpose: BASE.cart.id });

  it("a limit equal to the ceiling mints, with limit == total (I2)", async () => {
    const decision = approvedAt(RAIL.ceilingMinor);
    const card = await mint(sim(), decision);
    expect(card.limit_minor).toBe(RAIL.ceilingMinor);
    expect(card.simulated).toBe(true);
  });

  it("a limit one minor unit over the ceiling is OVER_CEILING, even if an engine bug approved it", async () => {
    const approved = approvedAt(RAIL.ceilingMinor);
    await expect(mint(sim(), { ...approved, approved_limit_minor: RAIL.ceilingMinor + 1 })).rejects.toMatchObject({ code: "OVER_CEILING" });
  });

  it("the card slots equal the engine's R8 limit: the next mint after the maximum is MAX_ACTIVE", async () => {
    const rail = sim();
    for (let i = 0; i < RAIL.maxActive; i += 1) {
      const decision = decide({ ...withTotal(ROOMY, 5_000 + i), cart: { ...withTotal(ROOMY, 5_000 + i).cart, id: `crt_slot${i}x` } });
      await mint(rail, decision);
    }
    const next = decide({ ...withTotal(ROOMY, 7_000), cart: { ...withTotal(ROOMY, 7_000).cart, id: "crt_slotovr" } });
    await expect(mint(rail, next)).rejects.toBeInstanceOf(MintError);
    await expect(mint(rail, next)).rejects.toMatchObject({ code: "MAX_ACTIVE" });
  });

  it("an expired mandate leaves the rail no card window either (R2 and TTL agree at validUntil)", async () => {
    const at = iso(NOW.getTime());
    const expiring = withPacket(withMandate(BASE, { valid_until: at }), { expires_at: at });
    const stopped = decide(expiring);
    expect(stopped.outcome).toBe("DENY");
    const early = withPacket(withMandate(BASE, { valid_until: iso(NOW.getTime() + 1) }), { expires_at: iso(NOW.getTime() + 1) });
    const approved = decide(early);
    expect(approved.outcome).toBe("APPROVE");
    const card = await mint(sim(), approved);
    expect(Date.parse(card.expires_at)).toBeGreaterThan(NOW.getTime()); // clamped to the packet end, still in the future
  });
});
