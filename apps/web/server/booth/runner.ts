// Booth scenario runner: one booth button = one run (one run.started, one run.finished) over one or more orchestrator
// operations. A "buy" run submits the scenario's listings and plays its checkout beats on the new card; a "card" run
// uses the newest card in the wanted state, or buys one first, so every button works in any order. The merchant
// stub's mode is set for each beat and always put back to honest. Everything here is SIMULATED.
import type { ListingRecord } from "@laisee/core/generated";
import type { CardView, CheckoutResult, Orchestrator, SubmitResult } from "@laisee/core/orchestrator";
import type { Clock } from "@laisee/core/ports";
import type { MerchantMode } from "@laisee/rail-sim";
import type { RunOutcome, RunSummary, TraceEvent } from "../../src/api/types";
import { listingsFor, overflowListing, visitorListing, type Catalogue } from "./catalogue";
import type { RunScenario, RunTracker } from "./events";
import { BEAT_MODES, cardBeatOf, type ScenarioBeat, type ScenarioEntry, type ScenarioTable } from "./scenarioTable";

export interface RunnerDeps {
  readonly orchestrator: Orchestrator;
  readonly merchant: { setMode(mode: MerchantMode): void };
  readonly tracker: RunTracker;
  readonly emit: (event: TraceEvent) => void;
  readonly clock: Clock;
  readonly catalogue: Catalogue;
  readonly table: ScenarioTable;
  readonly runId: () => string;
}

interface Step {
  readonly outcome: RunOutcome;
  readonly decisionId?: string;
  readonly note?: string;
}

interface Bought extends Step {
  readonly card: CardView | null;
}

const NO_CARD_NOTE = "No card to use: the purchase was stopped first.";
const iso = (d: Date): string => d.toISOString().replace(".000Z", "Z");

function submitStep(result: SubmitResult): Bought {
  if (!result.ok) return { outcome: "ERROR", card: null, note: `${result.code}: ${result.message}`, ...(result.decision ? { decisionId: result.decision.id } : {}) };
  if (result.outcome === "NO_PROPOSAL") {
    return { outcome: "INFO", card: null, note: `The planner made no proposal (${result.reason}): it asks the shopper. Nothing was decided and no card exists.` };
  }
  if (result.outcome === "INVALID_CART") return { outcome: "ERROR", card: null, note: `The cart could not be built (${result.code}); no decision, no card.` };
  return { outcome: result.outcome, decisionId: result.decision.id, card: result.card };
}

function checkoutStep(result: CheckoutResult): Step {
  if (!result.ok) return { outcome: "ERROR", note: `${result.code}: ${result.message}` };
  if (result.status === "DRIFT") return { outcome: "DENY", decisionId: result.decision.id };
  if (result.status === "TIMEOUT") return { outcome: "INFO", note: "Every merchant call timed out; the same key is kept, so a retry can never charge twice." };
  return { outcome: "APPROVE" };
}

/** The step's own decision id, else the one behind the card. */
function withDecision(step: Step, fallback: string | undefined): Step {
  const decisionId = step.decisionId ?? fallback;
  return decisionId === undefined ? step : { ...step, decisionId };
}

export class ScenarioRunner {
  readonly #d: RunnerDeps;

  constructor(deps: RunnerDeps) {
    this.#d = deps;
  }

  async run(scenario: RunScenario, body: (runId: string) => Promise<Step>): Promise<RunSummary> {
    const { tracker, emit, clock } = this.#d;
    const runId = this.#d.runId();
    tracker.begin(runId, scenario);
    emit({ type: "run.started", runId, scenario, at: iso(clock.now()) });
    let step: Step;
    try {
      step = await body(runId);
    } catch (err) {
      // Fail closed (I5): nothing after the failure mints, and the visitor sees why instead of a frozen screen.
      step = { outcome: "ERROR", note: err instanceof Error ? err.message : "unknown error" };
    }
    const note = step.note ?? (step.outcome === "ERROR" ? tracker.errorOf(runId) : undefined);
    emit({ type: "run.finished", runId, outcome: step.outcome, at: iso(clock.now()), ...(note === undefined ? {} : { note }) });
    tracker.end(runId);
    return { runId, scenario, outcome: step.outcome, ...(step.decisionId === undefined ? {} : { decisionId: step.decisionId }), ...(note === undefined ? {} : { note }) };
  }

  scenario(entry: ScenarioEntry): Promise<RunSummary> {
    return this.run(entry.id, (runId) => (entry.run === "buy" ? this.#buyRun(entry, runId) : this.#cardRun(entry, runId)));
  }

  /** Try to trick the agent: the visitor's text becomes the description of a fixed SIMULATED listing. */
  custom(text: string): Promise<RunSummary> {
    const { table, catalogue, clock } = this.#d;
    return this.run("custom", async (runId) => {
      const [base] = listingsFor(catalogue, table.custom.listings);
      if (base === undefined) throw new Error("the visitor listing is missing from the catalogue");
      const bought = await this.#submit(table.custom.request, [visitorListing(base, text, clock.now())], runId);
      if (bought.card === null) return bought;
      const paid = await this.#beat(bought.card.id, "exact", runId);
      return paid.outcome === "APPROVE" ? bought : withDecision(paid, bought.decisionId);
    });
  }

  async #listings(entry: ScenarioEntry): Promise<readonly ListingRecord[]> {
    const listings = listingsFor(this.#d.catalogue, entry.listings);
    if (!entry.overflow) return listings;
    const packet = (await this.#d.orchestrator.snapshot()).packet;
    return packet === null ? listings : listings.map((l) => overflowListing(l, packet.remaining_minor));
  }

  async #submit(requestText: string, listings: readonly ListingRecord[], runId: string): Promise<Bought> {
    return submitStep(await this.#d.orchestrator.submit({ requestText, listings, checkout: "none", runId }));
  }

  async #beat(cardId: string, beat: ScenarioBeat, runId: string): Promise<Step> {
    const { merchant, tracker, orchestrator } = this.#d;
    tracker.setBeat(runId, cardBeatOf(beat));
    merchant.setMode(BEAT_MODES[beat]);
    try {
      return checkoutStep(await orchestrator.checkout({ cardId, runId }));
    } finally {
      merchant.setMode("honest");
      tracker.setBeat(runId, null);
    }
  }

  async #beats(cardId: string, beats: readonly ScenarioBeat[], runId: string): Promise<Step> {
    let last: Step = { outcome: "APPROVE" };
    for (const beat of beats) {
      last = await this.#beat(cardId, beat, runId);
      if (last.outcome !== "APPROVE") break;
    }
    return last;
  }

  async #buyRun(entry: ScenarioEntry, runId: string): Promise<Step> {
    const bought = await this.#submit(entry.request, await this.#listings(entry), runId);
    if (bought.card === null || entry.beats.length === 0) return bought;
    return withDecision(await this.#beats(bought.card.id, entry.beats, runId), bought.decisionId);
  }

  #skipUpstream(runId: string): void {
    const at = iso(this.#d.clock.now());
    for (const stage of ["planner", "judge", "engine"] as const) {
      this.#d.emit({ type: "stage", runId, stage, status: "skipped", note: "uses the card minted earlier", at });
    }
  }

  async #cardFor(entry: ScenarioEntry, runId: string): Promise<Bought> {
    const want = entry.card ?? "ACTIVE";
    const existing = (await this.#d.orchestrator.snapshot()).cards.filter((c) => c.state === want).at(-1);
    if (existing !== undefined) {
      this.#skipUpstream(runId);
      return { outcome: "APPROVE", decisionId: existing.decision_id, card: existing };
    }
    const bought = await this.#submit(entry.request, await this.#listings(entry), runId);
    if (bought.card === null) return { ...bought, note: bought.note ?? NO_CARD_NOTE };
    if (want === "USED") {
      const paid = await this.#beat(bought.card.id, "exact", runId);
      if (paid.outcome !== "APPROVE") return { ...paid, card: null };
    }
    return bought;
  }

  async #cardRun(entry: ScenarioEntry, runId: string): Promise<Step> {
    const got = await this.#cardFor(entry, runId);
    if (got.card === null) return got;
    const result = withDecision(await this.#beats(got.card.id, entry.beats, runId), got.decisionId);
    if (result.outcome !== "APPROVE") return result;
    return { ...result, outcome: entry.id === "revoke" ? "INFO" : "APPROVE", ...(entry.note === null ? {} : { note: entry.note }) };
  }
}
