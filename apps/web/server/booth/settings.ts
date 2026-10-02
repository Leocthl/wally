// Server settings from the environment (docs/02 section 15 names, .env.example). Every value is validated here, once;
// a bad value stops the start with a clear message. JUDGE_MODE unset means enforce for the booth (the judge
// package's own default is shadow, which would let a judge outage pass unseen).
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { layaUrlFromEnv, plannerProviderFromEnv } from "@laisee/agent/planner";
import type { JudgeEnv } from "@laisee/agent/judge";

export type Env = Readonly<Record<string, string | undefined>>;

/** Repository root (this file is apps/web/server/booth/settings.ts). */
export const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

export const DEFAULT_PORT = 8787;

export interface BoothSettings {
  readonly port: number;
  readonly keyDir: string;
  readonly logDir: string;
  readonly judgeEnv: JudgeEnv;
  readonly plannerProvider: "rule" | "replay";
  readonly layaUrl: string;
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

export function settingsFromEnv(env: Env): BoothSettings {
  const provider = plannerProviderFromEnv(env);
  if (provider !== "rule" && provider !== "replay") throw new SettingsError(`PLANNER_PROVIDER=${provider} is not built`);
  return {
    port: port(env),
    keyDir: dir(env, "KEY_DIR", ".keys"),
    logDir: dir(env, "LOG_DIR", ".data/logs"),
    judgeEnv: { ...env, JUDGE_MODE: read(env, "JUDGE_MODE") ?? "enforce" },
    plannerProvider: provider,
    layaUrl: layaUrlFromEnv(env),
    fixturesDir: resolve(REPO_ROOT, "data/fixtures"),
    scenariosDir: resolve(REPO_ROOT, "data/scenarios"),
  };
}
