// Which ApiClient the page runs on. `?api=local` or VITE_API=local forces on-device mode (no network call at all).
// Otherwise the page asks the booth server for /api/info and uses it when it answers as the server (live mode: Laya
// judge, Qwen or rule planner). No answer, a static host, a timeout or an odd answer: on-device mode, with a visible
// note. The mock is a UI-test double only: the page never falls back to it, and runs it only for ?api=mock.
import { HttpApiClient } from "../http/HttpApiClient";
import type { ApiClient } from "../types";
import { LocalApiClient } from "./LocalApiClient";

/** How long the start-up probe of /api/info may take before the page runs on its own (UI only, ASSUMED). */
export const PROBE_TIMEOUT_MS = 1_500;

export type Selection =
  | { readonly kind: "http"; readonly reason: "server" }
  | { readonly kind: "local"; readonly reason: "forced" | "no-server" };

export interface SelectDeps {
  /** window.location.search */
  readonly search: string;
  /** import.meta.env.VITE_API */
  readonly env: string | undefined;
  /** Parsed JSON of GET /api/info, or null when the answer was not OK; may throw. */
  readonly probe: () => Promise<unknown>;
}

export function localForced(search: string, env: string | undefined): boolean {
  const fromQuery = new URLSearchParams(search).get("api");
  return fromQuery === "local" || (fromQuery === null && env === "local");
}

const isServerInfo = (info: unknown): boolean => info !== null && typeof info === "object" && (info as { readonly kind?: unknown }).kind === "http";

export async function selectApi(deps: SelectDeps): Promise<Selection> {
  if (localForced(deps.search, deps.env)) return { kind: "local", reason: "forced" };
  try {
    if (isServerInfo(await deps.probe())) return { kind: "http", reason: "server" };
  } catch {
    // No server (static hosting, offline, vite dev alone): run on the device below.
  }
  return { kind: "local", reason: "no-server" };
}

/** GET /api/info on this origin within the probe deadline. */
export async function probeInfo(): Promise<unknown> {
  const res = await fetch("/api/info", { headers: { accept: "application/json" }, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
  return res.ok ? ((await res.json()) as unknown) : null;
}

/** How often the test double sweeps escalations that ran out of time (UI only, ASSUMED). */
export const MOCK_SWEEP_EVERY_MS = 1_000;

/** `?api=mock` is for tests and demos of the screens alone: the instant UI double, with no network call at all (not even the probe). */
export function mockForced(search: string): boolean {
  return new URLSearchParams(search).get("api") === "mock";
}

/** The client for this page load, and whether the on-device note should show. */
export async function pickClient(): Promise<{ readonly api: ApiClient; readonly onDevice: boolean }> {
  if (mockForced(window.location.search)) {
    // Loaded only on request: the booth build never carries the double in its first chunk.
    const { MockApiClient } = await import("../MockApiClient");
    return { api: new MockApiClient({ sweepEveryMs: MOCK_SWEEP_EVERY_MS }), onDevice: false };
  }
  const env: unknown = import.meta.env["VITE_API"];
  const choice = await selectApi({ search: window.location.search, env: typeof env === "string" ? env : undefined, probe: probeInfo });
  return choice.kind === "http" ? { api: new HttpApiClient(), onDevice: false } : { api: new LocalApiClient(), onDevice: true };
}
