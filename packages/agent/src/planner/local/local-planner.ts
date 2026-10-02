// PLANNER_PROVIDER=local: one grammar-constrained completion from the local Qwen server (services/qwen) reads
// the shopper request, in English, Chinese or Cantonese, and names a listed item and a quantity. Code checks
// everything after it: listing and titles from the records supplied, quantity bounds, stated English facts, the
// budget after a stop. The model never gates a decision; its answer is untrusted input like any planner output.
// PlannerPort: never throws, null on any failure (I5). No keys, no card material, no log, no rail (I4).
import type { ListingRecord } from "@laisee/core/generated";
import type { PlannerContext, PlannerOptions, PlannerPort, PlannerStop, ProposeCartInput } from "@laisee/core/ports";
import { validateListingRecord } from "@laisee/core/schema";
import { PlannerConfigError } from "../config";
import { buildAnswerSchema, parseAnswer, toProposal, totalMinor, type PlanAnswer } from "./answer";
import { createChatClient, type ChatClient, type ChatTimings, type ChatUsage } from "./client";
import { DEFAULT_LOCAL_MODEL, DEFAULT_LOCAL_PLANNER_URL, resolveLocalConfig, type LocalPlannerConfig } from "./config";
import { factCheck } from "./facts";
import { buildMessages, normaliseRequest } from "./prompt";
import { emitStep, LOCAL_ALTERNATIVES_QUESTION, LOCAL_PLAN_QUESTION } from "./trace";

export interface LocalPlannerOptions {
  /** Structured listing records the planner may choose from; the same records the cart builder prices from. */
  readonly catalogue: readonly ListingRecord[];
  readonly baseUrl?: string;
  readonly model?: string;
  /** Composition root only, from PLANNER_ALLOW_REMOTE=1: allows a non-loopback base url. */
  readonly allowRemote?: boolean;
  readonly config?: Partial<LocalPlannerConfig>;
  /** Tests only: replaces the HTTP client. */
  readonly client?: ChatClient;
}

export type LocalOutcome = "proposed" | "ask_shopper" | "give_up" | "no_candidates" | "invalid_input" | "model_failed" | "invalid_answer" | "rejected";

/** Everything one planner call saw and decided; PlannerPort returns only `proposal`, the evaluation reads the rest. */
export interface LocalPlanResult {
  readonly proposal: ProposeCartInput | null;
  readonly outcome: LocalOutcome;
  readonly reason: string;
  readonly answer: PlanAnswer | null;
  readonly raw: string | null;
  readonly latencyMs: number;
  readonly model: string | null;
  readonly usage: ChatUsage | null;
  readonly timings: ChatTimings | null;
}

export interface LocalPlanRunner {
  readonly propose: (ctx: PlannerContext, opts: PlannerOptions) => Promise<LocalPlanResult>;
  readonly alternatives: (ctx: PlannerContext, stop: PlannerStop, opts: PlannerOptions) => Promise<LocalPlanResult>;
}

/** Budget stops the planner replans after (R3, R4). Escalations and judge stops are not budget stops. */
const BUDGET_STOPS: ReadonlySet<string> = new Set(["R3.over_remaining", "R4.over_cap"]);

function indexCatalogue(records: readonly ListingRecord[]): ReadonlyMap<string, ListingRecord> {
  records.forEach((record) => {
    const checked = validateListingRecord(record);
    if (!checked.ok) throw new PlannerConfigError(`local planner catalogue: invalid listing record ${record.id}`);
  });
  const byUrl = new Map(records.map((r) => [r.url, r] as const));
  const clash = records.find((r) => byUrl.get(r.url)?.id !== r.id);
  if (clash !== undefined) throw new PlannerConfigError(`local planner catalogue: two listing records share the url ${clash.url}`);
  return byUrl;
}

/** Records for the context's urls, in context order, each url once, within the prompt bounds. */
function resolveListings(ctx: PlannerContext, byUrl: ReadonlyMap<string, ListingRecord>, config: LocalPlannerConfig): readonly ListingRecord[] {
  const urls = [...new Set((Array.isArray(ctx.listings) ? ctx.listings : []).map((l) => l.url))];
  const known = urls.flatMap((url) => {
    const record = byUrl.get(url);
    return record === undefined ? [] : [record];
  });
  const bounded = known.slice(0, config.maxListings);
  return bounded.filter((_, i) => bounded.slice(0, i + 1).reduce((n, r) => n + r.items.length, 0) <= config.maxPromptItems);
}

/** After a budget stop: only items whose one-unit order total fits what is left, computed in code. */
function fittingListings(listings: readonly ListingRecord[], remainingMinor: number): readonly ListingRecord[] {
  return listings.flatMap((listing) => {
    const [first, ...rest] = listing.items.filter((i) => i.unit_price_minor + listing.shipping_minor + listing.fees_minor <= remainingMinor);
    return first === undefined ? [] : [{ ...listing, items: [first, ...rest] as ListingRecord["items"] }];
  });
}

const empty = (outcome: LocalOutcome, reason: string): LocalPlanResult => ({
  proposal: null, outcome, reason, answer: null, raw: null, latencyMs: 0, model: null, usage: null, timings: null,
});

export function createLocalPlanRunner(options: LocalPlannerOptions): LocalPlanRunner {
  const byUrl = indexCatalogue(options.catalogue);
  const config = resolveLocalConfig(options.config);
  const model = options.model ?? DEFAULT_LOCAL_MODEL;
  const client = options.client ?? createChatClient({ baseUrl: options.baseUrl ?? DEFAULT_LOCAL_PLANNER_URL, allowRemote: options.allowRemote === true });

  async function plan(ctx: PlannerContext, opts: PlannerOptions, remainingMinor: number | null): Promise<LocalPlanResult> {
    const question = remainingMinor === null ? LOCAL_PLAN_QUESTION : LOCAL_ALTERNATIVES_QUESTION;
    const request = normaliseRequest(typeof ctx.intentText === "string" ? ctx.intentText : "");
    if (request === "" || request.length > config.maxRequestChars) return empty("invalid_input", "the request is empty or longer than the cap");
    if (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs <= 0) return empty("invalid_input", "no time budget");
    const resolved = resolveListings(ctx, byUrl, config);
    const listings = remainingMinor === null ? resolved : fittingListings(resolved, remainingMinor);
    if (listings.length === 0) {
      emitStep(opts.onTrace, `${question}_forced`, "give_up", 0);
      return empty("no_candidates", "no listed item to choose from");
    }
    const messages = buildMessages({
      request, listings, includeListingText: config.includeListingText, maxListingTextChars: config.maxListingTextChars, afterBudgetStop: remainingMinor !== null,
    });
    const schema = buildAnswerSchema(listings, config);
    const res = await client.complete({ model, messages, schemaName: "wally_plan", schema, maxTokens: config.maxTokens, seed: config.seed }, opts.timeoutMs);
    if (!res.ok) {
      emitStep(opts.onTrace, question, "no_answer", res.latencyMs);
      return { ...empty("model_failed", res.reason), latencyMs: res.latencyMs };
    }
    const base = { raw: res.content, latencyMs: res.latencyMs, model: res.model, usage: res.usage, timings: res.timings };
    const answer = parseAnswer(res.content, listings, config);
    if (answer.kind === "invalid") {
      emitStep(opts.onTrace, question, "no_answer", res.latencyMs);
      return { ...base, proposal: null, outcome: "invalid_answer", reason: answer.reason, answer };
    }
    if (answer.kind === "abstain") {
      emitStep(opts.onTrace, question, answer.action, res.latencyMs);
      return { ...base, proposal: null, outcome: answer.action, reason: "the model asked to stop", answer };
    }
    emitStep(opts.onTrace, question, answer.items.map((i) => i.title).join(" + "), res.latencyMs);
    const listing = listings.find((l) => l.url === answer.listingUrl);
    const mismatch = listing === undefined ? "listing missing" : factCheck(request, listing, answer.items);
    const overBudget = listing !== undefined && remainingMinor !== null && totalMinor(listing, answer.items) > remainingMinor;
    const proposal = mismatch === null && !overBudget ? toProposal(answer.listingUrl, answer.items, remainingMinor !== null) : null;
    if (proposal === null) return { ...base, proposal: null, outcome: "rejected", reason: mismatch ?? (overBudget ? "the order does not fit what is left" : "schema check failed"), answer };
    return { ...base, proposal, outcome: "proposed", reason: "ok", answer };
  }

  async function guarded(run: () => Promise<LocalPlanResult>): Promise<LocalPlanResult> {
    try {
      return await run();
    } catch {
      return empty("model_failed", "unexpected error"); // never throws
    }
  }

  return {
    propose: (ctx, opts) => guarded(() => plan(ctx, opts, null)),
    alternatives: (ctx, stop, opts) =>
      guarded(() => {
        const budgetStop = BUDGET_STOPS.has(stop.templateId) && Number.isSafeInteger(stop.remainingMinor) && stop.remainingMinor >= 0;
        return budgetStop ? plan(ctx, opts, stop.remainingMinor) : Promise.resolve(empty("invalid_input", "not a budget stop"));
      }),
  };
}

/** The PlannerPort: proposal or null, nothing else (no payment tool, no key, no log). */
export function createLocalPlanner(options: LocalPlannerOptions): PlannerPort {
  const runner = createLocalPlanRunner(options);
  const proposalOf = async (pending: Promise<LocalPlanResult>): Promise<ProposeCartInput | null> => {
    try {
      return (await pending).proposal;
    } catch {
      return null;
    }
  };
  return {
    propose: (ctx, opts) => proposalOf(runner.propose(ctx, opts)),
    alternatives: (ctx, stop, opts) => proposalOf(runner.alternatives(ctx, stop, opts)),
  };
}
