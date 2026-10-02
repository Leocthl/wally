// Pipeline stages for the mock (docs/00 Pipeline contract v0): propose -> assess -> decide -> record -> mint -> checkout.
// Each stage emits trace events with a short pause so the Run screen shows a live trace. Everything here is SIMULATED.
import type { CardRecord, Cart, Decision, JudgeRecord, ListingRecord, ProposeCartInput } from "@laisee/core/generated";
import type { CardEvent } from "@laisee/core/ports";
import type { CardBeat, PlannerTraceInfo, RunOutcome } from "../types";
import { buildCart } from "./cartBuilder";
import { DISPLAY_PACING_MS, MOCK_CONFIG, STORY_GAP } from "./config";
import { decide, decideDrift } from "./engine";
import { canonicalize } from "./hash";
import { openEscalation } from "./escalation";
import type { MockSession } from "./session";

export interface PurchaseSpec {
  readonly runId: string;
  readonly listing: ListingRecord;
  readonly proposal: ProposeCartInput;
  readonly planner: PlannerTraceInfo;
  readonly scameter: Cart["scameter"];
  readonly judge: JudgeRecord;
}

export interface Purchase {
  readonly decision: Decision;
  readonly cart: Cart;
  readonly card?: CardRecord;
}

/** Which charge the merchant stub sends (docs/02 section 10 modes: honest, overshoot, drift; plus the failure beats). */
export type CheckoutMode = "exact" | "overshoot" | "wrong_merchant" | "replay" | "timeout" | "drift";

const WRONG_MERCHANT = "other-shop.example";

async function stage(s: MockSession, runId: string, name: "planner" | "judge" | "engine" | "rail", ms: number, note?: string): Promise<void> {
  s.emit({ type: "stage", runId, stage: name, status: "running", at: s.nowIso() });
  await s.pause(ms);
  s.emit({ type: "stage", runId, stage: name, status: "done", latencyMs: ms, ...(note ? { note } : {}), at: s.nowIso() });
}

/** A run that reuses a card minted earlier never asks the planner, judge or engine again: say so instead of showing them idle. */
export function skipUpstream(s: MockSession, runId: string, note: string): void {
  for (const name of ["planner", "judge", "engine"] as const) {
    s.emit({ type: "stage", runId, stage: name, status: "skipped", note, at: s.nowIso() });
  }
}

/** Planner (untrusted) proposes, the cart builder prices from the listing record, the judge assesses, the engine decides. */
export async function proposeAndDecide(s: MockSession, spec: PurchaseSpec): Promise<Purchase> {
  const mandate = s.requireMandate();
  await stage(s, spec.runId, "planner", spec.planner.latencyMs ?? DISPLAY_PACING_MS.engine, spec.proposal.note);
  const cart = buildCart({ id: s.nextId("crt"), mandate, listing: spec.listing, proposal: spec.proposal, now: s.now(), scameter: spec.scameter });
  s.emit({ type: "cart", runId: spec.runId, cart, listingText: spec.listing.text, ...(spec.proposal.note ? { plannerNote: spec.proposal.note } : {}), planner: spec.planner });
  await stage(s, spec.runId, "judge", spec.judge.latency_ms, spec.judge.status === "OK" ? undefined : "judge could not check the listing");
  s.emit({ type: "judge", runId: spec.runId, judge: spec.judge });
  s.emit({ type: "stage", runId: spec.runId, stage: "engine", status: "running", at: s.nowIso() });
  await s.pause(DISPLAY_PACING_MS.engine);
  const decision = decide({ id: s.nextId("dec"), mandate, packet: s.packet(), cart, judge: spec.judge, now: s.now(), ...(s.revokedAt ? { revokedAt: s.revokedAt } : {}) });
  s.append("DECISION", decision); // I7: logged before any side effect
  s.emit({ type: "decision", runId: spec.runId, decision });
  s.emit({ type: "stage", runId: spec.runId, stage: "engine", status: "done", latencyMs: DISPLAY_PACING_MS.engine, at: s.nowIso() });
  if (decision.outcome === "ESCALATE") openEscalation(s, spec.runId, decision);
  if (decision.outcome !== "APPROVE") {
    const note = decision.outcome === "ESCALATE" ? "no card yet, waiting for an answer" : "no card exists";
    s.emit({ type: "stage", runId: spec.runId, stage: "rail", status: "skipped", note, at: s.nowIso() });
  }
  return { decision, cart };
}

/** I1/I2: mint only for a logged APPROVE, limit = approved total, SIMULATED merchant lock on the cart's domain. */
export async function mintFor(s: MockSession, runId: string, purchase: Purchase): Promise<Purchase> {
  const { decision, cart } = purchase;
  if (decision.outcome !== "APPROVE") throw new Error("mint without APPROVE (I1)");
  s.emit({ type: "stage", runId, stage: "rail", status: "running", at: s.nowIso() });
  await s.pause(DISPLAY_PACING_MS.rail);
  const card = await s.rail.mint({ decision, ttlMs: MOCK_CONFIG.cardTtlMs, now: s.now(), merchantLock: cart.merchant.domain });
  s.append("CARD_MINTED", card);
  s.emit({ type: "card.minted", runId, card });
  s.emit({ type: "stage", runId, stage: "rail", status: "done", latencyMs: DISPLAY_PACING_MS.rail, note: "SIMULATED rail", at: s.nowIso() });
  return { ...purchase, card };
}

function record(s: MockSession, runId: string, event: CardEvent, beat: CardBeat): CardEvent {
  s.append("CARD_EVENT", event);
  s.emit({ type: "card.event", runId, event, beat });
  return event;
}

function request(s: MockSession, card: CardRecord, amountMinor: number, domain: string, key: string) {
  return { handle: card.handle, amountMinor, merchantDomain: domain, now: s.now(), idempotencyKey: key };
}

async function drift(s: MockSession, runId: string, card: CardRecord, approval: Decision): Promise<RunOutcome> {
  const seen = approval.cart.total_minor + STORY_GAP.overMinor;
  const denial = decideDrift(approval, s.packet(), s.requireMandate(), s.nextId("dec"), s.now(), seen);
  s.append("DECISION", denial);
  s.emit({ type: "decision", runId, decision: denial });
  record(s, runId, await s.rail.void(card.id, s.now()), "void");
  return "DENY";
}

/** The executor presents the card handle to the SIMULATED merchant stub and records what the rail answers. */
export async function checkout(s: MockSession, runId: string, card: CardRecord, approval: Decision, mode: CheckoutMode): Promise<RunOutcome> {
  s.emit({ type: "stage", runId, stage: "rail", status: "running", note: mode, at: s.nowIso() });
  await s.pause(DISPLAY_PACING_MS.beat);
  const { cart } = approval;
  const key = `idem_${approval.id}`;
  let outcome: RunOutcome = "APPROVE";
  if (mode === "drift") outcome = await drift(s, runId, card, approval);
  else if (mode === "exact") record(s, runId, await s.rail.authorise(request(s, card, cart.total_minor, cart.merchant.domain, key)), "exact");
  else if (mode === "overshoot") {
    const over = card.limit_minor + STORY_GAP.overMinor;
    record(s, runId, await s.rail.authorise(request(s, card, over, cart.merchant.domain, `${key}_over`)), "overshoot");
  } else if (mode === "wrong_merchant") {
    record(s, runId, await s.rail.authorise(request(s, card, cart.total_minor, WRONG_MERCHANT, `${key}_wrong`)), "wrong_merchant");
  } else if (mode === "replay") {
    record(s, runId, await s.rail.authorise(request(s, card, cart.total_minor, cart.merchant.domain, `${key}_replay`)), "replay");
  } else {
    // The charge lands but the response is lost; the retry carries the same idempotency key, so the rail charges once.
    const first = await s.rail.authorise(request(s, card, cart.total_minor, cart.merchant.domain, `${key}_t`));
    s.emit({ type: "stage", runId, stage: "rail", status: "error", note: "timeout, retrying with the same idempotency key", at: s.nowIso() });
    await s.pause(DISPLAY_PACING_MS.beat);
    const retry = await s.rail.authorise(request(s, card, cart.total_minor, cart.merchant.domain, `${key}_t`));
    if (canonicalize(retry) !== canonicalize(first)) throw new Error("duplicate charge after a retry (I5)");
    record(s, runId, retry, "retry");
  }
  s.emit({ type: "stage", runId, stage: "rail", status: "done", note: "SIMULATED rail", at: s.nowIso() });
  return outcome;
}
