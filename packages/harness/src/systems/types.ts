// The record every system under test returns for one scenario, plus the ports the systems are built from.
import type { CardRecord, Decision, EscalationAnswer, LogEntry, PacketState, Revocation, RuleId, TemplateId } from "@wally/core/generated";
import type { WallyEngine } from "@wally/core/engine";
import type { Orchestrator } from "@wally/core/orchestrator";
import type { CardEvent, JudgePort, MerchantQuote } from "@wally/core/ports";
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
  /** null = the instrument has no limit at all (the ungoverned baseline's card). */
  readonly limitMinor: number | null;
  readonly merchantLock: string | null;
}

/** What the harness checked in the log a scenario left behind (I7). null for a baseline that keeps no log. */
export interface LogAudit {
  readonly entries: number;
  readonly decisions: number;
  /** verifyChain passed over the whole log with the engine and delegator keys. */
  readonly chainOk: boolean;
  readonly failure: string | null;
}

export interface EventSummary {
  readonly event: CardEvent["event"];
  readonly amountMinor: number | null;
  readonly merchantDomain: string | null;
  readonly declineCode: DeclineCode | null;
}

/** What B2 did when the engine escalated: it asked the shopper, and the simulated shopper answered. */
export interface EscalationSummary {
  /** The shopper's answer: APPROVE for a purchase the label wants, DENY for one it must stop. */
  readonly answer: "APPROVE" | "DENY";
  /** The decision outcome after the answer. */
  readonly resolvedTo: DecisionOutcome;
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
  readonly log: LogAudit | null;
  /** The questions the shopper was asked, in order. Only B2 has an escalation path; the others stop on an ESCALATE. */
  readonly escalations: readonly EscalationSummary[];
}

export interface SystemUnderTest {
  readonly id: Baseline;
  readonly description: string;
  run(scenario: Scenario): Promise<RunOutcome>;
}

// ---------- the world a scenario runs in ----------

export type CheckoutReport =
  /** The rail answered and the answer is final: AUTHORISED, or DECLINED with the limit held. */
  | { readonly status: "SETTLED"; readonly event: CardEvent }
  /** The re-quote differs from the approved cart; nothing was charged. The engine rules on it (R12). */
  | { readonly status: "DRIFT"; readonly quote: MerchantQuote }
  /** No answer worth logging: every call timed out, or the executor refused. Nothing may be assumed paid. */
  | { readonly status: "FAILED"; readonly error: string };

/**
 * Everything one scenario runs against, built fresh so no state leaks between scenarios. The governed world is the product
 * path (RailSim, MerchantStub, core's executor, a signed log); the ungoverned world is B0's card on file with no limit.
 */
export interface World {
  /** R1 input: the sealed credential's proof verified. undefined where there is no credential (the ungoverned baseline). */
  readonly mandateProofValid: boolean | undefined;
  setTime(at: Date): void;
  /** The packet as the log folds it now: what the next decision must be made against. null where there is no log. */
  packet(): Promise<PacketState | null>;
  mint(decision: Decision, merchantLock: string, purpose: string): Promise<CardRecord>;
  checkout(decision: Decision, card: CardRecord): Promise<CheckoutReport>;
  /** The VOIDED event, or null when the card could not be voided (a used card is final [F2]). */
  voidCard(card: CardRecord): Promise<CardEvent | null>;
  /** I7: the decision is logged before any side effect. Resolves to an error message, or null when it is logged. */
  recordDecision(decision: Decision): Promise<string | null>;
  recordMint(card: CardRecord): Promise<string | null>;
  audit(): Promise<LogAudit | null>;
}

/**
 * B2's world: the product's own pipeline for one scenario. A real orchestrator over a real signed log, with the scenario's
 * history already written into it, a SIMULATED rail and merchant, a recorded planner and the judge for this scenario. The
 * simulated delegator holds the one key that may answer an escalation or revoke the mandate.
 */
export interface OrchestratedWorld {
  readonly orchestrator: Orchestrator;
  setTime(at: Date): void;
  /** The delegator's signed answer to an escalation, bound to the escalated decision's mandate and cart (laisee.resolve.v2). */
  answer(escalated: Decision, choice: "APPROVE" | "DENY"): EscalationAnswer;
  /** The delegator's signed revocation of the mandate. */
  revocation(): Revocation;
  /** Entries from the decision on: the sealed credential and the seeded history are not in it. */
  entries(): Promise<readonly LogEntry[]>;
  audit(): Promise<LogAudit>;
}

/** Everything the factory supplies. Each member is a real implementation behind factory.ts. */
export interface Components {
  readonly engine: WallyEngine;
  /** B2: the real orchestrator. */
  readonly orchestrated: (scenario: Scenario, judge: JudgePort) => Promise<OrchestratedWorld>;
  /** B1 and B2: RailSim, MerchantStub, core's executor, a signed log. */
  readonly governed: (scenario: Scenario) => Promise<World>;
  /** B0: a card on file with no limit, the same merchant stub, no executor, no log. */
  readonly ungoverned: (scenario: Scenario) => Promise<World>;
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
  /** Verify each scenario's log with verifyChain when it ends (I7). Default true; a large test sweep may switch it off. */
  readonly audit?: boolean;
}
