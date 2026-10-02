// submit: planner (outside the queue: it never touches the log or the rail) -> cart builder -> judge started at
// once -> packet queue: fold, decide, DECISION, mint. A null proposal or an invalid cart makes no Decision.
import { buildCart } from "../cart/build";
import type { Cart, ListingRecord, Mandate } from "../generated";
import type { JudgeInput, JudgeRecord } from "../ports";
import { formatIssues, validateListingRecord } from "../schema";
import { PACKET_QUEUE_KEY, StepError, sealedOrThrow, type Ctx, type Sealed } from "./context";
import type { Run } from "./events";
import { assessWithDeadline } from "./judge";
import { plan } from "./plan";
import { decideAndRecord } from "./record";
import type { SubmitRequest, SubmitResult } from "./types";

function checkRequest(request: SubmitRequest): readonly ListingRecord[] {
  if (request === null || typeof request !== "object") throw new StepError("INVALID_REQUEST", "the request is not an object");
  if (typeof request.requestText !== "string" || request.requestText.trim() === "") throw new StepError("INVALID_REQUEST", "requestText is empty");
  const listings: unknown = request.listings;
  if (!Array.isArray(listings) || listings.length === 0) throw new StepError("INVALID_REQUEST", "no listing records");
  for (const [index, record] of listings.entries()) {
    const checked = validateListingRecord(record);
    if (!checked.ok) throw new StepError("INVALID_REQUEST", `listing ${index} fails listing-record.schema.json: ${formatIssues(checked.errors)}`);
  }
  const records = listings as readonly ListingRecord[];
  if (new Set(records.map((l) => l.url)).size !== records.length) throw new StepError("INVALID_REQUEST", "two listing records share a url");
  return records;
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

async function proposeAndBuild(ctx: Ctx, run: Run, sealed: Sealed, request: SubmitRequest, listings: readonly ListingRecord[]): Promise<SubmitResult | { cart: Cart; listingText: string }> {
  ctx.report.stage(run, "planner", "running");
  const planned = await plan({
    factory: ctx.deps.planner,
    listings,
    requestText: request.requestText,
    timeoutMs: ctx.config.plannerTimeoutMs, // [F33]
    onStep: (step) => ctx.report.emit({ type: "planner.step", runId: run.runId, step, at: ctx.report.at() }),
  });
  if (planned.proposal === null) {
    ctx.report.stage(run, "planner", planned.reason === "planner_null" ? "done" : "error", { note: planned.reason, latencyMs: planned.latencyMs });
    return { ok: true, runId: run.runId, outcome: "NO_PROPOSAL", reason: planned.reason };
  }
  ctx.report.stage(run, "planner", "done", { latencyMs: planned.latencyMs });
  const built = buildCart({ proposal: planned.proposal, listings, mandate: sealed.mandate, now: ctx.deps.clock.now(), ids: ctx.deps.ids, scameterByRef: ctx.deps.scameter });
  if (!built.ok) return { ok: true, runId: run.runId, outcome: "INVALID_CART", code: built.code, detail: built.detail };
  const listingText = listings.find((l) => l.url === built.cart.listing.url)?.text ?? "";
  const note = planned.proposal.note;
  ctx.report.emit({ type: "cart", runId: run.runId, cart: built.cart, listingText, ...(note === undefined ? {} : { plannerNote: note }) });
  return { cart: built.cart, listingText };
}

/** Throws StepError; the caller turns it into an OperationFailure. */
export async function submitSteps(ctx: Ctx, run: Run, request: SubmitRequest): Promise<SubmitResult> {
  const sealed = sealedOrThrow(ctx);
  const listings = checkRequest(request);
  const prepared = await proposeAndBuild(ctx, run, sealed, request, listings);
  if ("ok" in prepared) return prepared;
  const judge = startJudge(ctx, run, sealed.mandate, prepared.cart, prepared.listingText);
  return ctx.queue(PACKET_QUEUE_KEY, () =>
    decideAndRecord(ctx, { run, logId: sealed.logId, cart: prepared.cart, judge, checkout: request.checkout ?? "none" }),
  );
}
