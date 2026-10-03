// Vocabulary shared by the generator, the systems under test, the metrics and the report.
import type {
  Cart,
  ListingRecord,
  Mandate,
  PacketState,
  PlannerReplayRecord,
  RuleId,
  ScameterCapture,
  TemplateId,
} from "@wally/core/generated";
import type { CardEvent } from "@wally/core/ports";
import type { MerchantMode } from "@wally/rail-sim";
import type { Category } from "./config";

export type { Category } from "./config";

export const BASELINES = ["B0", "B1", "B2"] as const;
export type Baseline = (typeof BASELINES)[number];

export type DecisionOutcome = "APPROVE" | "DENY" | "ESCALATE";
export type DeclineCode = NonNullable<CardEvent["decline_code"]>;
export type StopId = "S1" | "S2" | "S3" | "S4" | "S5" | "S6";

/** What the money does after the decision. */
export type PaymentExpectation =
  | { readonly kind: "authorised" } // exactly one AUTHORISED charge for the cart total
  | { readonly kind: "none" } // no card, no charge
  | { readonly kind: "voided" } // a card was minted, then voided (R12 drift or revoke); no charge
  | { readonly kind: "declined"; readonly code: DeclineCode }; // a card exists, the charge declined; no money moved

export interface ScenarioLabel {
  /** The shopper wants this purchase. Controls and normal purchases are legitimate. */
  readonly legitimate: boolean;
  readonly class: "deterministic" | "judge_dependent";
  readonly decision: DecisionOutcome;
  /** Primary rule for DENY and ESCALATE; R12 for a drift void; null for APPROVE. */
  readonly rule: RuleId | null;
  readonly templateId: TemplateId | null;
  readonly stop: StopId | null;
  readonly payment: PaymentExpectation;
  /** A second charge on the used token must decline CARD_USED. */
  readonly replayDeclined: boolean;
  /** Distinct decisions and mints expected after the scenario's submissions (duplicate collapses to one). */
  readonly expectedMints: 0 | 1;
  readonly note: string;
}

export type RevokeTiming = "none" | "after_mint" | "after_use";

export interface ScenarioEvents {
  readonly merchantMode: MerchantMode;
  /** Signed size of a drift, overshoot or preauth, in minor units. */
  readonly merchantDeltaMinor: number;
  readonly submissions: 1 | 2;
  readonly replayCharge: boolean;
  readonly revoke: RevokeTiming;
  readonly judgeFault: "none" | "down";
}

export interface InjectionInfo {
  readonly corpusId: string;
  readonly style: string;
  readonly split: "tuning" | "heldout";
  /** The cart also breaks a hard rule, so the judge is not the only thing between the attack and the rail. */
  readonly hardRulesAlsoStop: boolean;
}

/**
 * The past that makes the packet what the scenario needs. B2 seeds it into a real signed log before the decision; the
 * packet below is what folding that log gives (a test checks it against core's own foldPacket). `agoS` is seconds before
 * the decision time. All of it is SIMULATED, and the cards in it are not known to the rail.
 */
export type HistoryEvent =
  /** A card minted long ago and charged in full: this is what has been spent (several of these when the per-purchase terms need it). */
  | { readonly kind: "spent"; readonly cardId: string; readonly agoS: number; readonly amountMinor: number }
  /** A card minted and then voided: it counts as a mint in the rolling window and holds no money. */
  | { readonly kind: "released"; readonly cardId: string; readonly agoS: number; readonly limitMinor: number }
  /** A card minted and still ACTIVE: its limit is committed and it counts against the active-card maximum. */
  | { readonly kind: "active"; readonly cardId: string; readonly agoS: number; readonly limitMinor: number }
  /** The delegator revoked the mandate. */
  | { readonly kind: "revoked"; readonly agoS: number };

export interface Scenario {
  readonly id: string;
  readonly index: number;
  readonly category: Category;
  readonly variant: string;
  readonly provenance: "SIMULATED";
  readonly label: ScenarioLabel;
  /** Decision time, RFC 3339 UTC. */
  readonly now: string;
  readonly mandate: Mandate;
  readonly packet: PacketState;
  readonly history: readonly HistoryEvent[];
  readonly listing: ListingRecord;
  readonly scameterCapture: ScameterCapture | null;
  /** The one recorded planner output that feeds B0, B1 and B2. */
  readonly planner: PlannerReplayRecord;
  /** What the shopper typed. The recorded planner does not read it; the orchestrator needs one. */
  readonly requestText: string;
  readonly cart: Cart;
  readonly events: ScenarioEvents;
  /** Ground truth for the overspend metric: min(remaining, effective per-purchase cap). */
  readonly limits: { readonly allowedMinor: number };
  readonly injection: InjectionInfo | null;
}
