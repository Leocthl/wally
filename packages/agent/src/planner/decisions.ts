// The three typed decisions. Each asks Laya one rotation-averaged choice, reports it through the tracer and
// applies the abstention rule. An abstention or failure is a value; the loop turns it into null.
import { slugify, type ItemFamily, type PlannerCandidate } from "./candidates";
import { hasEvidence } from "./evidence";
import type { PlannerConfig } from "./config";
import type { LayaClient } from "./laya-client";
import { matchingVariants } from "./variants";
import { NEXT_ACTION, NONE_LABEL, actionQuestion, itemQuestion, pruneFamilies, variantLabel, variantQuestion } from "./questions";
import type { Question } from "./questions";
import type { Tracer } from "./trace";

export interface DecisionContext {
  readonly client: LayaClient;
  readonly config: PlannerConfig;
  readonly request: string;
  readonly tracer: Tracer;
  /** Milliseconds left of the total planner timeout; a call with none left fails closed. */
  readonly remainingMs: () => number;
}

export type Decision<T> =
  | { readonly kind: "chosen"; readonly value: T }
  | { readonly kind: "abstain"; readonly reason: string };

const abstain = (reason: string): Decision<never> => ({ kind: "abstain", reason });

/** Asks one choice question and applies: step cap, Laya failure, none option, top-two margin. */
async function ask<T>(ctx: DecisionContext, question: Question<T>): Promise<Decision<T>> {
  if (ctx.tracer.count() >= ctx.config.stepCap) return abstain("step cap reached");
  const res = await ctx.client.choose(question.spec, ctx.remainingMs());
  if (!res.ok) return abstain(res.reason);
  const { choice, probabilities, margin } = res.value;
  ctx.tracer.emit(question.spec.id, choice, probabilities, margin);
  if (choice === NONE_LABEL) return abstain(`${question.spec.id}: no option fits the request`);
  if (margin < ctx.config.marginThreshold) return abstain(`${question.spec.id}: margin ${margin} is below the threshold`);
  const option = question.options.find((o) => o.label === choice);
  return option === undefined ? abstain(`${question.spec.id}: unknown label ${choice}`) : { kind: "chosen", value: option.value };
}

/**
 * Which item. Code decides what it can: no item named by the request means no proposal, one named item is
 * taken as is, and only a real choice between items the request names goes to Laya. After a budget stop
 * (`substitute`) the request may name none of the cheaper items; then Laya ranks them all and the margin
 * decides.
 */
export async function decideItem(ctx: DecisionContext, families: readonly ItemFamily[], substitute: boolean): Promise<Decision<ItemFamily>> {
  const named = families.filter((f) => hasEvidence(ctx.request, f));
  const pool = named.length > 0 ? named : substitute ? families : [];
  const [only, ...others] = pool;
  if (only === undefined || (others.length === 0 && named.length === 0)) {
    ctx.tracer.emitForced("item_forced", NONE_LABEL);
    return abstain("no listed item is named in the request");
  }
  if (others.length === 0) {
    ctx.tracer.emitForced("item_forced", slugify(only.baseName));
    return { kind: "chosen", value: only };
  }
  const kept = pruneFamilies(ctx.request, pool, ctx.config.maxOptions);
  return ask(ctx, itemQuestion(ctx.request, kept, named.length === 0));
}

export interface VariantChoice {
  readonly candidate: PlannerCandidate;
  /** What the variant step tells the action question. */
  readonly note: string;
}

/** Size and colour stated in the request filter first; Laya only breaks a tie among what is left. */
export async function decideVariant(ctx: DecisionContext, family: ItemFamily): Promise<Decision<VariantChoice>> {
  const [only, ...others] = family.variants;
  if (only !== undefined && others.length === 0) return { kind: "chosen", value: { candidate: only, note: "the item has one variant" } };
  const matching = matchingVariants(ctx.request, family.variants);
  const [first, ...rest] = matching;
  if (first === undefined) {
    ctx.tracer.emitForced(`${NEXT_ACTION}_forced`, "ask_shopper");
    return abstain("the requested size or colour is not listed");
  }
  if (rest.length === 0) {
    ctx.tracer.emitForced("variant_forced", variantLabel(first));
    return { kind: "chosen", value: { candidate: first, note: "the variant matches the request" } };
  }
  const picked = await ask(ctx, variantQuestion(ctx.request, matching.slice(0, ctx.config.maxOptions)));
  return picked.kind === "chosen" ? { kind: "chosen", value: { candidate: picked.value, note: "the variant matches the request" } } : picked;
}

/** Laya may veto (ask the shopper, give up) with a clear margin; it can never push the planner into proposing. */
export async function decideAction(ctx: DecisionContext, candidate: PlannerCandidate, variantNote: string): Promise<Decision<"propose">> {
  if (ctx.tracer.count() >= ctx.config.stepCap) return abstain("step cap reached");
  const spec = actionQuestion(ctx.request, candidate.baseName, variantNote);
  const res = await ctx.client.choose(spec, ctx.remainingMs());
  if (!res.ok) return abstain(res.reason);
  const { choice, probabilities, margin } = res.value;
  ctx.tracer.emit(NEXT_ACTION, choice, probabilities, margin);
  const vetoed = (choice === "ask_shopper" || choice === "give_up") && margin >= ctx.config.marginThreshold;
  return vetoed ? abstain(`${NEXT_ACTION}: ${choice}`) : { kind: "chosen", value: "propose" };
}
