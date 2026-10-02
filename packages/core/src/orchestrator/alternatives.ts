// suggestAlternatives ("See cheaper options"): after a DENY by R3 or R4, the planner is asked for a pick that fits what
// is left, over the same request and listings, and the proposal goes through the normal pipeline: cart builder,
// judge, engine, log, mint. The planner's answer is only a proposal, so a hostile or mistaken one is stopped again by
// the same rules (R3 for an over-budget pick). A planner without alternatives, or one that returns none, is
// NO_PROPOSAL / no_alternative. Anything but a budget stop is NOT_APPLICABLE and decides nothing.
import type { ListingRecord } from "../generated";
import type { PlannerStop } from "../ports";
import { PACKET_QUEUE_KEY, StepError, now, readLogState, sealedOrThrow, type Ctx } from "./context";
import type { Run } from "./events";
import { findDecision } from "./log-view";
import { runPipeline } from "./pipeline";
import { budgetStopOf, plannerStopOf, rememberStop, type StoppedRequest } from "./stops";
import { checkListings, checkRequestText } from "./submit";
import type { AlternativesRequest, SubmitResult } from "./types";

interface LoadedStop {
  readonly stop: PlannerStop;
  readonly known: StoppedRequest | undefined;
}

/** The stopped decision from the verified log, and what the planner may spend now. */
async function loadStop(ctx: Ctx, logId: string, decisionId: string): Promise<LoadedStop> {
  const state = await readLogState(ctx, logId, now(ctx));
  const decision = findDecision(state.entries, decisionId);
  if (decision === undefined) throw new StepError("NOT_APPLICABLE", "no decision with that id is in the log");
  const template = budgetStopOf(decision);
  if (template === null) throw new StepError("NOT_APPLICABLE", "only a DENY by R3 (over what is left) or R4 (over the per-purchase cap) has cheaper options");
  return { stop: plannerStopOf(decision, template, state.packet.remaining_minor), known: ctx.memory.stops.get(decision.id) };
}

function requestOf(request: AlternativesRequest, known: StoppedRequest | undefined): { readonly requestText: string; readonly listings: readonly ListingRecord[] } {
  const requestText = request.requestText ?? known?.requestText;
  const listings = request.listings ?? known?.listings;
  if (requestText === undefined || listings === undefined) {
    throw new StepError("NOT_APPLICABLE", "the request and listings behind that stop are not known any more; send them with the call");
  }
  return { requestText: checkRequestText(requestText), listings: checkListings(listings) };
}

const withOrigin = (result: SubmitResult, decisionId: string): SubmitResult => (result.ok ? { ...result, alternativeTo: decisionId } : result);

/** Throws StepError; the caller turns it into an OperationFailure. */
export async function alternativesSteps(ctx: Ctx, run: Run, request: AlternativesRequest): Promise<SubmitResult> {
  const sealed = sealedOrThrow(ctx);
  if (request === null || typeof request !== "object" || typeof request.decisionId !== "string") throw new StepError("INVALID_REQUEST", "suggestAlternatives needs a decision id");
  const { stop, known } = await ctx.queue(PACKET_QUEUE_KEY, () => loadStop(ctx, sealed.logId, request.decisionId));
  const { requestText, listings } = requestOf(request, known);
  const result = await runPipeline(ctx, run, sealed, { requestText, listings, checkout: request.checkout ?? "none", allowRepeat: false, stop });
  rememberStop(ctx, result, { requestText, listings });
  return withOrigin(result, request.decisionId);
}
