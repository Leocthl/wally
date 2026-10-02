// PLANNER_PROVIDER=rule (default): a Laya-driven decision loop inside a deterministic harness.
// PlannerPort: propose and alternatives never throw and return null on any failure (I5). The planner holds
// no keys, no card handle and no log (I4); its only output is a ProposeCartInput without money fields.
import type { ListingRecord } from "@laisee/core/generated";
import type { PlannerContext, PlannerOptions, PlannerPort, PlannerStop, ProposeCartInput } from "@laisee/core/ports";
import { validateListingRecord } from "@laisee/core/schema";
import { resolveCandidates } from "./candidates";
import { DEFAULT_LAYA_URL, PlannerConfigError, resolveConfig, type PlannerConfig } from "./config";
import type { DecisionContext } from "./decisions";
import { createLayaClient, type LayaClient } from "./laya-client";
import { runLoop } from "./loop";
import { createTracer } from "./trace";

export interface RulePlannerOptions {
  /**
   * Structured listing records the planner may choose from, looked up by the url in the context. The
   * composition root passes the same records the cart builder prices from.
   */
  readonly catalogue: readonly ListingRecord[];
  readonly layaUrl?: string;
  readonly config?: Partial<PlannerConfig>;
  /** Tests only: replaces the HTTP client. */
  readonly client?: LayaClient;
}

/** Budget stops the planner replans after (R3, R4). Escalations and judge stops are not budget stops. */
const BUDGET_STOPS: ReadonlySet<string> = new Set(["R3.over_remaining", "R4.over_cap"]);

function indexCatalogue(records: readonly ListingRecord[]): ReadonlyMap<string, ListingRecord> {
  records.forEach((record) => {
    const checked = validateListingRecord(record);
    if (!checked.ok) {
      throw new PlannerConfigError(`planner catalogue: invalid listing record ${record.id}: ${checked.errors.map((e) => `${e.path} ${e.message}`).join("; ")}`);
    }
  });
  const byUrl = new Map(records.map((r) => [r.url, r] as const));
  const clash = records.find((r) => byUrl.get(r.url)?.id !== r.id);
  if (clash !== undefined) throw new PlannerConfigError(`planner catalogue: two listing records share the same url ${clash.url}`);
  return byUrl;
}

function validTimeout(opts: PlannerOptions): boolean {
  return Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0;
}

export function createRulePlanner(options: RulePlannerOptions): PlannerPort {
  const catalogue = indexCatalogue(options.catalogue);
  const config = resolveConfig(options.config);
  const client = options.client ?? createLayaClient({ baseUrl: options.layaUrl ?? DEFAULT_LAYA_URL });

  async function run(ctx: PlannerContext, opts: PlannerOptions, budgetMinor: number | null): Promise<ProposeCartInput | null> {
    try {
      const request = typeof ctx.intentText === "string" ? ctx.intentText.trim() : "";
      if (request === "" || request.length > config.maxRequestChars || !validTimeout(opts)) return null;
      const candidates = resolveCandidates(Array.isArray(ctx.listings) ? ctx.listings : [], catalogue);
      const deadline = performance.now() + opts.timeoutMs;
      const decisionContext: DecisionContext = {
        client,
        config,
        request,
        tracer: createTracer(opts.onTrace),
        remainingMs: () => deadline - performance.now(),
      };
      return await runLoop(decisionContext, candidates, budgetMinor);
    } catch {
      return null; // never throws: an unexpected fault is no proposal
    }
  }

  return {
    propose: (ctx, opts) => run(ctx, opts, null),
    alternatives: (ctx: PlannerContext, stop: PlannerStop, opts: PlannerOptions) => {
      try {
        const budgetStop = BUDGET_STOPS.has(stop.templateId) && Number.isInteger(stop.remainingMinor) && stop.remainingMinor >= 0;
        return budgetStop ? run(ctx, opts, stop.remainingMinor) : Promise.resolve(null);
      } catch {
        return Promise.resolve(null); // never throws
      }
    },
  };
}
