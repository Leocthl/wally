// Booth scenario runner: one booth button = one run (one run.started, one run.finished) over one or more orchestrator
// operations. A "buy" run submits the scenario's listings and plays its checkout beats on the new card; a "card" run
// uses the newest card in the wanted state, or buys one first, so every button works in any order. The merchant
// stub's mode is set for each beat and always put back to honest. Everything here is SIMULATED.
import type { ListingRecord } from "@wally/core/generated";
import type { Orchestrator } from "@wally/core/orchestrator";
import type { Clock } from "@wally/core/ports";
import type { MerchantMode } from "@wally/rail-sim";
import type { RunSummary, TraceEvent } from "../../api/types";
import { requestKey, type AskSource } from "./ask";
import { listingsFor, overflowListing, visitorListing, type Catalogue } from "./catalogue";
import type { RunScenario, RunTracker } from "./events";
import { BEAT_MODES, cardBeatOf, type ScenarioBeat, type ScenarioCheaper, type ScenarioEntry, type ScenarioTable } from "./scenarioTable";
import { askStep, checkoutStep, submitStep, type Bought, type Step } from "./step";

export interface RunnerDeps {
  readonly orchestrator: Orchestrator;
  readonly merchant: { setMode(mode: MerchantMode): void };
  readonly tracker: RunTracker;
  readonly emit: (event: TraceEvent) => void;
  readonly clock: Clock;
  readonly catalogue: Catalogue;
  readonly table: ScenarioTable;
  readonly runId: () => string;
  /** Said on a run whose judge gave no usable answer, when nothing else is said (on-device mode: no judge runs there). */
  readonly judgeOfflineNote?: string;
}

const NO_CARD_NOTE = "No card to use: the purchase was stopped first.";
/** A seal-only family scenario whose seal was accepted: it was meant to be refused, so say what happened. */
const SEALED_NOTE = "The budget was sealed under Mum's budget.";
const iso = (d: Date): string => d.toISOString().replace(".000Z", "Z");

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
    const note = step.note ?? (step.outcome === "ERROR" ? tracker.errorOf(runId) : undefined) ?? this.#judgeNote(runId);
    const repeat = step.duplicate === true && step.decisionId !== undefined ? { duplicateOf: step.decisionId } : {};
    emit({ type: "run.finished", runId, outcome: step.outcome, at: iso(clock.now()), ...(note === undefined ? {} : { note }), ...(step.code === undefined ? {} : { code: step.code }), ...repeat });
    tracker.end(runId);
    return {
      runId,
      scenario,
      outcome: step.outcome,
      ...(step.decisionId === undefined ? {} : { decisionId: step.decisionId }),
      ...(note === undefined ? {} : { note }),
      ...(step.code === undefined ? {} : { code: step.code }),
      ...(step.duplicate === true ? { duplicate: true as const } : {}),
      ...(step.alternativeTo === undefined ? {} : { alternativeTo: step.alternativeTo }),
    };
  }

  #judgeNote(runId: string): string | undefined {
    const note = this.#d.judgeOfflineNote;
    return note !== undefined && this.#d.tracker.judgeFailed(runId) ? note : undefined;
  }

  /**
   * `refused`: a family scenario's seal was refused before the run started, so the run ends there with that step and
   * nothing else happens. Without it a family scenario goes on from the budget it just sealed.
   */
  scenario(entry: ScenarioEntry, refused?: Step): Promise<RunSummary> {
    return this.run(entry.id, (runId) => (refused === undefined ? this.#body(entry, runId) : Promise.resolve(refused)));
  }

  #body(entry: ScenarioEntry, runId: string): Promise<Step> {
    if (entry.run === "seal") return Promise.resolve({ outcome: "INFO", note: SEALED_NOTE });
    return entry.run === "buy" ? this.#buyRun(entry, runId) : this.#cardRun(entry, runId);
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

  /**
   * Ask Wally: the shopper's words go to the planner over the shelf (live) or to the recording that has them (recorded).
   * The checkout runs inside the orchestrator call, under the honest merchant. A repeat of a live cart is not bought twice.
   */
  ask(requestText: string, source: AskSource): Promise<RunSummary> {
    return this.run("custom", async (runId) => {
      const ids = source.kind === "recorded" ? source.requests.get(requestKey(requestText)) : undefined;
      if (source.kind === "recorded" && ids === undefined) return { outcome: "INFO", code: "UNKNOWN_REQUEST", note: source.unknownNote };
      const listings = source.kind === "live" ? source.shelf : listingsFor(this.#d.catalogue, ids ?? []);
      this.#d.merchant.setMode("honest");
      return askStep(await this.#d.orchestrator.submit({ requestText, listings, checkout: "auto", runId }));
    });
  }

  /**
   * Show Wally a photo: the shopper picked this one photo-shelf item. It is the only listing submitted, so the planner's
   * proposal is fixed by code (withPhotoPicks); the judge, the rules and the one-off card then work as for any ask.
   */
  pick(requestText: string, listing: ListingRecord): Promise<RunSummary> {
    return this.run("custom", async (runId) => {
      this.#d.merchant.setMode("honest");
      return askStep(await this.#d.orchestrator.submit({ requestText, listings: [listing], checkout: "auto", runId }));
    });
  }

  /**
   * "See cheaper options" after a budget stop: the planner replans over the same request and listings. After a stop from a
   * booth button that names a cheaper set (`from`), it replans over that set with that request instead: the button's own
   * listing has nothing cheaper to offer. The pick is a proposal like any other (cart builder, judge, rules, one-off card).
   */
  alternatives(decisionId: string, from?: ScenarioEntry): Promise<RunSummary> {
    return this.run("custom", async (runId) => {
      this.#d.merchant.setMode("honest");
      const replan = from === undefined || from.cheaper === null ? {} : await this.#cheaperSet(from, from.cheaper);
      return askStep(await this.#d.orchestrator.suggestAlternatives({ decisionId, checkout: "auto", runId, ...replan }));
    });
  }

  /** The listings of a cheaper set, with the button's own priced as it was when it was stopped (the shipping overflow of the moment). */
  async #cheaperSet(entry: ScenarioEntry, cheaper: ScenarioCheaper): Promise<{ readonly requestText: string; readonly listings: readonly ListingRecord[] }> {
    const packet = (await this.#d.orchestrator.snapshot()).packet;
    const own = (l: ListingRecord): ListingRecord => (entry.overflow && packet !== null && entry.listings.includes(l.id) ? overflowListing(l, packet.remaining_minor) : l);
    return { requestText: cheaper.request, listings: listingsFor(this.#d.catalogue, cheaper.listings).map(own) };
  }

  async #listings(entry: ScenarioEntry): Promise<readonly ListingRecord[]> {
    const listings = listingsFor(this.#d.catalogue, entry.listings);
    if (!entry.overflow) return listings;
    const packet = (await this.#d.orchestrator.snapshot()).packet;
    return packet === null ? listings : listings.map((l) => overflowListing(l, packet.remaining_minor));
  }

  async #submit(requestText: string, listings: readonly ListingRecord[], runId: string): Promise<Bought> {
    // allowRepeat: every booth button is a self-contained purchase that may repeat an earlier one on purpose (the tee for each rail beat)
    return submitStep(await this.#d.orchestrator.submit({ requestText, listings, checkout: "none", runId, allowRepeat: true }));
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
