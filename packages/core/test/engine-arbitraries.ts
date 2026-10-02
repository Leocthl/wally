// fast-check arbitraries for engine property tests: schema-valid mandates, packets, carts, judge
// records and resolutions around the SIMULATED storyline, plus hostile judge records for T-I5.
import fc from "fast-check";
import type { Cart, JudgeRecord, Mandate, PacketState } from "../src/generated";
import type { DecideContext, EscalationAnswer, EscalationResolution } from "../src/ports";
import { CART_A1, M0, PACKET_INITIAL, cartWithTotal } from "./engine-helpers";

/** Fixed fast-check seed so CI runs are reproducible (explored with random seeds during development). */
export const PROPERTY_SEED = 20_261_004;
export const OPEN_ID = "dec_openEscalation01";
const T0 = Date.parse("2026-10-03T02:00:00Z");
const DAY_MS = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const DOMAINS = ["demo-apparel.example", "shop.example", "bad.example", "sub.bad.example"] as const;
const CATEGORIES = ["apparel", "shoes", "electronics"] as const;
const OTHER_SIGNER = "did:key:z6MkFakeSignerKeyXXXXXXXXXXXXXXXXXXXXXXXXXXXX";

/** Around the storyline: mostly inside the mandate, sometimes before valid_from or after valid_until. */
export const nowArb: fc.Arbitrary<Date> = fc.integer({ min: -60_000, max: 35 * DAY_MS }).map((offset) => new Date(T0 + offset));

const money = (max: number) => fc.integer({ min: 0, max });

export const mandateArb: fc.Arbitrary<Mandate> = fc
  .record({
    perPurchase: fc.option(
      fc.record({ hard_cap_minor: money(100_000), share_of_remaining_bp: fc.integer({ min: 1, max: 10_000 }), ask_above_minor: money(100_000) }, { requiredKeys: [] }).filter((p) => Object.keys(p).length > 0),
      { nil: undefined },
    ),
    requireCapture: fc.boolean(),
    maxAge: fc.option(fc.integer({ min: 1, max: 200_000 }), { nil: undefined }),
    velocity: fc.option(fc.record({ max_mints: fc.integer({ min: 1, max: 5 }), window_s: fc.integer({ min: 1, max: 3_600 }) }), { nil: undefined }),
    allow: fc.option(fc.uniqueArray(fc.constantFrom(...DOMAINS), { maxLength: 3 }), { nil: null }),
    deny: fc.uniqueArray(fc.constantFrom(...DOMAINS), { maxLength: 2 }),
    categories: fc.uniqueArray(fc.constantFrom(...CATEGORIES), { minLength: 1, maxLength: 2 }),
  })
  .map(({ perPurchase, requireCapture, maxAge, velocity, allow, deny, categories }) => ({
    ...M0,
    rules: {
      budget: M0.rules.budget,
      categories: categories as Mandate["rules"]["categories"],
      merchants: { allow, deny },
      seller_check: maxAge === undefined ? { require_capture: requireCapture } : { require_capture: requireCapture, max_capture_age_s: maxAge },
      ...(perPurchase === undefined ? {} : { per_purchase: perPurchase }),
      ...(velocity === undefined ? {} : { velocity }),
    },
  }));

export const packetArb: fc.Arbitrary<PacketState> = fc
  .record({
    spent: money(80_000),
    activeLimits: fc.array(money(20_000), { maxLength: 3 }),
    mintOffsets: fc.array(fc.integer({ min: 0, max: 2 * DAY_MS }), { maxLength: 5 }),
    status: fc.constantFrom("ACTIVE", "ACTIVE", "ACTIVE", "EXHAUSTED", "EXPIRED", "REVOKED"),
    escalationExpiry: fc.option(fc.integer({ min: 0, max: 2 * DAY_MS }), { nil: undefined }),
  })
  .map(({ spent, activeLimits, mintOffsets, status, escalationExpiry }) => {
    const committed = Math.min(activeLimits.reduce((s, l) => s + l, 0), 80_000 - spent);
    return {
      ...PACKET_INITIAL,
      committed_minor: committed,
      spent_minor: spent,
      remaining_minor: 80_000 - spent - committed,
      active_cards: activeLimits.map((l, i) => ({ id: `crd_prop${i}card`, limit_minor: l, expires_at: iso(T0 + DAY_MS) })),
      mint_times: [...mintOffsets].sort((a, b) => a - b).map((o) => iso(T0 + o)),
      open_escalations: escalationExpiry === undefined ? [] : [{ decision_id: OPEN_ID, expires_at: iso(T0 + escalationExpiry) }],
      status: status as PacketState["status"],
    };
  });

export const cartArb: fc.Arbitrary<Cart> = fc
  .record({
    total: money(250_000),
    domain: fc.constantFrom(...DOMAINS),
    category: fc.constantFrom(...CATEGORIES),
    state: fc.constantFrom("FLAGGED", "NO_RECORD", "NO_RECORD", "NOT_CHECKED"),
    captureOffset: fc.option(fc.integer({ min: -DAY_MS, max: 10 * DAY_MS }), { nil: null }),
  })
  .map(({ total, domain, category, state, captureOffset }) => {
    const base = cartWithTotal(CART_A1, total);
    return {
      ...base,
      merchant: { ...base.merchant, domain },
      items: [{ ...base.items[0], category }] as Cart["items"],
      scameter: {
        state: state as Cart["scameter"]["state"],
        capture_ref: captureOffset === null ? null : "SIM-prop-capture",
        captured_at: captureOffset === null ? null : iso(T0 + captureOffset),
        searched: captureOffset === null ? [] : ["url"],
      },
    };
  });

const prob = fc.double({ min: 0, max: 1, noNaN: true });
const answersArb = fc.record({
  scope_fit: fc.record({ in_scope: prob, out_of_scope: prob }),
  injection_risk: fc.record({ clean: prob, suspicious: prob, injection: prob }),
  seller_risk: fc.record({ low_risk: prob, high_risk: prob }),
  escalate_or_proceed: fc.record({ proceed: prob, escalate: prob }),
});
const judgeBase = fc.record({
  provider: fc.constantFrom("laya" as const, "jev" as const, "replay" as const),
  model: fc.constant("typed-decisions"),
  version: fc.constant("prop"),
  latency_ms: fc.nat(5_000),
  shadow: fc.boolean(),
});

/** Schema-valid judge records: OK with answers, TIMEOUT or ERROR, or truncated input. */
export const judgeArb: fc.Arbitrary<JudgeRecord> = fc.oneof(
  fc.tuple(judgeBase, answersArb).map(([b, answers]): JudgeRecord => ({ ...b, status: "OK", answers })),
  fc.tuple(judgeBase, fc.constantFrom("TIMEOUT" as const, "ERROR" as const)).map(([b, status]): JudgeRecord => ({ ...b, status })),
  judgeBase.map((b): JudgeRecord => ({ ...b, status: "ERROR", input_truncated: true })),
);

/** Records the engine must treat as unusable: failures, unknown enums, malformed answers, garbage. */
export const brokenJudgeArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.tuple(judgeBase, fc.constantFrom("TIMEOUT", "ERROR", "MAYBE", "ok", "")).map(([b, status]) => ({ ...b, shadow: false, status })),
  fc.tuple(judgeBase, answersArb).map(([b, answers]) => ({ ...b, shadow: false, status: "OK", input_truncated: true, answers })),
  fc.tuple(judgeBase, answersArb, fc.constantFrom(Number.NaN, -0.5, 1.5, "0.5", null)).map(([b, answers, bad]) => ({
    ...b,
    shadow: false,
    status: "OK",
    answers: { ...answers, seller_risk: { low_risk: 0.9, high_risk: bad } },
  })),
  fc.tuple(judgeBase, answersArb).map(([b, answers]) => ({ ...b, shadow: false, status: "OK", provider: "llm", answers })),
  fc.anything().filter((v) => !(v !== null && typeof v === "object" && (v as Record<string, unknown>)["shadow"] === true)),
);

const answerArb = (delegator: string): fc.Arbitrary<EscalationAnswer> =>
  fc
    .record({
      decision_id: fc.constantFrom(OPEN_ID, "dec_someOtherDec01"),
      choice: fc.constantFrom("APPROVE" as const, "DENY" as const),
      answeredOffset: fc.integer({ min: 0, max: 2 * DAY_MS }),
      signer: fc.constantFrom(delegator, delegator, OTHER_SIGNER),
    })
    .map(({ decision_id, choice, answeredOffset, signer }) => ({
      decision_id,
      mandate_id: M0.id,
      cart_sha256: "c".repeat(64), // laisee.resolve.v2 binding; placeholder: the engine checks binding and timing, not the cart hash
      choice,
      answered_at: iso(T0 + answeredOffset),
      signer,
      signature: "A".repeat(86),
    }));

export const resolutionArb: fc.Arbitrary<EscalationResolution | undefined> = fc.option(
  fc
    .record({ resolves: fc.constantFrom(OPEN_ID, OPEN_ID, "dec_notOpenAtAll01"), answer: fc.option(answerArb(M0.delegator), { nil: undefined }) })
    .map(({ resolves, answer }) => (answer === undefined ? { resolves } : { resolves, answer })),
  { nil: undefined },
);

export const ctxArb: fc.Arbitrary<DecideContext | undefined> = fc.oneof(
  fc.constant({ mandateProofValid: true }),
  fc.constant({ mandateProofValid: true }),
  fc.constant({ mandateProofValid: false }),
  fc.constant({}),
  fc.constant(undefined),
);
