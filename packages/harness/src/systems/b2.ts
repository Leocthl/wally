// B2: the product. A real orchestrator runs the scenario over a real signed log: the recorded planner proposes, core's cart
// builder prices, the judge reads the listing, the engine decides, the rail mints, the executor charges. Nothing in this file
// decides anything. It plays the shopper's part (what the label says the shopper wants decides the answer to an escalation)
// and reads what happened back from the log.
import type { Decision, LogEntry } from "@laisee/core/generated";
import type { AnswerResult, CheckoutResult, OperationFailure, RevokeResult, SubmitResult } from "@laisee/core/orchestrator";
import type { JudgeInput } from "@laisee/core/ports";
import type { Scenario } from "../types";
import { factsOf, summariseEvent, summariseJudge } from "./summary";
import type { EscalationSummary, OrchestratedWorld, RunOutcome, SystemDeps, SystemUnderTest } from "./types";

/** What the judge is given for a scenario; the orchestrator builds the same from the cart it builds. */
export function judgeInputOf(scenario: Scenario): JudgeInput {
  return {
    intentText: scenario.mandate.intent_text,
    rules: scenario.mandate.rules,
    cart: scenario.cart,
    listingText: scenario.listing.text,
    scameter: scenario.cart.scameter,
  };
}

const CHECKOUT_DELAY_MS = 60_000; // SIMULATED scenario-clock step between the mint and the checkout, a harness constant

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

interface Asked {
  readonly answer: "APPROVE" | "DENY";
  readonly result: AnswerResult;
}

interface Played {
  readonly submits: readonly SubmitResult[];
  readonly asked: readonly Asked[];
  readonly others: readonly (CheckoutResult | RevokeResult)[];
  readonly latencyMs: number | null;
}

async function submitAll(world: OrchestratedWorld, scenario: Scenario): Promise<SubmitResult[]> {
  const results: SubmitResult[] = [];
  for (let k = 0; k < scenario.events.submissions; k += 1) {
    results.push(await world.orchestrator.submit({ requestText: scenario.requestText, listings: [scenario.listing], checkout: "none" }));
  }
  return results;
}

/** The shopper is asked about every open escalation: yes to a purchase the label wants, no to one it must stop. */
async function answerAll(world: OrchestratedWorld, scenario: Scenario, submits: readonly SubmitResult[]): Promise<Asked[]> {
  const asked: Asked[] = [];
  for (const result of submits) {
    if (!result.ok || result.outcome !== "ESCALATE" || result.decision.escalation?.state !== "OPEN") continue;
    const answer = scenario.label.legitimate ? "APPROVE" : "DENY";
    asked.push({ answer, result: await world.orchestrator.answerEscalation(world.answer(result.decision.id, answer), { checkout: "none" }) });
  }
  return asked;
}

const mintedCards = (entries: readonly LogEntry[]): readonly string[] => entries.flatMap((e) => (e.kind === "CARD_MINTED" ? [e.payload.id] : []));
const charged = (entries: readonly LogEntry[], cardId: string): boolean => entries.some((e) => e.kind === "CARD_EVENT" && e.payload.card_id === cardId && e.payload.event === "AUTHORISED");

/** Pay every card, optionally replay the first, and revoke where the scenario does. */
async function settle(world: OrchestratedWorld, scenario: Scenario): Promise<(CheckoutResult | RevokeResult)[]> {
  const results: (CheckoutResult | RevokeResult)[] = [];
  const { orchestrator } = world;
  if (scenario.events.revoke === "after_mint") results.push(await orchestrator.revoke(world.revocation()));
  world.setTime(new Date(Date.parse(scenario.now) + CHECKOUT_DELAY_MS));
  const cards = mintedCards(await world.entries());
  for (const cardId of cards) results.push(await orchestrator.checkout({ cardId }));
  const [first] = cards;
  if (scenario.events.replayCharge && first !== undefined && charged(await world.entries(), first)) results.push(await orchestrator.checkout({ cardId: first }));
  if (scenario.events.revoke === "after_use") results.push(await orchestrator.revoke(world.revocation()));
  return results;
}

async function play(world: OrchestratedWorld, scenario: Scenario, deps: SystemDeps): Promise<Played> {
  const t0 = deps.timer();
  const submits = await submitAll(world, scenario);
  // Latency measures real calls: an outage injected by the judge_down category called nothing, so it is not a sample.
  const latencyMs = deps.measureLatency && scenario.events.judgeFault === "none" ? deps.timer() - t0 : null;
  const asked = await answerAll(world, scenario, submits);
  return { submits, asked, others: await settle(world, scenario), latencyMs };
}

const decisionsOf = (entries: readonly LogEntry[]): readonly Decision[] => entries.flatMap((e) => (e.kind === "DECISION" ? [e.payload] : []));

function escalationsOf(played: Played): EscalationSummary[] {
  return played.asked.map(({ answer, result }) => ({ answer, resolvedTo: result.ok ? result.outcome : "DENY" }));
}

const failuresOf = (played: Played): readonly OperationFailure[] =>
  [...played.submits, ...played.asked.map((a) => a.result), ...played.others].filter((r): r is OperationFailure => !r.ok);

/** A proposal that became no cart: the planner gave none, or the builder refused it. No decision exists for it. */
function noCartReason(submits: readonly SubmitResult[]): string | null {
  for (const r of submits) {
    if (r.ok && r.outcome === "NO_PROPOSAL") return `NO_PROPOSAL: ${r.reason}`;
    if (r.ok && r.outcome === "INVALID_CART") return `INVALID_CART: ${r.code}`;
  }
  return null;
}

/** The first thing that went wrong, in words. A refused mint is not an error: it is the rail's answer (mintBlocked). */
function errorOf(played: Played): string | null {
  const real = failuresOf(played).find((f) => f.mintError === undefined);
  return real === undefined ? noCartReason(played.submits) : `${real.code}: ${real.message}`;
}

const mintBlockedOf = (played: Played): string | null => failuresOf(played).find((f) => f.mintError !== undefined)?.mintError ?? null;

function outcomeFrom(scenario: Scenario, entries: readonly LogEntry[], played: Played, log: RunOutcome["log"]): RunOutcome {
  const decisions = decisionsOf(entries);
  const original = decisions.filter((d) => d.resolves === undefined);
  const first = original[0];
  const events = entries.flatMap((e) => (e.kind === "CARD_EVENT" ? [summariseEvent(e.payload)] : []));
  const authorised = events.filter((e) => e.event === "AUTHORISED");
  const facts = first === undefined ? null : factsOf(first);
  return {
    scenarioId: scenario.id,
    baseline: "B2",
    decision: { outcome: facts?.outcome ?? "DENY", rule: facts?.rule ?? null, templateId: facts?.templateId ?? null, decisionIds: [...new Set(original.map((d) => d.id))] },
    judge: first === undefined ? null : summariseJudge(first.judge, first),
    mints: entries.flatMap((e) => (e.kind === "CARD_MINTED" ? [{ cardId: e.payload.id, limitMinor: e.payload.limit_minor, merchantLock: e.payload.merchant_lock ?? null }] : [])),
    mintBlocked: mintBlockedOf(played),
    events,
    authorisedCount: authorised.length,
    authorisedMinor: authorised.reduce((acc, e) => acc + (e.amountMinor ?? 0), 0),
    r12Void: decisions.some((d) => d.explanation?.template_id === "R12.price_drift"),
    completed: authorised.length > 0,
    latencyMs: played.latencyMs,
    error: errorOf(played),
    log,
    escalations: escalationsOf(played),
  };
}

const stopped = (scenario: Scenario, error: string): RunOutcome => ({
  scenarioId: scenario.id,
  baseline: "B2",
  decision: { outcome: "DENY", rule: null, templateId: null, decisionIds: [] },
  judge: null,
  mints: [],
  mintBlocked: null,
  events: [],
  authorisedCount: 0,
  authorisedMinor: 0,
  r12Void: false,
  completed: false,
  latencyMs: null,
  error,
  log: null,
  escalations: [],
});

export function createB2System(deps: SystemDeps): SystemUnderTest {
  return {
    id: "B2",
    description: "the real orchestrator: recorded planner, core's cart builder, judge, engine R1-R12, rail limit, executor, signed log; the simulated shopper answers escalations",
    async run(scenario: Scenario): Promise<RunOutcome> {
      let world: OrchestratedWorld;
      try {
        world = await deps.components.orchestrated(scenario, deps.judgeFor(scenario));
      } catch (err) {
        return stopped(scenario, `world setup failed: ${message(err)}`);
      }
      try {
        const played = await play(world, scenario, deps);
        const log = deps.audit === false ? null : await world.audit();
        return outcomeFrom(scenario, await world.entries(), played, log);
      } catch (err) {
        return stopped(scenario, `run failed: ${message(err)}`);
      }
    },
  };
}
