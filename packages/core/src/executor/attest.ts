// The rail's own event, never the merchant's claim (audit H5, S-RAIL-3). The merchant presents the card and calls the
// rail itself, so the event it hands back is only a claim: an under-reported amount would release budget the rail
// already spent. The executor logs the rail's record for the attempt's idempotency key instead:
//  - a rail with eventFor (RailSim): read the record; no record means the rail never saw the key, nothing is logged;
//  - a rail without it (test fakes): replay the claim through authorise with the same key; by the port contract that
//    returns the event recorded for the key and never charges twice.
// A claim that differs from the record is the anomaly MERCHANT_REPORT_MISMATCH; the record wins. This replaces the
// orchestrator's attestMerchant wrapper, so there is one mechanism, inside the component that logs the event.
import type { CardEvent } from "../ports";
import { describeError, errorOutcome } from "./outcome";
import type { CheckoutInput, ExecutorDeps, ExecutorError } from "./types";

export type Attested = { readonly ok: true; readonly event: CardEvent; readonly mismatch: boolean } | { readonly ok: false; readonly outcome: ExecutorError };

const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> => v !== null && typeof v === "object" && !Array.isArray(v);

const FIELDS = ["card_id", "event", "amount_minor", "merchant_domain", "decline_code", "idempotency_key"] as const;

/** Same charge as far as the packet is concerned: card, kind, amount, merchant, decline code and key. */
function sameEvent(claimed: unknown, recorded: CardEvent): boolean {
  return isRecord(claimed) && FIELDS.every((f) => claimed[f] === recorded[f]);
}

interface Attempt {
  readonly deps: ExecutorDeps;
  readonly input: CheckoutInput;
  readonly key: string;
}

function fail(a: Attempt, message: string): Attested {
  return { ok: false, outcome: errorOutcome("RAIL_MISMATCH", message, { last4: a.input.card.last4, idempotencyKey: a.key }) };
}

async function recorded(a: Attempt, read: (key: string) => Promise<CardEvent | null>, claimed: unknown): Promise<Attested> {
  let event: CardEvent | null;
  try {
    event = await read(a.key);
  } catch (err) {
    return fail(a, `the rail record for this key could not be read (${describeError(err, [a.input.card.handle])})`);
  }
  if (event === null) return fail(a, "the rail has no event for this key; the merchant's answer is not logged");
  return { ok: true, event, mismatch: !sameEvent(claimed, event) };
}

async function replayed(a: Attempt, claimed: CardEvent): Promise<Attested> {
  const { amount_minor: amountMinor, merchant_domain: merchantDomain } = claimed;
  if (amountMinor === undefined || merchantDomain === undefined) return fail(a, "the merchant's event names no amount or merchant");
  try {
    const event = await a.deps.rail.authorise({ handle: a.input.card.handle, idempotencyKey: a.key, now: a.deps.clock.now(), amountMinor, merchantDomain });
    return { ok: true, event, mismatch: !sameEvent(claimed, event) };
  } catch (err) {
    const why = err instanceof Error ? err.name : "unknown error"; // never the message: it could quote the request
    return fail(a, `the rail does not confirm the merchant's event for this key (${why})`);
  }
}

/**
 * The rail's record for `key`. `claimed` is the merchant's answer; when the rail cannot be read directly it must already
 * have passed eventProblem (the caller checks), because its terms are replayed.
 */
export function attest(deps: ExecutorDeps, input: CheckoutInput, key: string, claimed: unknown): Promise<Attested> {
  const attempt: Attempt = { deps, input, key };
  const read = deps.rail.eventFor;
  if (typeof read === "function") return recorded(attempt, (k) => read.call(deps.rail, k), claimed);
  return replayed(attempt, claimed as CardEvent);
}
