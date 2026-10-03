// Server settings from the environment (docs/02 section 15 names, .env.example). Every value is validated here, once;
// a bad value stops the start with a clear message. JUDGE_MODE unset means enforce for the booth (the judge
// package's own default is shadow, which would let a judge outage pass unseen).
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  layaUrlFromEnv,
  localPlannerAllowRemoteFromEnv,
  localPlannerModelFromEnv,
  localPlannerUrlFromEnv,
  plannerProviderFromEnv,
} from "@wally/agent/planner";
import type { JudgeEnv } from "@wally/agent/judge";
import type { PlannerProvider } from "@wally/core/ports";

export type Env = Readonly<Record<string, string | undefined>>;

/** Repository root (this file is apps/web/server/booth/settings.ts). */
export const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

export const DEFAULT_PORT = 8787;

export interface BoothSettings {
  readonly port: number;
  readonly keyDir: string;
  readonly logDir: string;
  readonly judgeEnv: JudgeEnv;
  /** The provider named by PLANNER_PROVIDER; with plannerAuto, only the placeholder until the start-up check has run. */
  readonly plannerProvider: "rule" | "replay" | "local";
  /** PLANNER_PROVIDER unset or auto: server/booth/plannerSelect.ts picks at start (local, else rule, else replay). */
  readonly plannerAuto: boolean;
  readonly layaUrl: string;
  /** PLANNER_BASE_URL, PLANNER_MODEL, PLANNER_ALLOW_REMOTE: the local Qwen server (planner and sentence compiler). */
  readonly plannerUrl: string;
  readonly plannerModel: string;
  readonly plannerAllowRemote: boolean;
  readonly fixturesDir: string;
  readonly scenariosDir: string;
}

export class SettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingsError";
  }
}

function read(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value === undefined || value === "" ? undefined : value;
}

function dir(env: Env, name: string, fallback: string): string {
  const value = read(env, name) ?? fallback;
  return isAbsolute(value) ? value : resolve(REPO_ROOT, value);
}

function port(env: Env): number {
  const raw = read(env, "PORT");
  if (raw === undefined) return DEFAULT_PORT;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isInteger(value) || value < 1 || value > 65_535) throw new SettingsError(`PORT must be 1-65535, got ${raw}`);
  return value;
}

function built(provider: PlannerProvider): "rule" | "replay" | "local" {
  if (provider === "claude") throw new SettingsError("PLANNER_PROVIDER=claude: no claude backend is built; use rule, replay, local or auto");
  return provider;
}

export function settingsFromEnv(env: Env): BoothSettings {
  const named = read(env, "PLANNER_PROVIDER");
  const auto = named === undefined || named === "auto";
  const provider = auto ? "rule" : built(plannerProviderFromEnv(env)); // an unknown name throws PlannerConfigError
  return {
    port: port(env),
    keyDir: dir(env, "KEY_DIR", ".keys"),
    logDir: dir(env, "LOG_DIR", ".data/logs"),
    judgeEnv: { ...env, JUDGE_MODE: read(env, "JUDGE_MODE") ?? "enforce" },
    plannerProvider: provider,
    plannerAuto: auto,
    layaUrl: layaUrlFromEnv(env),
    plannerUrl: localPlannerUrlFromEnv(env),
    plannerModel: localPlannerModelFromEnv(env),
    plannerAllowRemote: localPlannerAllowRemoteFromEnv(env),
    fixturesDir: resolve(REPO_ROOT, "data/fixtures"),
    scenariosDir: resolve(REPO_ROOT, "data/scenarios"),
  };
}
