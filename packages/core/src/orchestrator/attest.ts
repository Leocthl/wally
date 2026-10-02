// The rail's own event, never the merchant's claim (audit H5). The merchant presents the card and calls the rail
// itself, so the event it hands back is only a claim: an under-reported amount would release budget the rail
// already spent. attestMerchant replays the claim through RailPort.authorise with the same idempotency key. By
// the port contract that returns the event the rail recorded for that key and never charges twice; a rail that
// sees a different request under the key refuses, and the checkout fails closed with nothing logged (the limit
// stays committed). If the merchant never called the rail, the replay is the charge it claimed, so log and rail agree.
import type { CardEvent, MerchantPort, RailPort } from "../ports";

export class RailMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RailMismatchError";
  }
}

const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> => v !== null && typeof v === "object" && !Array.isArray(v);

function claimedTerms(claimed: unknown): { readonly amountMinor: number; readonly merchantDomain: string } {
  if (!isRecord(claimed)) throw new RailMismatchError("the merchant returned no event");
  const amount = claimed["amount_minor"];
  const domain = claimed["merchant_domain"];
  if (typeof amount !== "number" || typeof domain !== "string") throw new RailMismatchError("the merchant's event names no amount or merchant");
  return { amountMinor: amount, merchantDomain: domain };
}

type CheckoutInput = Parameters<MerchantPort["checkout"]>[0];

async function railEventFor(rail: RailPort, input: CheckoutInput, claimed: unknown): Promise<CardEvent> {
  const terms = claimedTerms(claimed);
  try {
    return await rail.authorise({ handle: input.handle, idempotencyKey: input.idempotencyKey, now: input.now, ...terms });
  } catch (err) {
    const why = err instanceof Error ? err.name : "unknown error"; // never the message: it could quote the request
    throw new RailMismatchError(`the rail does not confirm the merchant's event for this key (${why})`);
  }
}

/** A MerchantPort whose checkout returns the rail's recorded event for the attempt's key. Timeouts pass through. */
export function attestMerchant(merchant: MerchantPort, rail: RailPort): MerchantPort {
  return {
    quote: (input) => merchant.quote(input),
    checkout: async (input) => railEventFor(rail, input, await merchant.checkout(input)),
  };
}
