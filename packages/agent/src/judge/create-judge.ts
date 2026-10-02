// Composition from the environment (docs/02 section 15): JUDGE_PROVIDER laya | jev | replay, JUDGE_MODE
// shadow | enforce, LAYA_BASE_URL, LAYA_MODEL, JEV_BASE_URL, JEV_MODEL and the Jev key. Bad configuration is
// reported once, at composition time. There is no automatic failover between providers: a failed judge is an
// ERROR record and R10 escalates it. Switching to replay is a deliberate, labelled operator choice.
import type { JudgeProvider } from "@laisee/core/generated";
import type { JudgePort } from "@laisee/core/ports";
import { DEFAULT_JEV_BASE_URL, DEFAULT_JEV_MODEL, DEFAULT_LAYA_BASE_URL, DEFAULT_LAYA_MODEL } from "./config";
import type { DiagnosticSink } from "./diagnostics";
import type { FetchLike } from "./http";
import { ReplayJudge } from "./replay-judge";
import { loadReplayRecordings, type ReplayRecording } from "./replay-recordings";
import { ShadowJudge } from "./shadow-judge";
import { SystemOneJudge } from "./system-one-judge";
import { DEFAULT_WINDOWING } from "./windows";

export type JudgeMode = "shadow" | "enforce";
export type JudgeEnv = Readonly<Record<string, string | undefined>>;

export interface JudgeSettings {
  readonly provider: JudgeProvider;
  readonly mode: JudgeMode;
  /** Empty for replay. */
  readonly baseUrl: string;
  /** Empty for replay. */
  readonly model: string;
  readonly apiKey?: string;
}

export type SettingsResult = { readonly ok: true; readonly settings: JudgeSettings } | { readonly ok: false; readonly error: string };

export class JudgeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JudgeConfigError";
  }
}

const PROVIDERS: readonly JudgeProvider[] = ["laya", "jev", "replay"];
const MODES: readonly JudgeMode[] = ["shadow", "enforce"];
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

const fail = (error: string): SettingsResult => ({ ok: false, error });

function read(env: JudgeEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value === undefined || value === "" ? undefined : value;
}

const isLoopback = (url: URL): boolean => LOOPBACK_HOSTS.has(url.hostname) || url.hostname.endsWith(".localhost");

function parseUrl(name: string, value: string): URL | string {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : `${name} must be an http or https URL`;
  } catch {
    return `${name} is not a valid URL`;
  }
}

function layaSettings(env: JudgeEnv, mode: JudgeMode): SettingsResult {
  const baseUrl = read(env, "LAYA_BASE_URL") ?? DEFAULT_LAYA_BASE_URL;
  const url = parseUrl("LAYA_BASE_URL", baseUrl);
  if (typeof url === "string") return fail(url);
  if (!isLoopback(url) && read(env, "LAYA_ALLOW_REMOTE") !== "1") {
    return fail("LAYA_BASE_URL is not a loopback address: listing text would leave this machine. Set LAYA_ALLOW_REMOTE=1 to allow it");
  }
  const apiKey = read(env, "LAYA_API_KEY");
  return { ok: true, settings: { provider: "laya", mode, baseUrl, model: read(env, "LAYA_MODEL") ?? DEFAULT_LAYA_MODEL, ...(apiKey === undefined ? {} : { apiKey }) } };
}

function jevSettings(env: JudgeEnv, mode: JudgeMode): SettingsResult {
  const apiKey = read(env, "TYPESAFE_API_KEY");
  if (apiKey === undefined) return fail("JUDGE_PROVIDER=jev needs TYPESAFE_API_KEY");
  const baseUrl = read(env, "JEV_BASE_URL") ?? DEFAULT_JEV_BASE_URL;
  const url = parseUrl("JEV_BASE_URL", baseUrl);
  if (typeof url === "string") return fail(url);
  if (url.protocol !== "https:" && !isLoopback(url)) return fail("JEV_BASE_URL must use https: the API key is sent as a Bearer header");
  return { ok: true, settings: { provider: "jev", mode, baseUrl, model: read(env, "JEV_MODEL") ?? DEFAULT_JEV_MODEL, apiKey } };
}

export function parseJudgeEnv(env: JudgeEnv): SettingsResult {
  const provider = read(env, "JUDGE_PROVIDER") ?? "laya";
  if (!PROVIDERS.includes(provider as JudgeProvider)) return fail(`JUDGE_PROVIDER must be one of ${PROVIDERS.join(", ")}`);
  const mode = read(env, "JUDGE_MODE") ?? "shadow";
  if (!MODES.includes(mode as JudgeMode)) return fail(`JUDGE_MODE must be one of ${MODES.join(", ")}`);
  if (provider === "replay") return { ok: true, settings: { provider: "replay", mode: mode as JudgeMode, baseUrl: "", model: "" } };
  return provider === "jev" ? jevSettings(env, mode as JudgeMode) : layaSettings(env, mode as JudgeMode);
}

export interface CreateJudgeDeps {
  readonly fetchImpl?: FetchLike | undefined;
  readonly onDiagnostic?: DiagnosticSink | undefined;
  /** Replay only: recordings to serve. Default: data/fixtures/judge. */
  readonly recordings?: readonly ReplayRecording[] | undefined;
  /** Stretch, default off: judge long listings in overlapping windows instead of failing closed (windows.ts). */
  readonly windowing?: boolean | undefined;
}

export function createJudge(settings: JudgeSettings, deps: CreateJudgeDeps = {}): JudgePort {
  const inner: JudgePort =
    settings.provider === "replay"
      ? new ReplayJudge({ recordings: deps.recordings ?? loadReplayRecordings(), onDiagnostic: deps.onDiagnostic })
      : new SystemOneJudge({
          provider: settings.provider,
          baseUrl: settings.baseUrl,
          model: settings.model,
          apiKey: settings.apiKey,
          windowing: deps.windowing === true ? DEFAULT_WINDOWING : false,
          fetchImpl: deps.fetchImpl,
          onDiagnostic: deps.onDiagnostic,
        });
  return settings.mode === "shadow" ? new ShadowJudge(inner) : inner;
}

/** Throws JudgeConfigError on bad configuration. assess never throws once the judge exists. */
export function createJudgeFromEnv(env: JudgeEnv = process.env, deps: CreateJudgeDeps = {}): JudgePort {
  const parsed = parseJudgeEnv(env);
  if (!parsed.ok) throw new JudgeConfigError(parsed.error);
  return createJudge(parsed.settings, deps);
}
