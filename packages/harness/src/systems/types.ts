// The record every system under test returns for one scenario, plus the ports the systems are built from.
import type { Cart, CardRecord, RuleId, TemplateId } from "@laisee/core/generated";
import type { CardEvent, Engine, JudgePort, MerchantPort, RailPort } from "@laisee/core/ports";
import type { MerchantMode } from "@laisee/rail-sim";
import type { Timer } from "../timer";
import type { ChoiceClient } from "../judge/choice-client";
import type { Baseline, DecisionOutcome, DeclineCode, Scenario } from "../types";

export interface DecisionSummary {
  readonly outcome: DecisionOutcome;
  /** Primary rule: the first FAIL, in rule order, whose verdict equals the outcome. */
  readonly rule: RuleId | null;
  readonly templateId: TemplateId | null;
  /** Distinct decision ids across the scenario's submissions. A duplicate cart must collapse to one. */
  readonly decisionIds: readonly string[];
}

export interface JudgeSummary {
  readonly provider: string;
  readonly status: "OK" | "TIMEOUT" | "ERROR";
  readonly inputTruncated: boolean;
  readonly latencyMs: number;
  /** Probabilities as the judge returned them; absent unless status is OK. */
  readonly answers?: {
    readonly injection_risk: Readonly<Record<string, number>>;
    readonly scope_fit: Readonly<Record<string, number>>;
    readonly seller_risk: Readonly<Record<string, number>>;
  };
  /** R10 injection_risk result in the engine's decision, when the engine reports one. */
  readonly injectionCheck: "PASS" | "FAIL" | "ABSENT";
}

export interface MintSummary {
  readonly cardId: string;
  readonly limitMinor: number;
  readonly merchantLock: string | null;
}

export interface EventSummary {
  readonly event: CardEvent["event"];
  readonly amountMinor: number | null;
  readonly merchantDomain: string | null;
  readonly declineCode: DeclineCode | null;
}

export interface RunOutcome {
  readonly scenarioId: string;
  readonly baseline: Baseline;
  readonly decision: DecisionSummary;
  readonly judge: JudgeSummary | null;
  readonly mints: readonly MintSummary[];
  /** MintError code when the rail refused to mint an approved cart. */
  readonly mintBlocked: string | null;
  /** Rail events in the order they happened: AUTHORISED, DECLINED, VOIDED. */
  readonly events: readonly EventSummary[];
  readonly authorisedCount: number;
  readonly authorisedMinor: number;
  /** The checkout re-quote differed from the approved cart and the approval was voided (R12). */
  readonly r12Void: boolean;
  /** APPROVE and at least one authorised charge. */
  readonly completed: boolean;
  /** Judge + engine + mint wall time in ms, null unless this run measures latency (live only, F26). */
  readonly latencyMs: number | null;
  /** Set when a component threw; the scenario then counts as stopped (I5). */
  readonly error: string | null;
}

export interface SystemUnderTest {
  readonly id: Baseline;
  readonly description: string;
  run(scenario: Scenario): Promise<RunOutcome>;
}

// ---------- ports the systems are built from ----------

export interface CheckoutInput {
  readonly cart: Cart;
  readonly card: CardRecord;
  readonly merchant: MerchantPort;
  readonly rail: RailPort;
  readonly now: Date;
  readonly idempotencyKey: string;
  /** Re-quote before paying and void on any difference (R12). B0 has no rules, so it does not. */
  readonly requote: boolean;
}

export interface CheckoutReport {
  readonly drift: boolean;
  readonly voided: CardEvent | null;
  readonly event: CardEvent | null;
  readonly error: string | null;
}

/** The checkout step. Interim implementation in executor.ts; core's executor (A-22) replaces it through the factory. */
export interface CheckoutExecutor {
  checkout(input: CheckoutInput): Promise<CheckoutReport>;
}

/** Everything the factory supplies. Each member has a real replacement on another lane. */
export interface Components {
  readonly engine: Engine;
  /** A fresh rail per scenario, so no state leaks between scenarios. */
  readonly createRail: () => RailPort;
  readonly createMerchant: (rail: RailPort, mode: MerchantMode, deltaMinor: number) => MerchantPort;
  readonly executor: CheckoutExecutor;
}

export interface SystemDeps {
  readonly components: Components;
  /** Judge for B2; the judge_down fault returns an unavailable judge. */
  readonly judgeFor: (scenario: Scenario) => JudgePort;
  /** Model client for B0's five questions. */
  readonly choiceFor: (scenario: Scenario) => ChoiceClient;
  readonly timer: Timer;
  /** true only for live runs: latency is a measurement of the live judge, recorded runs report none [F26]. */
  readonly measureLatency: boolean;
}
