// Planner choice at server start. PLANNER_PROVIDER=auto (the default) picks the best planner that answers right now:
//   local   when the Qwen server's /health answers within PROBE_TIMEOUT_MS
//   rule    otherwise, when Laya's /health answers
//   replay  otherwise (recorded proposals; typed requests that were not recorded are not decided)
// An explicit PLANNER_PROVIDER wins and nothing is probed. The choice is made once, printed at start and shown in
// /api/info; nothing switches during a run or later (a planner that goes down shows as "no proposal", never as a
// quiet change of planner). Loopback only: a remote PLANNER_BASE_URL is probed only when PLANNER_ALLOW_REMOTE=1.
import type { PlannerChoice } from "../../src/booth/backend/info";
import type { BoothSettings } from "./settings";

/** The brief: a local server that does not answer its health check in 1.5 s is treated as down. */
export const PROBE_TIMEOUT_MS = 1_500;

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** Does `${baseUrl}/health` answer 2xx in time? Never throws; a redirect, a bad url or a refused host is "no". */
export type HealthProbe = (baseUrl: string, allowRemote: boolean, timeoutMs: number) => Promise<boolean>;

export const probeHealth: HealthProbe = async (baseUrl, allowRemote, timeoutMs) => {
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (url.username !== "" || url.password !== "") return false;
    if (!allowRemote && !LOOPBACK_HOSTS.has(url.hostname)) return false;
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/health`, { signal: AbortSignal.timeout(timeoutMs), redirect: "error" });
    await res.body?.cancel().catch(() => undefined);
    return res.ok;
  } catch {
    return false;
  }
};

export async function selectPlanner(settings: BoothSettings, probe: HealthProbe = probeHealth): Promise<PlannerChoice> {
  if (!settings.plannerAuto) return settledChoice(settings);
  const [qwen, laya] = await Promise.all([
    probe(settings.plannerUrl, settings.plannerAllowRemote, PROBE_TIMEOUT_MS),
    probe(settings.layaUrl, false, PROBE_TIMEOUT_MS),
  ]);
  const how = "Chosen at start (PLANNER_PROVIDER=auto)";
  if (qwen) return { provider: "local", chosenBy: "auto", detail: `${how}: the local model answered its health check.` };
  if (laya) return { provider: "rule", chosenBy: "auto", detail: `${how}: the local model did not answer, Laya did.` };
  return { provider: "replay", chosenBy: "auto", detail: `${how}: neither the local model nor Laya answered, so recorded proposals are used.` };
}

/** The choice for a caller that did not run the start-up check (tests, programmatic use): what the settings name. */
export function settledChoice(settings: BoothSettings): PlannerChoice {
  return settings.plannerAuto
    ? { provider: settings.plannerProvider, chosenBy: "default", detail: "Default (no start-up check ran): the rule planner on Laya." }
    : { provider: settings.plannerProvider, chosenBy: "env", detail: `Chosen by the operator (PLANNER_PROVIDER=${settings.plannerProvider}).` };
}
