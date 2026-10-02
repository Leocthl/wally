// verifyChain step 9 (semantics): consent and money in an engine-signed log (lane s-fix-crypto, audit M4/M5).
// Hostile logs are written by the real appendEntry with the real engine key, as an operator could; each must
// fail at the right seq with the right reason. A generator of rule-following logs checks they always pass.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Cart, Decision } from "../src/generated";
import { signEscalationAnswer, signRevocation } from "../src/log";
import type { CardEvent } from "../src/ports";
import { loadFixture } from "../src/testing/fixtures";
import { verifyChain } from "../src/verify";
import {
  approveOf,
  buildLog,
  cardFor,
  decisionExample,
  demoCredential,
  demoKeys,
  ESCALATION_EXPIRES,
  escalateOf,
  MANDATE_ID,
  type DemoStep,
} from "./log-helpers";

const keys = demoKeys();
const CART = loadFixture("carts/attempt-1.json", "cart"); // HK$259 [F21]; the M0 budget is HK$800 [F20]
const OTHER_CART = loadFixture("carts/attempt-4.json", "cart");
const BUDGET = demoCredential(keys).credentialSubject.rules.budget.amount_minor;
const ANSWERED = new Date("2026-10-03T02:20:30Z");

const seal: DemoStep = { kind: "MANDATE_SEALED", payload: demoCredential(keys) };
const decision = (payload: Decision): DemoStep => ({ kind: "DECISION", payload });
const minted = (d: Decision, id: string): DemoStep => ({ kind: "CARD_MINTED", payload: cardFor(d, id) });
const cardEvent = (payload: CardEvent): DemoStep => ({ kind: "CARD_EVENT", payload });
const charge = (cardId: string, amount: number, key = `chk_${cardId}`): DemoStep =>
  cardEvent({ card_id: cardId, event: "AUTHORISED", at: "2026-10-03T02:06:00Z", amount_minor: amount, merchant_domain: "demo-apparel.example", idempotency_key: key, simulated: true });
const release = (cardId: string, event: "VOIDED" | "EXPIRED"): DemoStep => cardEvent({ card_id: cardId, event, at: "2026-10-03T02:07:00Z", simulated: true });
const revoke = (): DemoStep => ({ kind: "MANDATE_REVOKED", payload: signRevocation({ mandate_id: MANDATE_ID, revoked_at: new Date("2026-10-03T02:30:00Z") }, keys.delegator) });
const expire = (): DemoStep => ({ kind: "PACKET_EXPIRED", payload: { mandate_id: MANDATE_ID, expired_at: "2026-10-31T15:59:59Z" } });

function answerFor(escalated: Decision, choice: "APPROVE" | "DENY", answeredAt = ANSWERED) {
  return signEscalationAnswer({ decision_id: escalated.id, mandate_id: escalated.mandate_id, cart: escalated.cart, choice, answered_at: answeredAt }, keys.delegator);
}

/** The APPROVE that closes `escalated` with the delegator's answer, for `cart` (the escalated cart by default). */
function approvalOf(id: string, escalated: Decision, opts: { cart?: Cart; answer?: ReturnType<typeof answerFor> | null } = {}): Decision {
  const answer = opts.answer === undefined ? answerFor(escalated, "APPROVE") : opts.answer;
  const escalation = { state: "APPROVED" as const, expires_at: ESCALATION_EXPIRES, ...(answer === null ? {} : { answer }) };
  return approveOf(id, opts.cart ?? escalated.cart, { resolves: escalated.id, escalation });
}

async function verify(steps: readonly DemoStep[]) {
  const log = await buildLog([seal, ...steps], keys);
  return verifyChain(log.entries, keys.publicKeys);
}

const APPROVE_1 = approveOf("dec_semBuy0001", CART);
const ESCALATE_1 = escalateOf("dec_semEsc0001", CART);

describe("step 9 controls: rule-following logs pass", () => {
  it("an APPROVE, its card, a decline, the charge, a void of another card and an answered escalation", async () => {
    const approve2 = approveOf("dec_semBuy0002", CART);
    const approval = approvalOf("dec_semRes0001", ESCALATE_1);
    const steps = [
      decision(APPROVE_1),
      minted(APPROVE_1, "crd_semCard0001"),
      cardEvent({ card_id: "crd_semCard0001", event: "DECLINED", at: "2026-10-03T02:06:00Z", amount_minor: 99999, merchant_domain: "demo-apparel.example", decline_code: "OVER_LIMIT", simulated: true }),
      cardEvent({ card_id: "crd_unknownHdl01", event: "DECLINED", at: "2026-10-03T02:06:00Z", amount_minor: 100, merchant_domain: "demo-apparel.example", decline_code: "UNKNOWN_HANDLE", simulated: true }),
      charge("crd_semCard0001", CART.total_minor),
      decision(approve2),
      minted(approve2, "crd_semCard0002"),
      release("crd_semCard0002", "VOIDED"),
      decision(ESCALATE_1),
      decision(approval),
      minted(approval, "crd_semCard0003"),
      revoke(),
      expire(),
    ];
    expect(await verify(steps)).toMatchObject({ ok: true, head: { seq: steps.length } });
  });

  it("a voided or expired card frees its limit for a later card", async () => {
    const buys = [1, 2, 3, 4].map((n) => approveOf(`dec_semFree000${n}`, CART));
    const steps = buys.flatMap((d, i) => [decision(d), minted(d, `crd_semFree000${i}`), release(`crd_semFree000${i}`, i % 2 === 0 ? "VOIDED" : "EXPIRED")]);
    expect(4 * CART.total_minor).toBeGreaterThan(BUDGET);
    expect(await verify(steps)).toMatchObject({ ok: true });
  });

  it("a DENY may resolve an escalation that an expiry already closed (no money moves)", async () => {
    const expired: Decision = { ...decisionExample(), id: "dec_semExp0001", resolves: ESCALATE_1.id, escalation: { state: "EXPIRED", expires_at: ESCALATION_EXPIRES } };
    const late: Decision = { ...decisionExample(), id: "dec_semExp0002", resolves: ESCALATE_1.id, escalation: { state: "DENIED", expires_at: ESCALATION_EXPIRES } };
    expect(await verify([decision(ESCALATE_1), decision(expired), decision(late)])).toMatchObject({ ok: true });
  });
});

describe("NO_DECISION (I1)", () => {
  it.each([
    ["no decision at all", [minted(APPROVE_1, "crd_semCard0001")], 1],
    ["a DENY", [decision({ ...decisionExample(), id: APPROVE_1.id }), minted(APPROVE_1, "crd_semCard0001")], 2],
    ["an ESCALATE", [decision({ ...ESCALATE_1, id: APPROVE_1.id }), minted(APPROVE_1, "crd_semCard0001")], 2],
    ["an APPROVE logged after the card", [minted(APPROVE_1, "crd_semCard0001"), decision(APPROVE_1)], 1],
  ] as const)("a card minted for %s", async (_name, steps, seq) => {
    expect(await verify(steps)).toMatchObject({ ok: false, failedSeq: seq, reason: "NO_DECISION" });
  });

  it("a charge on a card this log never minted", async () => {
    expect(await verify([decision(APPROVE_1), charge("crd_neverMinted1", 100)])).toMatchObject({ failedSeq: 2, reason: "NO_DECISION" });
  });
});

describe("DUPLICATE", () => {
  it("a decision id used twice", async () => {
    expect(await verify([decision(APPROVE_1), decision({ ...decisionExample(), id: APPROVE_1.id })])).toMatchObject({ failedSeq: 2, reason: "DUPLICATE" });
  });

  it("a second card for one APPROVE, or one card id for two APPROVEs", async () => {
    const twice = [decision(APPROVE_1), minted(APPROVE_1, "crd_semCard0001"), minted(APPROVE_1, "crd_semCard0002")];
    expect(await verify(twice)).toMatchObject({ failedSeq: 3, reason: "DUPLICATE" });
    const approve2 = approveOf("dec_semBuy0002", CART);
    const sameId = [decision(APPROVE_1), minted(APPROVE_1, "crd_semCard0001"), decision(approve2), minted(approve2, "crd_semCard0001")];
    expect(await verify(sameId)).toMatchObject({ failedSeq: 4, reason: "DUPLICATE" });
  });

  it("an APPROVE for an escalation that was already resolved, by an APPROVE or by an expiry", async () => {
    const first = approvalOf("dec_semRes0001", ESCALATE_1);
    const again = approvalOf("dec_semRes0002", ESCALATE_1);
    expect(await verify([decision(ESCALATE_1), decision(first), decision(again)])).toMatchObject({ failedSeq: 3, reason: "DUPLICATE" });
    const expired: Decision = { ...decisionExample(), id: "dec_semExp0001", resolves: ESCALATE_1.id, escalation: { state: "EXPIRED", expires_at: ESCALATION_EXPIRES } };
    expect(await verify([decision(ESCALATE_1), decision(expired), decision(first)])).toMatchObject({ failedSeq: 3, reason: "DUPLICATE" });
  });
});

describe("CONSENT", () => {
  it("an APPROVE that resolves something that is not an earlier escalation", async () => {
    const noTarget = approveOf("dec_semRes0001", CART, { resolves: "dec_semNowhere01" });
    expect(await verify([decision(noTarget)])).toMatchObject({ failedSeq: 1, reason: "CONSENT" });
    const resolvesApprove = approveOf("dec_semRes0001", CART, { resolves: APPROVE_1.id });
    expect(await verify([decision(APPROVE_1), decision(resolvesApprove)])).toMatchObject({ failedSeq: 2, reason: "CONSENT" });
  });

  it("no answer, a DENY answer, another cart, or an answer after the window", async () => {
    const cases: Decision[] = [
      approvalOf("dec_semRes0001", ESCALATE_1, { answer: null }),
      approvalOf("dec_semRes0001", ESCALATE_1, { answer: answerFor(ESCALATE_1, "DENY") }),
      approvalOf("dec_semRes0001", ESCALATE_1, { cart: OTHER_CART }),
      approvalOf("dec_semRes0001", ESCALATE_1, { answer: answerFor(ESCALATE_1, "APPROVE", new Date(ESCALATION_EXPIRES)) }),
    ];
    for (const approval of cases) {
      expect(await verify([decision(ESCALATE_1), decision(approval)])).toMatchObject({ failedSeq: 2, reason: "CONSENT" });
    }
  });

  it("an answer bound to another cart fails earlier, as delegator material (PAYLOAD_SIGNATURE)", async () => {
    const forOther = answerFor({ ...ESCALATE_1, cart: OTHER_CART }, "APPROVE");
    const approval = approvalOf("dec_semRes0001", ESCALATE_1, { cart: OTHER_CART, answer: forOther });
    expect(await verify([decision(ESCALATE_1), decision(approval)])).toMatchObject({ failedSeq: 2, reason: "PAYLOAD_SIGNATURE" });
  });
});

describe("OVERSPEND (I2 and the sealed budget)", () => {
  it("an approved limit that is not the cart total, or a card limit that is not the approved limit", async () => {
    const wide = { ...APPROVE_1, approved_limit_minor: CART.total_minor + 1 };
    expect(await verify([decision(wide)])).toMatchObject({ failedSeq: 1, reason: "OVERSPEND" });
    const card = { ...cardFor(APPROVE_1, "crd_semCard0001"), limit_minor: CART.total_minor + 1 };
    expect(await verify([decision(APPROVE_1), { kind: "CARD_MINTED", payload: card }])).toMatchObject({ failedSeq: 2, reason: "OVERSPEND" });
  });

  it("a charge over the card limit, a second charge, or a charge on a voided card", async () => {
    const base = [decision(APPROVE_1), minted(APPROVE_1, "crd_semCard0001")];
    expect(await verify([...base, charge("crd_semCard0001", CART.total_minor + 1)])).toMatchObject({ failedSeq: 3, reason: "OVERSPEND" });
    const twice = [...base, charge("crd_semCard0001", 100, "chk_one"), charge("crd_semCard0001", 100, "chk_two")];
    expect(await verify(twice)).toMatchObject({ failedSeq: 4, reason: "OVERSPEND" });
    expect(await verify([...base, release("crd_semCard0001", "VOIDED"), charge("crd_semCard0001", 100)])).toMatchObject({ failedSeq: 4, reason: "OVERSPEND" });
  });

  it("cards committed past the sealed budget", async () => {
    const buys = [1, 2, 3, 4].map((n) => approveOf(`dec_semOver000${n}`, CART));
    const steps = buys.flatMap((d, i) => [decision(d), minted(d, `crd_semOver000${i}`)]);
    expect(3 * CART.total_minor).toBeLessThanOrEqual(BUDGET);
    expect(await verify(steps)).toMatchObject({ failedSeq: 8, reason: "OVERSPEND" });
  });
});

describe("AFTER_REVOKE (I6)", () => {
  it.each([
    ["MANDATE_REVOKED", revoke()],
    ["PACKET_EXPIRED", expire()],
  ] as const)("a card minted after %s", async (_name, closing) => {
    expect(await verify([decision(APPROVE_1), closing, minted(APPROVE_1, "crd_semCard0001")])).toMatchObject({ failedSeq: 3, reason: "AFTER_REVOKE" });
  });
});

// ---- property: logs that follow the rules always pass -----------------------------------------------------

type Plan =
  | { readonly kind: "buy"; readonly mint: boolean; readonly then: "none" | "charge" | "under" | "decline" | "void" | "expire" }
  | { readonly kind: "deny" }
  | { readonly kind: "escalate"; readonly resolve: "none" | "deny" | "approve" | "expire"; readonly mint: boolean };

const planArb: fc.Arbitrary<Plan> = fc.oneof(
  fc.record({ kind: fc.constant("buy" as const), mint: fc.boolean(), then: fc.constantFrom("none", "charge", "under", "decline", "void", "expire") }),
  fc.record({ kind: fc.constant("deny" as const) }),
  fc.record({ kind: fc.constant("escalate" as const), resolve: fc.constantFrom("none", "deny", "approve", "expire"), mint: fc.boolean() }),
);

interface Built {
  readonly steps: readonly DemoStep[];
  readonly open: number; // limits committed by active cards
  readonly spent: number;
}

function mintSteps(d: Decision, id: string, then: string, acc: Built): Built {
  const total = d.approved_limit_minor ?? 0;
  if (acc.open + acc.spent + total > BUDGET) return acc; // the engine would deny this mint (R3): skip it
  const after: Record<string, { steps: DemoStep[]; open: number; spent: number }> = {
    none: { steps: [], open: total, spent: 0 },
    charge: { steps: [charge(id, total)], open: 0, spent: total },
    under: { steps: [charge(id, total - 1)], open: 0, spent: total - 1 },
    decline: { steps: [cardEvent({ card_id: id, event: "DECLINED", at: "2026-10-03T02:06:00Z", amount_minor: total + 1, merchant_domain: "demo-apparel.example", decline_code: "OVER_LIMIT", simulated: true })], open: total, spent: 0 },
    void: { steps: [release(id, "VOIDED")], open: 0, spent: 0 },
    expire: { steps: [release(id, "EXPIRED")], open: 0, spent: 0 },
  };
  const next = after[then] ?? after["none"]!;
  return { steps: [...acc.steps, minted(d, id), ...next.steps], open: acc.open + next.open, spent: acc.spent + next.spent };
}

function planSteps(plan: Plan, i: number, acc: Built): Built {
  if (plan.kind === "deny") return { ...acc, steps: [...acc.steps, decision({ ...decisionExample(), id: `dec_propDeny${i}x` })] };
  if (plan.kind === "buy") {
    const d = approveOf(`dec_propBuy${i}x`, CART);
    const withDecision = { ...acc, steps: [...acc.steps, decision(d)] };
    return plan.mint ? mintSteps(d, `crd_propBuy${i}x`, plan.then, withDecision) : withDecision;
  }
  const escalated = escalateOf(`dec_propEsc${i}x`, CART);
  const opened = { ...acc, steps: [...acc.steps, decision(escalated)] };
  if (plan.resolve === "none") return opened;
  if (plan.resolve === "approve") {
    const approval = approvalOf(`dec_propRes${i}x`, escalated);
    const approved = { ...opened, steps: [...opened.steps, decision(approval)] };
    return plan.mint ? mintSteps(approval, `crd_propRes${i}x`, "none", approved) : approved;
  }
  const answer = plan.resolve === "deny" ? { answer: answerFor(escalated, "DENY") } : {};
  const state = plan.resolve === "deny" ? ("DENIED" as const) : ("EXPIRED" as const);
  const closed: Decision = { ...decisionExample(), id: `dec_propRes${i}x`, resolves: escalated.id, escalation: { state, expires_at: ESCALATION_EXPIRES, ...answer } };
  return { ...opened, steps: [...opened.steps, decision(closed)] };
}

describe("step 9 accepts every rule-following log (property)", () => {
  it("random purchases, denials, escalations, answers, card events, then revoke or expiry", async () => {
    const closing = fc.constantFrom<readonly DemoStep[]>([], [revoke()], [expire()], [revoke(), expire()]);
    await fc.assert(
      fc.asyncProperty(fc.array(planArb, { maxLength: 6 }), closing, async (plans, end) => {
        const built = plans.reduce<Built>((acc, plan, i) => planSteps(plan, i, acc), { steps: [], open: 0, spent: 0 });
        const result = await verify([...built.steps, ...end]);
        return result.ok;
      }),
      { numRuns: 30 },
    );
  }, 120_000);
});
