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
  const quoted = await requote(deps, decision.cart, card);
  if (!quoted.ok) return quoted.outcome;
  if (quoted.value.total_minor !== approvedTotalMinor) {
    const delta = quoted.value.total_minor - approvedTotalMinor;
    return {
      status: "DRIFT",
      simulated: true,
      last4: card.last4,
      approved_total_minor: approvedTotalMinor,
      quoted_total_minor: quoted.value.total_minor,
      delta_minor: delta,
      quote: quoted.value,
    };
  }

  const key = await resolveKey(run);
  if (!key.ok) return key.outcome;
  const call = await callMerchant(run, key.value);
  if (call.kind === "failed") return call.outcome;
  if (call.kind === "timeout") {
    return { status: "TIMEOUT", simulated: true, last4: card.last4, attempts: call.calls, idempotency_key: key.value };
  }
  const ctx: EventContext = { cardId: card.id, idempotencyKey: key.value, approvedTotalMinor, cart: decision.cart };
  return settle(run, ctx, call.event, call.calls);
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

/** An explicit key wins. Otherwise chk:<card id>:<n>, n counting the charge attempts already logged for this card. */
async function resolveKey(run: Run): Promise<Step<string>> {
  const { deps, input } = run;
  const { card } = input;
  if (input.idempotencyKey !== undefined) {
    if (IDEMPOTENCY_KEY_PATTERN.test(input.idempotencyKey)) return { ok: true, value: input.idempotencyKey };
    return { ok: false, outcome: errorOutcome("INVALID_INPUT", "idempotencyKey does not match the CardEvent pattern", { last4: card.last4 }) };
  }
  try {
    const entries = await deps.store.read(input.logId);
    const attempts = entries.filter(
      (e) => e.kind === "CARD_EVENT" && e.payload.card_id === card.id && e.payload.idempotency_key !== undefined,
    ).length;
    return { ok: true, value: `${CHECKOUT_KEY_PREFIX}:${card.id}:${attempts + 1}` };
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

async function settle(run: Run, ctx: EventContext, event: CardEvent, calls: number): Promise<CheckoutOutcome> {
  const { deps, input } = run;
  const last4 = input.card.last4;
  const problem = eventProblem(event, ctx);
  if (problem !== null) return errorOutcome("EVENT_INVALID", problem, { last4, idempotencyKey: ctx.idempotencyKey });

  const appended = await appendCardEvent(deps, input.logId, event);
  if (!appended.ok) {
    return errorOutcome("LOG_APPEND_FAILED", appended.message, { last4, idempotencyKey: ctx.idempotencyKey, event });
  }
  const settled: CheckoutSettled = {
    status: event.event === "AUTHORISED" ? "AUTHORISED" : "DECLINED",
    simulated: true,
    event,
    last4,
    attempts: calls,
    idempotency_key: ctx.idempotencyKey,
    log_seq: appended.seq,
    anomalies: anomaliesOf(event, ctx),
  };
  return settled;
}
