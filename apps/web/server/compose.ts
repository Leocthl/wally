// Composition root of the booth server (Node only): settings -> keys, judge, planner factory, catalogue, scenario table,
// log store, orchestrator factory -> OrchestratorBackend -> Hono app + SSE hub + tick timer. Every dependency can be
// replaced for tests (clock, store, rail randomness, orchestrator, judge). Laya being down never stops the start: the
// judge then answers ERROR and the engine escalates (R10.unavailable, I5), and /api/info says so.
import { join } from "node:path";
import { compileMandateText } from "@laisee/agent/compiler";
import { createJudgeFromEnv, isWarmable, JudgeConfigError } from "@laisee/agent/judge";
import { createChatClient, createPlanner, loadReplayRecords } from "@laisee/agent/planner";
import { engine as defaultEngine } from "@laisee/core/engine";
import type { PlannerReplayRecord } from "@laisee/core/generated";
import { appendEntry } from "@laisee/core/log";
import { FileLogStore } from "@laisee/core/log/file";
import { createOrchestrator as realOrchestrator, type Orchestrator, type OrchestratorDeps, type PlannerFactory } from "@laisee/core/orchestrator";
import type { Clock, JudgePort, LogStore } from "@laisee/core/ports";
import { cryptoRandom, type RandomSource } from "@laisee/rail-sim";
import type { Hono } from "hono";
import { askShelf, recordedRequests, type AskSource } from "../src/booth/backend/ask";
import { OrchestratorBackend } from "../src/booth/backend/backend";
import { scameterLookup, type Catalogue } from "../src/booth/backend/catalogue";
import type { ModelCompile } from "../src/booth/backend/compileRules";
import { randomId, SYSTEM_CLOCK } from "../src/booth/backend/ids";
import { buildInfo, featuresFor, type JudgeHealth, type PlannerChoice } from "../src/booth/backend/info";
import { replayPlannerFactory, withRecordedFallback } from "../src/booth/backend/planner";
import type { ScenarioTable } from "../src/booth/backend/scenarioTable";
import type { SessionDeps } from "../src/booth/backend/session";
import { m0Request } from "../src/booth/compile";
import { createHttpApp } from "./app";
import { loadCatalogue } from "./booth/catalogue";
import { plannerFixtureTexts } from "./booth/fixtureTexts";
import { loadDemoKeys, type DemoKeys } from "./booth/keys";
import { settledChoice } from "./booth/plannerSelect";
import { loadScenarioTable } from "./booth/scenarioTable";
import { settingsFromEnv, type BoothSettings, type Env } from "./booth/settings";
import type { LanOptions } from "./http/lan";
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
  /** The planner chosen at start (selectPlanner). Default: what PLANNER_PROVIDER names, the rule planner when it is unset. */
  readonly planner?: PlannerChoice;
  /** LAN mode (server/lanMode.ts): pairing token and phone rules. Default off: loopback only. */
  readonly lan?: LanOptions;
}

export interface Booth {
  readonly app: Hono;
  readonly hub: SseHub;
  readonly backend: OrchestratorBackend;
  readonly settings: BoothSettings;
  /** The planner in use: chosen by the operator, by the start-up check, or the default. Fixed for the life of the booth. */
  readonly planner: PlannerChoice;
  /** Seals M0 and starts the tick timer and the judge warm-up. */
  start(): Promise<void>;
  close(): Promise<void>;
}

const REPLAY_UNKNOWN_NOTE = "Replay mode only knows the sample requests; start the booth with the local model or Laya for free-form asks.";

function replayRecords(settings: BoothSettings): readonly PlannerReplayRecord[] {
  return [...loadReplayRecords(join(settings.fixturesDir, "planner")), ...loadReplayRecords(join(settings.scenariosDir, "planner"))];
}

function plannerFactory(settings: BoothSettings, choice: PlannerChoice, table: ScenarioTable, records: readonly PlannerReplayRecord[]): PlannerFactory {
  if (choice.provider === "rule") {
    return withRecordedFallback((listings) => createPlanner({ provider: "rule", catalogue: listings, layaUrl: settings.layaUrl }), records, table);
  }
  if (choice.provider === "local") {
    return withRecordedFallback(
      (listings) =>
        createPlanner({ provider: "local", catalogue: listings, localUrl: settings.plannerUrl, localModel: settings.plannerModel, allowRemote: settings.plannerAllowRemote }),
      records,
      table,
    );
  }
  return replayPlannerFactory(records, table);
}

function askSource(settings: BoothSettings, choice: PlannerChoice, catalogue: Catalogue, table: ScenarioTable): AskSource {
  if (choice.provider !== "replay") return { kind: "live", shelf: askShelf(catalogue, table) };
  return { kind: "recorded", requests: recordedRequests(plannerFixtureTexts(settings.fixturesDir, settings.scenariosDir), catalogue, table), unknownNote: REPLAY_UNKNOWN_NOTE };
}

/** The sentence reader on the local Qwen server, only when that is the chosen planner. */
function compileModel(settings: BoothSettings, choice: PlannerChoice): ModelCompile | null {
  if (choice.provider !== "local") return null;
  const client = createChatClient({ baseUrl: settings.plannerUrl, allowRemote: settings.plannerAllowRemote });
  return ({ text, locale, now }) => compileMandateText({ text, locale, now, client, model: settings.plannerModel });
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
  const choice = opts.planner ?? settledChoice(settings);
  const recorded = replayRecords(settings); // the live planners fall back to these for the fixed booth buttons
  const records = choice.provider === "replay" ? recorded : [];
  const planner = plannerFactory(settings, choice, table, recorded);
  const features = featuresFor(choice.provider, records.some((r) => r.scenario.endsWith("-alternative")));
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
    plannerProvider: choice.provider,
    ask: askSource(settings, choice, catalogue, table),
    compileModel: compileModel(settings, choice),
    info: () => buildInfo({ settings, judgeProvider: judge.provider, health, keySource: keys.source, planner: choice, features }),
    presetSeal: (now) => m0Request(now),
    logger,
  });
  const hub = new SseHub({ keepAliveMs: KEEP_ALIVE_MS, maxQueuedChunks: SSE_MAX_QUEUED });
  const off = backend.subscribe((event) => hub.publish(event));
  const app = createHttpApp({
    backend: () => backend,
    hub,
    logger,
    ...(opts.lan === undefined ? {} : { lan: opts.lan }),
    ...(opts.extraRoutes === undefined ? {} : { extraRoutes: opts.extraRoutes }),
  });
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
    planner: choice,
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
