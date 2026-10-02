// MerchantStub: the SIMULATED shop. It quotes a cart and charges through RailPort.authorise itself.
// Modes script the failures the demo and harness need: honest, overshoot (S1 rail decline), drift (R12),
// preauth (a hold above the quote [F2]), timeout (lost response, retry with the same key), wrong_merchant.
import { SimulatedTimeoutError } from "@laisee/core/executor";
import type { Cart } from "@laisee/core/generated";
import type { CardEvent, MerchantPort, MerchantQuote, RailPort } from "@laisee/core/ports";
import { SIMULATED_SURCHARGE_MINOR, WRONG_MERCHANT_DOMAIN } from "./config";
import { RailSimError } from "./errors";

/** Merchant stub modes (CONTRACT V2 section 2.4). */
export const MERCHANT_MODES = ["honest", "overshoot", "drift", "preauth", "timeout", "wrong_merchant"] as const;
export type MerchantMode = (typeof MERCHANT_MODES)[number];

export type TimeoutPhase = "before_charge" | "after_charge";

/** mandate.schema.json Domain: lowercase host name, no scheme or path. */
const DOMAIN_PATTERN = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

export interface MerchantStubOptions {
  readonly rail: RailPort;
  /** Default honest. Change it between steps with setMode (the DM2 beat flips overshoot to honest). */
  readonly mode?: MerchantMode;
  /** overshoot: charge this much above the quote. Default SIMULATED_SURCHARGE_MINOR. */
  readonly overshootMinor?: number;
  /** drift: the re-quote differs by this much (non-zero; negative = price drop). Default SIMULATED_SURCHARGE_MINOR. */
  readonly driftMinor?: number;
  /** preauth: the hold exceeds the quote by this much [F2.preauth]. Default SIMULATED_SURCHARGE_MINOR. */
  readonly preauthExtraMinor?: number;
  /** timeout: how many calls per idempotency key time out before one gets through. Default 1. */
  readonly timeoutCount?: number;
  /** timeout: after_charge (default) loses the response after the charge landed; before_charge fails before it. */
  readonly timeoutPhase?: TimeoutPhase;
  /** wrong_merchant: the domain to charge from. Default WRONG_MERCHANT_DOMAIN. */
  readonly wrongDomain?: string;
}

function assertMode(mode: unknown): asserts mode is MerchantMode {
  if (!MERCHANT_MODES.some((m) => m === mode)) throw new RailSimError("INVALID_CONFIG", `unknown merchant mode ${String(mode)}`);
}

function amount(value: number, name: string, allowNegative = false): number {
  const ok = Number.isSafeInteger(value) && value !== 0 && (allowNegative || value > 0);
  if (!ok) throw new RailSimError("INVALID_CONFIG", `${name} must be a non-zero integer${allowNegative ? "" : " above zero"}, got ${String(value)}`);
  return value;
}

function honestQuote(cart: Cart): MerchantQuote {
  return {
    total_minor: cart.total_minor,
    subtotal_minor: cart.subtotal_minor,
    shipping_minor: cart.shipping_minor,
    fees_minor: cart.fees_minor,
    fx_minor: cart.fx?.fee_minor ?? 0,
  };
}

const CUT_ORDER = ["shipping_minor", "subtotal_minor", "fees_minor", "fx_minor"] as const;

/** Moves the quote by delta keeping the components summing to the total. A rise lands on shipping; a cut takes shipping first. */
function drifted(quote: MerchantQuote, delta: number): MerchantQuote {
  if (delta > 0) return { ...quote, shipping_minor: quote.shipping_minor + delta, total_minor: quote.total_minor + delta };
  let remaining = -delta;
  let next: MerchantQuote = quote;
  for (const field of CUT_ORDER) {
    const take = Math.min(remaining, next[field]);
    next = { ...next, [field]: next[field] - take };
    remaining -= take;
  }
  if (remaining > 0) throw new RailSimError("INVALID_REQUEST", "the drift would make the quote negative");
  return { ...next, total_minor: quote.total_minor + delta };
}

export class MerchantStub implements MerchantPort {
  readonly #rail: RailPort;
  #mode: MerchantMode;
  readonly #overshootMinor: number;
  readonly #driftMinor: number;
  readonly #preauthExtraMinor: number;
  readonly #timeoutCount: number;
  readonly #timeoutPhase: TimeoutPhase;
  readonly #wrongDomain: string;
  #timeouts: ReadonlyMap<string, number> = new Map();

  constructor(options: MerchantStubOptions) {
    const mode = options.mode ?? "honest";
    assertMode(mode);
    this.#rail = options.rail;
    this.#mode = mode;
    this.#overshootMinor = amount(options.overshootMinor ?? SIMULATED_SURCHARGE_MINOR, "overshootMinor");
    this.#driftMinor = amount(options.driftMinor ?? SIMULATED_SURCHARGE_MINOR, "driftMinor", true);
    this.#preauthExtraMinor = amount(options.preauthExtraMinor ?? SIMULATED_SURCHARGE_MINOR, "preauthExtraMinor");
    const timeouts = options.timeoutCount ?? 1;
    if (!(timeouts === Number.POSITIVE_INFINITY || (Number.isSafeInteger(timeouts) && timeouts >= 0))) {
      throw new RailSimError("INVALID_CONFIG", `timeoutCount must be a non-negative integer, got ${String(timeouts)}`);
    }
    this.#timeoutCount = timeouts;
    this.#timeoutPhase = options.timeoutPhase ?? "after_charge";
    const wrongDomain = options.wrongDomain ?? WRONG_MERCHANT_DOMAIN;
    if (!DOMAIN_PATTERN.test(wrongDomain)) throw new RailSimError("INVALID_CONFIG", "wrongDomain is not a lowercase host name");
    this.#wrongDomain = wrongDomain;
  }

  get mode(): MerchantMode {
    return this.#mode;
  }

  setMode(mode: MerchantMode): void {
    assertMode(mode);
    this.#mode = mode;
  }

  async quote(input: { cart: Cart; now: Date }): Promise<MerchantQuote> {
    const quote = honestQuote(input.cart);
    return this.#mode === "drift" ? drifted(quote, this.#driftMinor) : quote;
  }

  async checkout(input: { cart: Cart; handle: string; idempotencyKey: string; now: Date }): Promise<CardEvent> {
    const { cart, handle, idempotencyKey, now } = input;
    const quote = await this.quote({ cart, now });
    const charge = (): Promise<CardEvent> =>
      this.#rail.authorise({ handle, amountMinor: this.#amountFor(quote), merchantDomain: this.#domainFor(cart), now, idempotencyKey });
    if (this.#mode === "timeout" && this.#timeoutDue(idempotencyKey)) {
      if (this.#timeoutPhase === "after_charge") await charge();
      this.#countTimeout(idempotencyKey);
      throw new SimulatedTimeoutError();
    }
    return charge();
  }

  #amountFor(quote: MerchantQuote): number {
    if (this.#mode === "overshoot") return quote.total_minor + this.#overshootMinor;
    if (this.#mode === "preauth") return quote.total_minor + this.#preauthExtraMinor;
    return quote.total_minor;
  }

  #domainFor(cart: Cart): string {
    if (this.#mode !== "wrong_merchant") return cart.merchant.domain;
    return this.#wrongDomain === cart.merchant.domain ? `other-${this.#wrongDomain}` : this.#wrongDomain;
  }

  #timeoutDue(key: string): boolean {
    return (this.#timeouts.get(key) ?? 0) < this.#timeoutCount;
  }

  #countTimeout(key: string): void {
    this.#timeouts = new Map([...this.#timeouts, [key, (this.#timeouts.get(key) ?? 0) + 1]]);
  }
}
