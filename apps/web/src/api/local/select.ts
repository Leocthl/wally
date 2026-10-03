// Which ApiClient the page runs on. `?api=local` forces on-device mode (no network call at all); so does VITE_API=local,
// except in a native shell that has saved a booth Mac (LAN mode): that address is tried first.
// Otherwise the page asks the booth server for /api/info and uses it when it answers as the server (live mode: Laya
// judge, Qwen or rule planner). No answer, a static host, a timeout, a missing pairing token or an odd answer: on-device
// mode, with a visible note. The mock is a UI-test double only: the page never falls back to it, and runs it only for ?api=mock.
import { browserStores, captureTokenFromUrl, readServer, readToken, sessionAware, TOKEN_HEADER } from "../http/connection";
import { HttpApiClient } from "../http/HttpApiClient";
import { isNative } from "../../pwa/native";
import type { ApiClient } from "../types";
import { PersistentLocalApiClient } from "./persist/PersistentLocalApiClient";

/** How long the start-up probe of /api/info may take before the page runs on its own (UI only, ASSUMED). */
export const PROBE_TIMEOUT_MS = 1_500;
/** A booth Mac over Wi-Fi: the first call from an iPhone also waits for the "local network" permission prompt (ASSUMED). */
export const REMOTE_PROBE_TIMEOUT_MS = 5_000;

export type Selection =
  | { readonly kind: "http"; readonly reason: "server" }
  | { readonly kind: "local"; readonly reason: "forced" | "no-server" };

export interface SelectDeps {
  /** window.location.search */
  readonly search: string;
  /** import.meta.env.VITE_API */
  readonly env: string | undefined;
  /** The booth Mac a native shell saved (LAN mode), if any. It beats VITE_API=local, never `?api=local`. */
  readonly server?: string | null;
  /** Parsed JSON of GET /api/info on this origin (or on `server`), or null when the answer was not OK; may throw. */
  readonly probe: (server: string | null) => Promise<unknown>;
}

export function localForced(search: string, env: string | undefined, hasServer = false): boolean {
  const fromQuery = new URLSearchParams(search).get("api");
  return fromQuery === "local" || (fromQuery === null && env === "local" && !hasServer);
}

const isServerInfo = (info: unknown): boolean => info !== null && typeof info === "object" && (info as { readonly kind?: unknown }).kind === "http";

export async function selectApi(deps: SelectDeps): Promise<Selection> {
  const server = deps.server ?? null;
  if (localForced(deps.search, deps.env, server !== null)) return { kind: "local", reason: "forced" };
  try {
    if (isServerInfo(await deps.probe(server))) return { kind: "http", reason: "server" };
  } catch {
    // No server (static hosting, offline, vite dev alone): run on the device below.
  }
  return { kind: "local", reason: "no-server" };
}

/** GET /api/info on this origin, or on the saved booth Mac, within the probe deadline; the pairing token goes along when there is one. */
export async function probeInfo(server: string | null = null, token: string | null = readToken(), timeoutMs?: number): Promise<unknown> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (token !== null) headers[TOKEN_HEADER] = token;
  const deadline = timeoutMs ?? (server === null ? PROBE_TIMEOUT_MS : REMOTE_PROBE_TIMEOUT_MS);
  // sessionAware: a native shell keeps the practice-wallet id the answer carries, for the client that follows the probe.
  const res = await sessionAware((input, init) => fetch(input, init))(`${server ?? ""}/api/info`, { headers, signal: AbortSignal.timeout(deadline) });
  return res.ok ? ((await res.json()) as unknown) : null;
}

/** How often the test double sweeps escalations that ran out of time (UI only, ASSUMED). */
export const MOCK_SWEEP_EVERY_MS = 1_000;

/** `?api=mock` is for tests and demos of the screens alone: the instant UI double, with no network call at all (not even the probe). */
export function mockForced(search: string): boolean {
  return new URLSearchParams(search).get("api") === "mock";
}

/**
 * The client for this page load, and whether the on-device note should show. On the device the session is kept across
 * reloads (persist/PersistentLocalApiClient): `sessionEnded` is true when a stored session was refused and the page
 * started a new one, which the note says once.
 */
export async function pickClient(): Promise<{ readonly api: ApiClient; readonly onDevice: boolean; readonly sessionEnded?: boolean }> {
  captureTokenFromUrl();
  if (mockForced(window.location.search)) {
    // Loaded only on request: the booth build never carries the double in its first chunk.
    const { MockApiClient } = await import("../MockApiClient");
    return { api: new MockApiClient({ sweepEveryMs: MOCK_SWEEP_EVERY_MS }), onDevice: false };
  }
  const env: unknown = import.meta.env["VITE_API"];
  const stores = browserStores();
  const server = isNative() ? readServer(stores) : null; // a browser page talks to the origin it came from
  const token = readToken(stores);
  const choice = await selectApi({ search: window.location.search, env: typeof env === "string" ? env : undefined, server, probe: (s) => probeInfo(s, token) });
  if (choice.kind !== "http") {
    const api = await PersistentLocalApiClient.open({ report: (line) => console.warn(line) }); // for whoever opens the inspector; the shopper gets the calm note
    return { api, onDevice: true, sessionEnded: api.sessionEnded };
  }
  return { api: new HttpApiClient({ ...(server === null ? {} : { baseUrl: server }), ...(token === null ? {} : { token }) }), onDevice: false };
}
