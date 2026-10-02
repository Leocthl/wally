// PLANNER_PROVIDER selects the backend: rule (default, Laya typed choices), replay (recorded outputs) or local
// (one grammar-constrained answer from the local Qwen server, lane m-qwen). A claude backend is not built, so
// asking for it is a start-up error, not a silent fallback.
import type { ListingRecord, PlannerReplayRecord } from "@laisee/core/generated";
import type { PlannerPort, PlannerProvider } from "@laisee/core/ports";
import { DEFAULT_LAYA_URL, PlannerConfigError, type PlannerConfig } from "./config";
import { createLocalPlanner, DEFAULT_LOCAL_MODEL, DEFAULT_LOCAL_PLANNER_URL, type LocalPlannerConfig } from "./local";
import { createReplayPlanner } from "./replay-planner";
import { createRulePlanner } from "./rule-planner";

export const SUPPORTED_PLANNER_PROVIDERS: readonly PlannerProvider[] = ["rule", "replay", "local"];
export const DEFAULT_PROVIDER: PlannerProvider = "rule";

type Env = Readonly<Record<string, string | undefined>>;

/** Reads PLANNER_PROVIDER (default rule). Unknown or unbuilt names throw PlannerConfigError. */
export function plannerProviderFromEnv(env: Env): PlannerProvider {
  const raw = env["PLANNER_PROVIDER"]?.trim();
  if (raw === undefined || raw === "") return DEFAULT_PROVIDER;
  if (raw === "claude") throw new PlannerConfigError("PLANNER_PROVIDER=claude: no claude backend is built; use rule, replay or local");
  const known = SUPPORTED_PLANNER_PROVIDERS.find((p) => p === raw);
  if (known === undefined) throw new PlannerConfigError(`PLANNER_PROVIDER=${raw} is not one of ${SUPPORTED_PLANNER_PROVIDERS.join(", ")}`);
  return known;
}

/** Reads LAYA_BASE_URL (the judge's name), then the older LAYA_URL; default the local server. The client refuses anything but a loopback host. */
export function layaUrlFromEnv(env: Env): string {
  const raw = [env["LAYA_BASE_URL"], env["LAYA_URL"]].map((v) => v?.trim()).find((v) => v !== undefined && v !== "");
  return raw ?? DEFAULT_LAYA_URL;
}

const present = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
};

/** Reads PLANNER_BASE_URL (the local Qwen server), default services/qwen on 127.0.0.1:8809. Loopback only unless allowed. */
export function localPlannerUrlFromEnv(env: Env): string {
  return present(env["PLANNER_BASE_URL"]) ?? DEFAULT_LOCAL_PLANNER_URL;
}

/** Reads PLANNER_MODEL, default the chosen local model alias (planner/local/config.ts). */
export function localPlannerModelFromEnv(env: Env): string {
  return present(env["PLANNER_MODEL"]) ?? DEFAULT_LOCAL_MODEL;
}

/** PLANNER_ALLOW_REMOTE=1 lets PLANNER_BASE_URL name a non-loopback host (the request then leaves this Mac). */
export function localPlannerAllowRemoteFromEnv(env: Env): boolean {
  return present(env["PLANNER_ALLOW_REMOTE"]) === "1";
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
  /** Local backend: PLANNER_BASE_URL, PLANNER_MODEL, PLANNER_ALLOW_REMOTE and config overrides. */
  readonly localUrl?: string;
  readonly localModel?: string;
  readonly allowRemote?: boolean;
  readonly localConfig?: Partial<LocalPlannerConfig>;
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
  if (options.provider === "local") {
    return createLocalPlanner({
      catalogue: options.catalogue ?? [],
      ...(options.localUrl === undefined ? {} : { baseUrl: options.localUrl }),
      ...(options.localModel === undefined ? {} : { model: options.localModel }),
      ...(options.allowRemote === undefined ? {} : { allowRemote: options.allowRemote }),
      ...(options.localConfig === undefined ? {} : { config: options.localConfig }),
    });
  }
  throw new PlannerConfigError(`planner provider ${options.provider} is not built; use rule, replay or local`);
}
