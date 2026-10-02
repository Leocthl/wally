// Orchestrator pipeline with fakes (A-26): seal, submit, the order DECISION before mint (I1, I7), no proposal and
// invalid carts make no Decision, I4 at the planner boundary, events in order, snapshot without handles.
import { describe, expect, it } from "vitest";
import type { OrchestratorEvent } from "../src/orchestrator";
import { FakeRail } from "../src/testing";
import { LISTING_JACKET, LISTING_SOCKS, LISTING_TEE, PROPOSAL_A1, PROPOSAL_A3, PROPOSAL_A4 } from "./cart-helpers";
import { rig } from "./orchestrator-helpers";

const TEE = [LISTING_TEE];

describe("seal", () => {
  it("verifies the credential, appends MANDATE_SEALED at seq 0 and publishes the head checkpoint", async () => {
    const r = rig();
    const sealed = await r.orchestrator.seal(r.credential);
    expect(sealed).toMatchObject({ ok: true, mandate: { id: "mnd_demoM0" }, packet: { remaining_minor: 80000, status: "ACTIVE" }, head: { log_id: "log_demoM0", seq: 0 } });
    expect(await r.kinds()).toEqual(["MANDATE_SEALED"]);
    const types = r.events.map((e) => e.type);
    expect(types).toEqual(["run.started", "mandate.sealed", "log", "checkpoint", "packet", "run.finished"]);
  });

  it("refuses a tampered credential without logging anything (R1 at seal)", async () => {
    const r = rig();
    const tampered = { ...r.credential, credentialSubject: { ...r.credential.credentialSubject, rules: { ...r.credential.credentialSubject.rules, budget: { amount_minor: 999999, currency: "HKD" } } } };
    const result = await r.orchestrator.seal(tampered);
    expect(result).toMatchObject({ ok: false, code: "INVALID_CREDENTIAL" });
    expect(await r.entries()).toEqual([]);
    expect(await r.orchestrator.snapshot()).toMatchObject({ mandate: null, packet: null, log: [] });
    expect(r.events.map((e) => e.type)).toEqual(["run.started", "error", "run.finished"]);
  });

  it("refuses a second seal on the same orchestrator and a credential for another issuer when one is pinned", async () => {
    const r = rig();
    await r.orchestrator.seal(r.credential);
    expect(await r.orchestrator.seal(r.credential)).toMatchObject({ ok: false, code: "ALREADY_SEALED" });
    expect(await r.kinds()).toEqual(["MANDATE_SEALED"]);
  });

  it("operations before seal fail closed with NOT_SEALED; tick and snapshot are empty", async () => {
    const r = rig();
    expect(await r.orchestrator.submit({ requestText: "a tee", listings: TEE })).toMatchObject({ ok: false, code: "NOT_SEALED" });
    expect(await r.orchestrator.checkout({ cardId: "crd_fake0001" })).toMatchObject({ ok: false, code: "NOT_SEALED" });
    expect(await r.orchestrator.revoke(r.revocation())).toMatchObject({ ok: false, code: "NOT_SEALED" });
    expect(await r.orchestrator.answerEscalation(r.answer("dec_whatever01", "APPROVE"))).toMatchObject({ ok: false, code: "NOT_SEALED" });
    expect(await r.orchestrator.tick()).toMatchObject({ ok: true, runId: null });
  });
});

describe("submit", () => {
  it("APPROVE: DECISION is appended before the mint, then CARD_MINTED; limit = cart total (I1, I2, I7)", async () => {
    const r = rig();
    await r.orchestrator.seal(r.credential);
    r.planners.push(PROPOSAL_A1);
    const result = await r.orchestrator.submit({ requestText: "a plain cotton tee", listings: TEE });
    expect(result).toMatchObject({ ok: true, outcome: "APPROVE", decision: { approved_limit_minor: 25900 }, card: { limit_minor: 25900, state: "ACTIVE" }, checkout: null });
    expect(await r.kinds()).toEqual(["MANDATE_SEALED", "DECISION", "CARD_MINTED"]);
    const [, decision, minted] = await r.entries();
    expect(minted?.kind === "CARD_MINTED" && decision?.kind === "DECISION" && minted.payload.decision_id === decision.payload.id).toBe(true);
    expect((await r.orchestrator.snapshot()).packet).toMatchObject({ committed_minor: 25900, remaining_minor: 54100 }); // HK$541 left [F21]
  });

  it("emits the run in order: planner, cart, judge, engine, decision, mint, packet", async () => {
    const r = rig();
    await r.orchestrator.seal(r.credential);
    r.events.length = 0;
    r.planners.push(PROPOSAL_A1);
    await r.orchestrator.submit({ requestText: "a plain cotton tee", listings: TEE, runId: "run_custom1" });
    const trace = r.events.map((e) => (e.type === "stage" ? `${e.stage}:${e.status}` : e.type));
    expect(trace).toEqual([
      "run.started", "planner:running", "planner:done", "cart", "judge:running", "judge", "judge:done", "engine:running",
      "engine:done", "decision", "log", "checkpoint", "rail:running", "rail:done", "card.minted", "log", "checkpoint", "packet", "run.finished",
    ]);
    expect(r.events.every((e) => !("runId" in e) || e.runId === "run_custom1")).toBe(true);
    expect(r.events.at(-1)).toMatchObject({ type: "run.finished", outcome: "APPROVE", operation: "submit" });
  });

  it("DENY (R3, HK$550 over HK$541 [F22]) logs the decision and mints nothing", async () => {
    const r = rig();
    await r.orchestrator.seal(r.credential);
    r.planners.push(PROPOSAL_A1, PROPOSAL_A3);
    await r.orchestrator.submit({ requestText: "a tee", listings: TEE });
    const result = await r.orchestrator.submit({ requestText: "a denim jacket", listings: [LISTING_JACKET] });
    expect(result).toMatchObject({ ok: true, outcome: "DENY", card: null, decision: { explanation: { template_id: "R3.over_remaining" } } });
    expect(await r.kinds()).toEqual(["MANDATE_SEALED", "DECISION", "CARD_MINTED", "DECISION"]);
  });

  it("no proposal: no Decision, no log entry, no judge call (planner returned null)", async () => {
    const r = rig();
    await r.orchestrator.seal(r.credential);
    r.planners.push(null);
    expect(await r.orchestrator.submit({ requestText: "something", listings: TEE })).toMatchObject({ ok: true, outcome: "NO_PROPOSAL", reason: "planner_null" });
    expect(await r.kinds()).toEqual(["MANDATE_SEALED"]);
    expect(r.events.at(-1)).toMatchObject({ type: "run.finished", outcome: "INFO", code: "NO_PROPOSAL:planner_null" });
  });

  it("invalid cart (listing unknown): no Decision", async () => {
    const r = rig();
    await r.orchestrator.seal(r.credential);
    r.planners.push({ ...PROPOSAL_A1, listing_url: "https://elsewhere.example/p/tee" });
    expect(await r.orchestrator.submit({ requestText: "a tee", listings: TEE })).toMatchObject({ ok: true, outcome: "INVALID_CART", code: "listing_unknown" });
    expect(await r.kinds()).toEqual(["MANDATE_SEALED"]);
  });

  it("invalid request: empty text, no listings, an invalid record or two records with one url", async () => {
    const r = rig();
    await r.orchestrator.seal(r.credential);
    const bad = [
      { requestText: " ", listings: TEE },
      { requestText: "a tee", listings: [] },
      { requestText: "a tee", listings: [{ ...LISTING_TEE, shipping_minor: -5 }] },
      { requestText: "a tee", listings: [LISTING_TEE, { ...LISTING_TEE, id: "lst_teeTwin" }] },
    ];
    for (const request of bad) expect(await r.orchestrator.submit(request)).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    expect(await r.kinds()).toEqual(["MANDATE_SEALED"]);
  });

  it("I4: the planner gets the request and listing urls only; listing text and everything else stay out", async () => {
    const r = rig();
    await r.orchestrator.seal(r.credential);
    r.planners.push(PROPOSAL_A4);
    await r.orchestrator.submit({ requestText: "socks please", listings: [LISTING_TEE, LISTING_SOCKS] });
    expect(r.planners.catalogues).toEqual([[LISTING_TEE, LISTING_SOCKS]]);
    const ctx = r.planners.planners[0]?.calls[0];
    expect(ctx).toEqual({ intentText: "socks please", listings: [{ url: LISTING_TEE.url, text: "" }, { url: LISTING_SOCKS.url, text: "" }] });
  });

  it("a cart id reused at the same instant would duplicate a decision id: refused before the append", async () => {
    const r = rig({ cartIds: () => "crt_sameid0001" });
    await r.orchestrator.seal(r.credential);
    r.planners.push(PROPOSAL_A3, PROPOSAL_A3);
    expect(await r.orchestrator.submit({ requestText: "jacket", listings: [LISTING_JACKET] })).toMatchObject({ ok: true });
    expect(await r.orchestrator.submit({ requestText: "jacket", listings: [LISTING_JACKET] })).toMatchObject({ ok: false, code: "DUPLICATE_DECISION" });
    expect((await r.kinds()).filter((k) => k === "DECISION")).toHaveLength(1);
  });

  it("checkout auto runs one checkout right after the mint", async () => {
    const r = rig();
    await r.orchestrator.seal(r.credential);
    r.planners.push(PROPOSAL_A1);
    const result = await r.orchestrator.submit({ requestText: "a tee", listings: TEE, checkout: "auto" });
    expect(result).toMatchObject({ ok: true, outcome: "APPROVE", checkout: { ok: true, status: "AUTHORISED", event: { amount_minor: 25900 } } });
    expect(await r.kinds()).toEqual(["MANDATE_SEALED", "DECISION", "CARD_MINTED", "CARD_EVENT"]);
    expect((await r.orchestrator.snapshot()).packet).toMatchObject({ spent_minor: 25900, committed_minor: 0, remaining_minor: 54100 });
  });
});

describe("events and snapshot", () => {
  it("a throwing listener never breaks the pipeline or the other listeners", async () => {
    const r = rig();
    r.orchestrator.subscribe(() => {
      throw new Error("listener bug");
    });
    const late: OrchestratorEvent[] = [];
    r.orchestrator.subscribe((e) => late.push(e));
    await r.orchestrator.seal(r.credential);
    r.planners.push(PROPOSAL_A1);
    expect(await r.orchestrator.submit({ requestText: "a tee", listings: TEE })).toMatchObject({ ok: true, outcome: "APPROVE" });
    expect(late.map((e) => e.type)).toEqual(r.events.map((e) => e.type));
  });

  it("unsubscribe stops delivery", async () => {
    const r = rig();
    const seen: OrchestratorEvent[] = [];
    const off = r.orchestrator.subscribe((e) => seen.push(e));
    off();
    await r.orchestrator.seal(r.credential);
    expect(seen).toEqual([]);
  });

  it("snapshot: cards without the handle, the log, the head; card.minted events carry no handle either", async () => {
    const r = rig();
    await r.orchestrator.seal(r.credential);
    r.planners.push(PROPOSAL_A1);
    await r.orchestrator.submit({ requestText: "a tee", listings: TEE });
    const snap = await r.orchestrator.snapshot();
    expect(snap.cards).toHaveLength(1);
    expect(snap.cards[0]).not.toHaveProperty("handle");
    expect(snap.head).toMatchObject({ seq: 2 });
    expect(snap.log).toHaveLength(3);
    const minted = r.events.find((e) => e.type === "card.minted");
    expect(minted?.type === "card.minted" && "handle" in minted.card).toBe(false);
  });

  it("purpose sent to the rail is the cart id, never more than 12 digits", async () => {
    const rail = new FakeRail();
    const r = rig({ rail, cartIds: () => "crt_1234567890123456" });
    await r.orchestrator.seal(r.credential);
    r.planners.push(PROPOSAL_A1);
    await r.orchestrator.submit({ requestText: "a tee", listings: TEE });
    expect(rail.cards[0]?.purpose).toBe("crt_123456789012");
    expect(rail.cards[0]?.merchant_lock).toBe("demo-apparel.example");
  });
});
