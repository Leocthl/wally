// Composition root of on-device mode (browser): the bundled data -> replay judge and planner, the real engine and
// orchestrator, an in-memory log, a SIMULATED rail, keys made in this page -> the same OrchestratorBackend the Node
// server runs. Nothing here reads files or opens a connection.
import { engine } from "@wally/core/engine";
import { appendEntry } from "@wally/core/log";
import { createOrchestrator } from "@wally/core/orchestrator";
import type { Clock } from "@wally/core/ports";
import { MemoryLogStore } from "@wally/core/testing";
import { cryptoRandom, type RandomSource } from "@wally/rail-sim";
import { recordedRequests } from "../../booth/backend/ask";
import { OrchestratorBackend } from "../../booth/backend/backend";
import { scameterLookup } from "../../booth/backend/catalogue";
import { randomId, SYSTEM_CLOCK } from "../../booth/backend/ids";
import { ephemeralKeys, type DemoKeys } from "../../booth/backend/keys";
import { replayPlannerFactory } from "../../booth/backend/planner";
import type { SessionDeps } from "../../booth/backend/session";
import { SILENT_BACKEND_LOGGER, type BackendLogger } from "../../booth/backend/types";
import { m0Request } from "../../booth/compile";
import type { ApiFeatures } from "../types";
import { loadBundle } from "./bundle";
import { LOCAL_JUDGE_OFFLINE_NOTE, LOCAL_KEYS_NOTE, LOCAL_UNKNOWN_REQUEST_NOTE, localInfo } from "./info";
import { LocalReplayJudge } from "./replayJudge";

export interface LocalComposeOptions {
  readonly clock?: Clock;
  /** SIMULATED rail randomness; tests pass seededRandom. */
  readonly railRandom?: () => RandomSource;
  /** Demo keys; default: new ephemeral keys on every reset (nothing is kept between page loads). */
  readonly keys?: () => DemoKeys;
  readonly logger?: BackendLogger;
  /** Overrides for ApiInfo.features (a flag turned off hides the feature and the backend refuses it). */
  readonly features?: Partial<ApiFeatures>;
}

export function composeLocalBackend(opts: LocalComposeOptions = {}): OrchestratorBackend {
  const bundle = loadBundle();
  const clock = opts.clock ?? SYSTEM_CLOCK;
  const judge = new LocalReplayJudge({ recordings: [...bundle.judgeRecordings, ...bundle.shopRecordings] });
  const planner = replayPlannerFactory(bundle.plannerRecords, bundle.table);
  const makeKeys = opts.keys ?? ephemeralKeys;
  const sessionDeps = (): SessionDeps => {
    const keys = makeKeys();
    return {
      engine,
      judge,
      planner,
      // One in-memory log per session: the log id comes from the mandate id, so sessions never share a log.
      store: new MemoryLogStore(),
      appendEntry,
      engineSigner: keys.engine,
      delegator: keys.delegator,
      clock,
      scameter: scameterLookup(bundle.catalogue, clock),
      random: opts.railRandom ?? cryptoRandom,
      newId: (prefix) => randomId(prefix),
      createOrchestrator,
    };
  };
  return new OrchestratorBackend({
    sessionDeps,
    catalogue: bundle.catalogue,
    table: bundle.table,
    plannerProvider: "replay",
    ask: { kind: "recorded", requests: recordedRequests(bundle.plannerTexts, bundle.catalogue, bundle.table), unknownNote: LOCAL_UNKNOWN_REQUEST_NOTE },
    compileModel: null, // no model runs on the device: sentences are read by the fixed rules parser
    info: () => {
      const info = localInfo(bundle.plannerRecords.some((r) => r.scenario.endsWith("-alternative")), bundle.catalogue.shop.size > 0);
      return opts.features === undefined ? info : { ...info, features: { ...info.features, ...opts.features } };
    },
    presetSeal: (now) => m0Request(now),
    logger: opts.logger ?? SILENT_BACKEND_LOGGER,
    judgeOfflineNote: LOCAL_JUDGE_OFFLINE_NOTE,
    keysNote: LOCAL_KEYS_NOTE,
  });
}
