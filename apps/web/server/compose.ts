// Composition root of the booth server (Node only): settings -> keys, judge, planner factory, catalogue, scenario table,
// log store, orchestrator factory -> OrchestratorBackend -> Hono app + SSE hub + tick timer. Every dependency can be
// replaced for tests (clock, store, rail randomness, orchestrator, judge). Laya being down never stops the start: the
// judge then answers ERROR and the engine escalates (R10.unavailable, I5), and /api/info says so.
import { join } from "node:path";
import { createJudgeFromEnv, isWarmable, JudgeConfigError } from "@laisee/agent/judge";
import { createPlanner, loadReplayRecords } from "@laisee/agent/planner";
import { engine as defaultEngine } from "@laisee/core/engine";
import type { PlannerReplayRecord } from "@laisee/core/generated";
import { appendEntry } from "@laisee/core/log";
import { FileLogStore } from "@laisee/core/log/file";
import { createOrchestrator as realOrchestrator, type Orchestrator, type OrchestratorDeps, type PlannerFactory } from "@laisee/core/orchestrator";
import type { Clock, JudgePort, LogStore } from "@laisee/core/ports";
import { cryptoRandom, type RandomSource } from "@laisee/rail-sim";
import type { Hono } from "hono";
import { OrchestratorBackend } from "../src/booth/backend/backend";
import { scameterLookup } from "../src/booth/backend/catalogue";
import { randomId, SYSTEM_CLOCK } from "../src/booth/backend/ids";
import { buildInfo, type JudgeHealth } from "../src/booth/backend/info";
import { replayPlannerFactory } from "../src/booth/backend/planner";
import type { ScenarioTable } from "../src/booth/backend/scenarioTable";
import type { SessionDeps } from "../src/booth/backend/session";
import { m0Request } from "../src/booth/compile";
import { createHttpApp } from "./app";
import { loadCatalogue } from "./booth/catalogue";
import { loadDemoKeys, type DemoKeys } from "./booth/keys";
import { loadScenarioTable } from "./booth/scenarioTable";
import { settingsFromEnv, type BoothSettings, type Env } from "./booth/settings";
import { SILENT_LOGGER, type Logger } from "./http/routes";
import { SseHub } from "./http/sse";

export { randomId } from "../src/booth/backend/ids";

/** The brief: tick every second (R11 windows [F31] are 60 s, card TTL [F30] 30 min). */
export const TICK_MS = 1_000;
/** The brief: SSE keep-alive comment every 15 s. */
export const KEEP_ALIVE_MS = 15_000;
/** ASSUMED: SSE chunks a client may lag behind before it is dropped (a run is a few dozen events). */
export const SSE_MAX_QUEUED = 1_024;
/** ASSUMED: warm-up deadline. The first call after a Laya restart took 2,568 ms [F26]; this leaves room for a busy server. */
export const WARM_UP_TIMEOUT_MS = 10_000;

export interface ComposeOptions {
  readonly env: Env;
  readonly clock?: Clock;
  readonly store?: LogStore;
  readonly railRandom?: () => RandomSource;
  readonly createOrchestrator?: (deps: OrchestratorDeps) => Orchestrator;
  readonly judge?: JudgePort;
  readonly logger?: Logger;
  /** Registered after the API routes (static files in production). */
  readonly extraRoutes?: (app: Hono) => void;
  /** Tick timer interval; null = no timer (tests tick by hand). */
  readonly tickMs?: number | null;
  /** Call judge.warmUp at start when the judge supports it. Default true. */
  readonly warmUp?: boolean;
  /** Override key loading (tests). */
  readonly keys?: () => DemoKeys;
}

export interface Booth {
  readonly app: Hono;
  readonly hub: SseHub;
  readonly backend: OrchestratorBackend;
  readonly settings: BoothSettings;
  /** Seals M0 and starts the tick timer and the judge warm-up. */
  start(): Promise<void>;
  close(): Promise<void>;
}

function plannerFactory(settings: BoothSettings, table: ScenarioTable): PlannerFactory {
  if (settings.plannerProvider === "rule") return (listings) => createPlanner({ provider: "rule", catalogue: listings, layaUrl: settings.layaUrl });
  const records: readonly PlannerReplayRecord[] = [
    ...loadReplayRecords(join(settings.fixturesDir, "planner")),
    ...loadReplayRecords(join(settings.scenariosDir, "planner")),
  ];
  return replayPlannerFactory(records, table);
}

function makeJudge(opts: ComposeOptions, settings: BoothSettings): JudgePort {
  if (opts.judge !== undefined) return opts.judge;
  try {
    return createJudgeFromEnv(settings.judgeEnv);
  } catch (err) {
    if (err instanceof JudgeConfigError) throw new Error(`judge configuration: ${err.message}`, { cause: err });
    throw err;
  }
}

export function composeBooth(opts: ComposeOptions): Booth {
  const settings = settingsFromEnv(opts.env);
  const logger = opts.logger ?? SILENT_LOGGER;
  const clock = opts.clock ?? SYSTEM_CLOCK;
  const table = loadScenarioTable(join(settings.scenariosDir, "booth.json"));
  const catalogue = loadCatalogue(settings.fixturesDir, table);
  const judge = makeJudge(opts, settings);
  const planner = plannerFactory(settings, table);
  const store = opts.store ?? new FileLogStore(settings.logDir);
  const loadKeys = opts.keys ?? (() => loadDemoKeys(settings.keyDir));
  let keys = loadKeys();
  let health: JudgeHealth = { state: isWarmable(judge) ? "warming" : "not_applicable" };
  const sessionDeps = (): SessionDeps => {
    try {
      keys = loadKeys();
    } catch (err) {
      logger.error(`keys: ${err instanceof Error ? err.message : "unreadable"}; keeping the keys in use`);
    }
    return {
      engine: defaultEngine,
      judge,
      planner,
      store,
      appendEntry,
      engineSigner: keys.engine,
      delegator: keys.delegator,
      clock,
      scameter: scameterLookup(catalogue, clock),
      random: opts.railRandom ?? cryptoRandom,
      newId: (prefix) => randomId(prefix),
      createOrchestrator: opts.createOrchestrator ?? realOrchestrator,
    };
  };
  const backend = new OrchestratorBackend({
    sessionDeps,
    catalogue,
    table,
    plannerProvider: settings.plannerProvider,
    info: () => buildInfo({ settings, judgeProvider: judge.provider, health, keySource: keys.source }),
    presetSeal: (now) => m0Request(now),
    logger,
  });
  const hub = new SseHub({ keepAliveMs: KEEP_ALIVE_MS, maxQueuedChunks: SSE_MAX_QUEUED });
  const off = backend.subscribe((event) => hub.publish(event));
  const app = createHttpApp({ backend: () => backend, hub, logger, ...(opts.extraRoutes === undefined ? {} : { extraRoutes: opts.extraRoutes }) });
  let timer: ReturnType<typeof setInterval> | null = null;

  async function warmUp(): Promise<void> {
    if (!isWarmable(judge) || opts.warmUp === false) return;
    const result = await judge.warmUp({ timeoutMs: WARM_UP_TIMEOUT_MS });
    health = result.ok ? { state: "ready", latencyMs: result.latencyMs } : { state: "down", latencyMs: result.latencyMs };
    logger.info(`judge warm-up: ${result.ok ? "ok" : "FAILED (decisions will ESCALATE R10.unavailable)"} in ${Math.round(result.latencyMs)} ms`);
  }

  return {
    app,
    hub,
    backend,
    settings,
    async start() {
      // A failed preset seal is logged, not fatal: the API stays up and the UI seals M0 itself (never a blank screen).
      await backend.start().catch((err: unknown) => logger.error(`could not seal the preset mandate at start: ${err instanceof Error ? err.message : "unknown error"}`));
      const tickMs = opts.tickMs === undefined ? TICK_MS : opts.tickMs;
      if (tickMs !== null) {
        timer = setInterval(() => void backend.tick(), tickMs);
        timer.unref?.();
      }
      void warmUp();
    },
    async close() {
      if (timer !== null) clearInterval(timer);
      off();
      backend.close();
      hub.close();
    },
  };
}
