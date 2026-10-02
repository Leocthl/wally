// PLANNER_PROVIDER selects the backend: rule (default, Laya typed choices) or replay (recorded outputs).
// A claude backend is not built, so asking for it is a start-up error, not a silent fallback.
import type { ListingRecord, PlannerReplayRecord } from "@laisee/core/generated";
import type { PlannerPort, PlannerProvider } from "@laisee/core/ports";
import { DEFAULT_LAYA_URL, PlannerConfigError, type PlannerConfig } from "./config";
import { createReplayPlanner } from "./replay-planner";
import { createRulePlanner } from "./rule-planner";

export const SUPPORTED_PLANNER_PROVIDERS: readonly PlannerProvider[] = ["rule", "replay"];
export const DEFAULT_PROVIDER: PlannerProvider = "rule";

type Env = Readonly<Record<string, string | undefined>>;

/** Reads PLANNER_PROVIDER (default rule). Unknown or unbuilt names throw PlannerConfigError. */
export function plannerProviderFromEnv(env: Env): PlannerProvider {
  const raw = env["PLANNER_PROVIDER"]?.trim();
  if (raw === undefined || raw === "") return DEFAULT_PROVIDER;
  if (raw === "claude") throw new PlannerConfigError("PLANNER_PROVIDER=claude: no claude backend is built; use rule or replay");
  const known = SUPPORTED_PLANNER_PROVIDERS.find((p) => p === raw);
  if (known === undefined) throw new PlannerConfigError(`PLANNER_PROVIDER=${raw} is not one of ${SUPPORTED_PLANNER_PROVIDERS.join(", ")}`);
  return known;
}

/** Reads LAYA_URL (default the local server). The client refuses anything but a loopback host. */
export function layaUrlFromEnv(env: Env): string {
  const raw = env["LAYA_URL"]?.trim();
  return raw === undefined || raw === "" ? DEFAULT_LAYA_URL : raw;
}

export interface CreatePlannerOptions {
  readonly provider: PlannerProvider;
  /** Structured listing records: the rule backend chooses among them; the replay backend maps urls to ids with them. */
  readonly catalogue?: readonly ListingRecord[];
  readonly layaUrl?: string;
  readonly config?: Partial<PlannerConfig>;
  /** Replay backend: recorded outputs, a fixed scenario id and optional recorded requests. */
  readonly records?: readonly PlannerReplayRecord[];
  readonly scenario?: string;
  readonly requestsByScenario?: Readonly<Record<string, string>>;
}

export function createPlanner(options: CreatePlannerOptions): PlannerPort {
  if (options.provider === "rule") {
    return createRulePlanner({
      catalogue: options.catalogue ?? [],
      ...(options.layaUrl === undefined ? {} : { layaUrl: options.layaUrl }),
      ...(options.config === undefined ? {} : { config: options.config }),
    });
  }
  if (options.provider === "replay") {
    return createReplayPlanner({
      records: options.records ?? [],
      ...(options.catalogue === undefined ? {} : { catalogue: options.catalogue }),
      ...(options.scenario === undefined ? {} : { scenario: options.scenario }),
      ...(options.requestsByScenario === undefined ? {} : { requestsByScenario: options.requestsByScenario }),
    });
  }
  throw new PlannerConfigError(`planner provider ${options.provider} is not built; use rule or replay`);
}
