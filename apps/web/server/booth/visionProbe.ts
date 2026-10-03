// Does the local Qwen server read pictures? Asked once at start, like the planner choice (plannerSelect.ts): GET /props and
// look for modalities.vision. "model" = the photo entry sends pictures to the model; "palette" = it uses the colour plates
// and the item-type chips only. Nothing switches later: a server that goes down shows as the model not answering (the
// chips still work), never as a quiet change. Loopback only unless PLANNER_ALLOW_REMOTE=1; a redirect or a bad answer is "no".
import type { BoothSettings } from "./settings";

export type SeeMode = "model" | "palette";

/** The same wait as the planner health probe: a server that does not answer in 1.5 s is treated as not reading pictures. */
export const VISION_PROBE_TIMEOUT_MS = 1_500;

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1", "localhost", "[::1]"]);

export async function probeVision(settings: Pick<BoothSettings, "plannerUrl" | "plannerAllowRemote">, timeoutMs: number = VISION_PROBE_TIMEOUT_MS, fetchImpl: typeof fetch = fetch): Promise<SeeMode> {
  try {
    const url = new URL(settings.plannerUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "palette";
    if (url.username !== "" || url.password !== "") return "palette";
    if (!settings.plannerAllowRemote && !LOOPBACK_HOSTS.has(url.hostname)) return "palette";
    const res = await fetchImpl(`${settings.plannerUrl.replace(/\/+$/, "")}/props`, { signal: AbortSignal.timeout(timeoutMs), redirect: "error" });
    if (!res.ok) return "palette";
    const props = (await res.json()) as { modalities?: { vision?: unknown } };
    return props.modalities?.vision === true ? "model" : "palette";
  } catch {
    return "palette";
  }
}
