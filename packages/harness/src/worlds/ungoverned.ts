// The ungoverned world: B0's card on file. A model approved the purchase and the merchant charges it; nothing re-quotes,
// nothing limits the amount, nothing logs, nothing voids a card when the delegator revokes. The retry budget after a lost
// response is the executor's own default, so the only differences from B1/B2 are the ones the baseline is defined by.
import type { CardRecord, Decision } from "@laisee/core/generated";
import { EXECUTOR_DEFAULTS } from "@laisee/core/executor";
import type { MerchantPort } from "@laisee/core/ports";
import type { Scenario } from "../types";
import type { CheckoutReport, World } from "../systems/types";
import { ScenarioClock } from "./clock";
import { UnlimitedCardRail } from "./unlimited-rail";

export interface UngovernedParts {
  readonly createMerchant: (rail: UnlimitedCardRail, scenario: Scenario) => MerchantPort;
}

const describe = (err: unknown): string => (err instanceof Error ? `${err.name}: ${err.message}` : String(err));

export function ungovernedWorlds(parts: UngovernedParts): (scenario: Scenario) => Promise<World> {
  return async (scenario) => {
    const clock = new ScenarioClock(new Date(scenario.now));
    const rail = new UnlimitedCardRail();
    const merchant = parts.createMerchant(rail, scenario);
    let attempts: ReadonlyMap<string, number> = new Map();
    return {
      mandateProofValid: undefined,
      setTime: (at) => clock.set(at),
      packet: async () => null,
      mint: (decision, merchantLock, purpose) => rail.mint({ decision, ttlMs: 0, now: clock.now(), merchantLock, purpose }),
      async checkout(decision: Decision, card: CardRecord): Promise<CheckoutReport> {
        const n = (attempts.get(card.id) ?? 0) + 1;
        attempts = new Map([...attempts, [card.id, n]]);
        let lastError = "no attempt made";
        for (let call = 1; call <= EXECUTOR_DEFAULTS.maxCheckoutCalls; call += 1) {
          try {
            const event = await merchant.checkout({ cart: decision.cart, handle: card.handle, idempotencyKey: `naive-${card.id}-${n}`, now: clock.now() });
            return { status: "SETTLED", event };
          } catch (err) {
            lastError = describe(err);
          }
        }
        return { status: "FAILED", error: `checkout failed after ${EXECUTOR_DEFAULTS.maxCheckoutCalls} calls: ${lastError}` };
      },
      voidCard: async () => null,
      recordDecision: async () => null,
      recordMint: async () => null,
      audit: async () => null,
    };
  };
}
