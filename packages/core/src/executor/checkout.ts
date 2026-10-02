// Checkout (docs/02 section 2): re-quote (R12), charge through the merchant with a stable idempotency key,
// retry only simulated timeouts with that SAME key, log the CARD_EVENT, return a typed outcome.
// The executor never decides: a changed price is reported as DRIFT and the engine rules on it.
import type { CardRecord, Cart } from "../generated";
import type { CardEvent, MerchantQuote } from "../ports";
import { appendCardEvent } from "./append";
import { CHECKOUT_KEY_PREFIX, IDEMPOTENCY_KEY_PATTERN } from "./config";
import { isSimulatedTimeout } from "./errors";
import { anomaliesOf, eventProblem, inputProblem, quoteProblem, type EventContext } from "./inspect";
import { describeError, errorOutcome } from "./outcome";
import type { CheckoutInput, CheckoutOutcome, CheckoutSettled, ExecutorDeps, ExecutorError } from "./types";

type Step<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly outcome: ExecutorError };

interface Run {
  readonly deps: ExecutorDeps;
  readonly maxCalls: number;
  readonly input: CheckoutInput;
}

interface LoggedEvent {
  readonly event: CardEvent;
  readonly seq: number;
}

interface Keyed {
  readonly key: string;
  /** The CARD_EVENT already in the log for this key, if any: the charge attempt is done, replay it. */
  readonly logged: LoggedEvent | undefined;
}

export async function runCheckout(deps: ExecutorDeps, maxCalls: number, input: CheckoutInput): Promise<CheckoutOutcome> {
  try {
    return await checkoutSteps({ deps, maxCalls, input });
  } catch (err) {
    return errorOutcome("CHECKOUT_FAILED", describeError(err, [input?.card?.handle ?? ""]));
  }
}

async function checkoutSteps(run: Run): Promise<CheckoutOutcome> {
  const { deps, input } = run;
  const { decision, card } = input;
  const problem = inputProblem(input.logId, decision, card);
  if (problem !== null) return errorOutcome("INVALID_INPUT", problem);

  const approvedTotalMinor = decision.cart.total_minor;
  const keyed = await resolveKey(run);
  if (!keyed.ok) return keyed.outcome;
  const { key, logged } = keyed.value;
  const ctx: EventContext = { cardId: card.id, idempotencyKey: key, approvedTotalMinor, cart: decision.cart };
  if (logged !== undefined) return settled(ctx, card.last4, logged.event, 0, logged.seq);

  const quoted = await requote(deps, decision.cart, card);
  if (!quoted.ok) return quoted.outcome;
  if (quoted.value.total_minor !== approvedTotalMinor) {
    return {
      status: "DRIFT",
      simulated: true,
      last4: card.last4,
      approved_total_minor: approvedTotalMinor,
      quoted_total_minor: quoted.value.total_minor,
      delta_minor: quoted.value.total_minor - approvedTotalMinor,
      quote: quoted.value,
    };
  }

  const call = await callMerchant(run, key);
  if (call.kind === "failed") return call.outcome;
  if (call.kind === "timeout") {
    return { status: "TIMEOUT", simulated: true, last4: card.last4, attempts: call.calls, idempotency_key: key };
  }
  return record(run, ctx, call.event, call.calls);
}

async function requote(deps: ExecutorDeps, cart: Cart, card: CardRecord): Promise<Step<MerchantQuote>> {
  let quote: MerchantQuote;
  try {
    quote = await deps.merchant.quote({ cart, now: deps.clock.now() });
  } catch (err) {
    return { ok: false, outcome: errorOutcome("QUOTE_FAILED", describeError(err, [card.handle]), { last4: card.last4 }) };
  }
  const problem = quoteProblem(quote);
  if (problem !== null) return { ok: false, outcome: errorOutcome("QUOTE_INVALID", problem, { last4: card.last4 }) };
  return { ok: true, value: quote };
}

/**
 * The attempt's key and the log entry for it, if one exists. An explicit key wins; otherwise chk:<card id>:<n>
 * with n counting the charge attempts already logged for this card, so a re-run after a lost answer (nothing
 * logged) gets the same key and the rail never charges twice.
 */
async function resolveKey(run: Run): Promise<Step<Keyed>> {
  const { deps, input } = run;
  const { card } = input;
  const explicit = input.idempotencyKey;
  if (explicit !== undefined && !IDEMPOTENCY_KEY_PATTERN.test(explicit)) {
    return { ok: false, outcome: errorOutcome("INVALID_INPUT", "idempotencyKey does not match the CardEvent pattern", { last4: card.last4 }) };
  }
  try {
    const entries = await deps.store.read(input.logId);
    const attempts = entries.flatMap((e) => (e.kind === "CARD_EVENT" ? [{ seq: e.seq, event: e.payload }] : []));
    const prefix = `${CHECKOUT_KEY_PREFIX}:${card.id}:`;
    const derived = attempts.filter((a) => a.event.idempotency_key?.startsWith(prefix) === true);
    const key = explicit ?? `${prefix}${derived.length + 1}`;
    const logged = attempts.find(
      (a) => a.event.idempotency_key === key && (a.event.card_id === card.id || a.event.decline_code === "UNKNOWN_HANDLE"),
    );
    return { ok: true, value: { key, logged } };
  } catch (err) {
    return { ok: false, outcome: errorOutcome("LOG_UNAVAILABLE", describeError(err), { last4: card.last4 }) };
  }
}

type MerchantCall =
  | { readonly kind: "event"; readonly event: CardEvent; readonly calls: number }
  | { readonly kind: "timeout"; readonly calls: number }
  | { readonly kind: "failed"; readonly outcome: ExecutorError };

/** Up to maxCalls calls, all with the same key. Only a simulated timeout is retried; anything else fails closed. */
async function callMerchant(run: Run, key: string): Promise<MerchantCall> {
  const { deps, input, maxCalls } = run;
  const { card, decision } = input;
  for (let calls = 1; calls <= maxCalls; calls += 1) {
    try {
      const event = await deps.merchant.checkout({ cart: decision.cart, handle: card.handle, idempotencyKey: key, now: deps.clock.now() });
      return { kind: "event", event, calls };
    } catch (err) {
      if (!isSimulatedTimeout(err)) {
        const outcome = errorOutcome("CHECKOUT_FAILED", describeError(err, [card.handle]), { last4: card.last4, idempotencyKey: key });
        return { kind: "failed", outcome };
      }
    }
  }
  return { kind: "timeout", calls: maxCalls };
}

/** Validates the rail's answer, appends it to the log, and reports it. */
async function record(run: Run, ctx: EventContext, event: CardEvent, calls: number): Promise<CheckoutOutcome> {
  const { deps, input } = run;
  const last4 = input.card.last4;
  const problem = eventProblem(event, ctx);
  if (problem !== null) return errorOutcome("EVENT_INVALID", problem, { last4, idempotencyKey: ctx.idempotencyKey });
  const appended = await appendCardEvent(deps, input.logId, event);
  if (!appended.ok) {
    return errorOutcome("LOG_APPEND_FAILED", appended.message, { last4, idempotencyKey: ctx.idempotencyKey, event });
  }
  return settled(ctx, last4, event, calls, appended.seq);
}

function settled(ctx: EventContext, last4: string, event: CardEvent, calls: number, seq: number): CheckoutSettled {
  return {
    status: event.event === "AUTHORISED" ? "AUTHORISED" : "DECLINED",
    simulated: true,
    event,
    last4,
    attempts: calls,
    idempotency_key: ctx.idempotencyKey,
    log_seq: seq,
    anomalies: anomaliesOf(event, ctx),
  };
}
