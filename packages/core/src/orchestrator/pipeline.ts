// The pipeline behind submit and suggestAlternatives: planner (outside the queue: it never touches the log or the
// rail) -> cart builder -> repeat check -> judge started at once -> packet queue: fold, decide, DECISION, mint. A null
// proposal or an invalid cart makes no Decision. A cart that repeats a live one gets the earlier decision back
// (duplicate.ts) and starts no judge call when the log already shows it.
import { buildCart } from "../cart/build";
import { cartFingerprint } from "../engine/hash";
import type { Cart, ListingRecord, Mandate } from "../generated";
import type { JudgeInput, JudgeRecord, PlannerStop } from "../ports";
import { PACKET_QUEUE_KEY, readEntries, type Ctx, type Sealed } from "./context";
import { findLiveDuplicate, reportDuplicate } from "./duplicate";
import type { Run } from "./events";
import { assessWithDeadline } from "./judge";
import { plan } from "./plan";
import { decideAndRecord } from "./record";
import type { CheckoutMode, DecidedResult, SubmitResult } from "./types";

export interface PipelineInput {
  readonly requestText: string;
  readonly listings: readonly ListingRecord[];
  readonly checkout: CheckoutMode;
  /** true = decide a repeat of a live cart afresh (SubmitRequest.allowRepeat). */
  readonly allowRepeat: boolean;
  /** Set after a budget stop: the planner is asked for alternatives. */
  readonly stop?: PlannerStop;
}

const judgeInput = (mandate: Mandate, cart: Cart, listingText: string): JudgeInput => ({
  intentText: mandate.intent_text,
  rules: mandate.rules,
  cart,
  listingText,
  scameter: cart.scameter,
});

function startJudge(ctx: Ctx, run: Run, mandate: Mandate, cart: Cart, listingText: string): Promise<JudgeRecord> {
  ctx.report.stage(run, "judge", "running");
  return assessWithDeadline(ctx.deps.judge, judgeInput(mandate, cart, listingText), ctx.config.judgeTimeoutMs).then((judge) => {
    ctx.report.emit({ type: "judge", runId: run.runId, judge });
    ctx.report.stage(run, "judge", judge.status === "OK" ? "done" : "error", { note: judge.status, latencyMs: judge.latency_ms });
    return judge;
  });
}

async function proposeAndBuild(ctx: Ctx, run: Run, sealed: Sealed, input: PipelineInput): Promise<SubmitResult | { cart: Cart; listingText: string }> {
  ctx.report.stage(run, "planner", "running");
  const planned = await plan({
    factory: ctx.deps.planner,
    listings: input.listings,
    requestText: input.requestText,
    timeoutMs: ctx.config.plannerTimeoutMs, // [F33]
    onStep: (step) => ctx.report.emit({ type: "planner.step", runId: run.runId, step, at: ctx.report.at() }),
    ...(input.stop === undefined ? {} : { stop: input.stop }),
  });
  if (planned.proposal === null) {
    const quiet = planned.reason === "planner_null" || planned.reason === "no_alternative";
    ctx.report.stage(run, "planner", quiet ? "done" : "error", { note: planned.reason, latencyMs: planned.latencyMs });
    return { ok: true, runId: run.runId, outcome: "NO_PROPOSAL", reason: planned.reason };
  }
  ctx.report.stage(run, "planner", "done", { latencyMs: planned.latencyMs });
  const built = buildCart({
    proposal: planned.proposal,
    listings: input.listings,
    mandate: sealed.mandate,
    now: ctx.deps.clock.now(),
    ids: ctx.deps.ids,
    scameterByRef: ctx.deps.scameter,
  });
  if (!built.ok) return { ok: true, runId: run.runId, outcome: "INVALID_CART", code: built.code, detail: built.detail };
  const listingText = input.listings.find((l) => l.url === built.cart.listing.url)?.text ?? "";
  const note = planned.proposal.note;
  ctx.report.emit({ type: "cart", runId: run.runId, cart: built.cart, listingText, ...(note === undefined ? {} : { plannerNote: note }) });
  return { cart: built.cart, listingText };
}

/** Quick look inside the queue, before the judge starts: a repeat the log already shows needs no judge call. */
function earlyDuplicate(ctx: Ctx, run: Run, logId: string, fingerprint: string): Promise<DecidedResult | null> {
  return ctx.queue(PACKET_QUEUE_KEY, async () => {
    const hit = findLiveDuplicate(await readEntries(ctx, logId), fingerprint, ctx.deps.clock.now());
    return hit === null ? null : reportDuplicate(ctx, run, hit, false);
  });
}

/** Throws StepError; the caller turns it into an OperationFailure. */
export async function runPipeline(ctx: Ctx, run: Run, sealed: Sealed, input: PipelineInput): Promise<SubmitResult> {
  const prepared = await proposeAndBuild(ctx, run, sealed, input);
  if ("ok" in prepared) return prepared;
  const fingerprint = input.allowRepeat ? undefined : cartFingerprint(prepared.cart);
  if (fingerprint !== undefined) {
    const early = await earlyDuplicate(ctx, run, sealed.logId, fingerprint);
    if (early !== null) return early;
  }
  const judge = startJudge(ctx, run, sealed.mandate, prepared.cart, prepared.listingText);
  // The check inside decideAndRecord is the one that counts: a repeat submitted at the same time lands here.
  return ctx.queue(PACKET_QUEUE_KEY, () =>
    decideAndRecord(ctx, { run, logId: sealed.logId, cart: prepared.cart, judge, checkout: input.checkout, ...(fingerprint === undefined ? {} : { fingerprint }) }),
  );
}
