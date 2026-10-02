// Audit (lane s-audit): binding of a delegator's escalation answer. The answer signed only
// {decision_id, choice, answered_at, signer}; nothing tied the decision that consumes it to the cart the
// delegator was shown, and nothing stopped one answer from being consumed twice in the verifier.
// Lane s-fix-crypto: answers are laisee.resolve.v2 (mandate_id and cart_sha256 signed).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { engine } from "../src/engine";
import type { Cart, Decision } from "../src/generated";
import { cartSha256, signEscalationAnswer } from "../src/log";
import { foldPacket } from "../src/packet";
import type { EscalationAnswer } from "../src/ports";
import { loadFixture } from "../src/testing/fixtures";
import { verifyChain } from "../src/verify";
import { CART_A1, CART_A4, JUDGE_TEE, M0, PACKET_INITIAL, PROOF_OK, at, cartWithTotal } from "./engine-helpers";
import { buildLog, demoCredential, demoKeys, type DemoStep } from "./log-helpers";
import { append, sealedLog } from "./packet-helpers";

const T0 = "2026-10-03T02:12:00Z";
const NOT_CHECKED: Cart["scameter"] = { state: "NOT_CHECKED", capture_ref: null, captured_at: null, searched: [] };
const CART_SHOWN: Cart = { ...CART_A1, scameter: NOT_CHECKED };
/** A different cart: other merchant, other item, 2.3x the price, still inside the HK$800 budget. */
const CART_SWAPPED: Cart = {
  ...cartWithTotal({ ...CART_A4, scameter: NOT_CHECKED }, 60000),
  id: "crt_swappedB1",
  merchant: { name: "Other Shop (SIMULATED)", domain: "other-shop.example" },
  listing: { ...CART_A4.listing, url: "https://other-shop.example/p/coat" },
};

const answer = (decisionId: string): EscalationAnswer => ({
  decision_id: decisionId,
  mandate_id: M0.id,
  cart_sha256: cartSha256(CART_SHOWN), // v2 binding: the answer names the cart the delegator was shown
  choice: "APPROVE",
  answered_at: "2026-10-03T02:12:30Z",
  signer: M0.delegator,
  signature: "A".repeat(86), // the engine checks binding and timing; the orchestrator verifies the signature
});

function escalated() {
  const decision = engine.decide(M0, PACKET_INITIAL, CART_SHOWN, JUDGE_TEE, at(T0), undefined, PROOF_OK);
  if (decision.outcome !== "ESCALATE") throw new Error(`setup: expected ESCALATE, got ${decision.outcome}`);
  const packet = foldPacket(append(sealedLog(), "DECISION", decision, T0), at(T0));
  return { decision, packet };
}

describe("engine: answer for the escalated cart (controls)", () => {
  it("APPROVE resolves the same cart (expected path)", () => {
    const { decision, packet } = escalated();
    const d = engine.decide(M0, packet, CART_SHOWN, JUDGE_TEE, at("2026-10-03T02:12:40Z"), { resolves: decision.id, answer: answer(decision.id) }, PROOF_OK);
    expect(d).toMatchObject({ outcome: "APPROVE", approved_limit_minor: CART_SHOWN.total_minor });
  });
});

// Computed outside it.fails so a setup error turns the file red instead of passing as an expected failure.
const SWAPPED = (() => {
  const { decision, packet } = escalated();
  return engine.decide(M0, packet, CART_SWAPPED, JUDGE_TEE, at("2026-10-03T02:12:40Z"), { resolves: decision.id, answer: answer(decision.id) }, PROOF_OK);
})();

describe("KNOWN DEFECT S-ESC-1: an APPROVE answer is not bound to the cart the delegator saw", () => {
  it.fails("decide() refuses to apply the answer for decision E (cart A) to a different cart B", () => {
    // Today: outcome APPROVE, approved_limit_minor 60000, merchant other-shop.example, R9 cleared_by delegator.
    expect(SWAPPED.outcome).not.toBe("APPROVE");
  });
});

// ---- verifier: a log written by a buggy or hostile orchestrator (real engine key, real delegator answer) ----

const SCHEMA_DIR = fileURLToPath(new URL("../../../schemas/", import.meta.url));
const DECISION_EXAMPLE = (JSON.parse(readFileSync(`${SCHEMA_DIR}decision.schema.json`, "utf8")) as { examples: Decision[] }).examples[0]!;
const EXPIRES = "2026-10-03T02:21:00Z";

function approveOf(id: string, cart: Cart, extra: Partial<Decision>): Decision {
  const { explanation: _explanation, ...rest } = structuredClone(DECISION_EXAMPLE);
  const rules = rest.rules.map((r) => {
    if (r.id !== "R3") return r;
    const { verdict: _verdict, template_id: _template, ...passing } = r;
    return { ...passing, result: "PASS" as const };
  }) as Decision["rules"];
  return { ...rest, id, cart, rules, outcome: "APPROVE", approved_limit_minor: cart.total_minor, ...extra };
}

async function logWith(resolving: (answer: EscalationAnswer) => Decision[]) {
  const keys = demoKeys();
  const cartA = loadFixture("carts/attempt-1.json", "cart");
  const escalate: Decision = { ...structuredClone(DECISION_EXAMPLE), id: "dec_demoE1", cart: cartA, outcome: "ESCALATE", escalation: { state: "OPEN", expires_at: EXPIRES } };
  const signed = signEscalationAnswer(
    { decision_id: "dec_demoE1", mandate_id: escalate.mandate_id, cart: cartA, choice: "APPROVE", answered_at: new Date("2026-10-03T02:20:30Z") },
    keys.delegator,
  );
  const steps: DemoStep[] = [
    { kind: "MANDATE_SEALED", payload: demoCredential(keys) },
    { kind: "DECISION", payload: escalate },
    ...resolving(signed).map((payload) => ({ kind: "DECISION" as const, payload })),
  ];
  const log = await buildLog(steps, keys);
  return { log, cartA };
}

describe("verifier controls", () => {
  it("one resolving APPROVE for the escalated cart verifies", async () => {
    const { log } = await logWith((a) => [
      approveOf("dec_demoE2", loadFixture("carts/attempt-1.json", "cart"), { resolves: "dec_demoE1", escalation: { state: "APPROVED", expires_at: EXPIRES, answer: a } }),
    ]);
    expect(verifyChain(log.entries, log.keys.publicKeys)).toMatchObject({ ok: true });
  });
});

const SWAPPED_LOG = await logWith((a) => [
  approveOf("dec_demoE2", { ...loadFixture("carts/attempt-4.json", "cart") }, { resolves: "dec_demoE1", escalation: { state: "APPROVED", expires_at: EXPIRES, answer: a } }),
]);
const REUSED_LOG = await logWith((a) => [
  approveOf("dec_demoE2", loadFixture("carts/attempt-1.json", "cart"), { resolves: "dec_demoE1", escalation: { state: "APPROVED", expires_at: EXPIRES, answer: a } }),
  approveOf("dec_demoE3", loadFixture("carts/attempt-1.json", "cart"), { resolves: "dec_demoE1", escalation: { state: "APPROVED", expires_at: EXPIRES, answer: a } }),
]);

// Same verifier gap without any real consent: an APPROVE that resolves an ESCALATE with no answer, or with the
// delegator's DENY answer (A3-01 a, b).
const NO_ANSWER_LOG = await logWith(() => [
  approveOf("dec_demoE2", loadFixture("carts/attempt-1.json", "cart"), { resolves: "dec_demoE1", escalation: { state: "APPROVED", expires_at: EXPIRES } }),
]);
const DENIED_LOG = await (async () => {
  const keys = demoKeys();
  const deny = signEscalationAnswer(
    {
      decision_id: "dec_demoE1",
      mandate_id: "mnd_demoM0",
      cart: loadFixture("carts/attempt-1.json", "cart"),
      choice: "DENY",
      answered_at: new Date("2026-10-03T02:20:30Z"),
    },
    keys.delegator,
  );
  return logWith(() => [
    approveOf("dec_demoE2", loadFixture("carts/attempt-1.json", "cart"), { resolves: "dec_demoE1", escalation: { state: "APPROVED", expires_at: EXPIRES, answer: deny } }),
  ]);
})();

describe("KNOWN DEFECT S-ESC-2: the verifier accepts a consent applied to another cart or consumed twice", () => {
  it("setup: both hostile logs were written by the real appendEntry (engine key) with a real delegator answer", () => {
    expect(SWAPPED_LOG.log.entries).toHaveLength(3);
    expect(REUSED_LOG.log.entries).toHaveLength(4);
  });

  it.fails("rejects a resolving APPROVE whose cart differs from the escalated decision's cart", () => {
    expect(verifyChain(SWAPPED_LOG.log.entries, SWAPPED_LOG.log.keys.publicKeys).ok).toBe(false);
  });

  it.fails("rejects a second decision that consumes the same answer (two mints from one consent)", () => {
    expect(verifyChain(REUSED_LOG.log.entries, REUSED_LOG.log.keys.publicKeys).ok).toBe(false);
  });

  it.fails("rejects an APPROVE that resolves an ESCALATE without any delegator answer", () => {
    expect(verifyChain(NO_ANSWER_LOG.log.entries, NO_ANSWER_LOG.log.keys.publicKeys).ok).toBe(false);
  });

  it.fails("rejects an APPROVE backed by the delegator's DENY answer", () => {
    expect(verifyChain(DENIED_LOG.log.entries, DENIED_LOG.log.keys.publicKeys).ok).toBe(false);
  });
});
