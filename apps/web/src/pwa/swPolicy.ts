// What the service worker may touch. Pure, so tests can prove it: only same-origin GETs inside the app scope, never
// /api (JSON or the SSE stream), never ranges. Navigations get the cached app shell; other requests, cache first.
// The offline verifier page (verifier/) is its own page, never the app shell. The booth server serves it itself, so a
// worker built for the booth leaves it to the network. A worker built for a static site (the Pages build) holds the page,
// because it is one self-contained file: it answers verifier/ network first and from its cache when the network is gone.

export const CACHE_PREFIX = "wally-shell-";
export const SHELL_URL = "./index.html";
export const OFFLINE_URL = "./offline.html";
/** The offline verifier page, relative to the worker; in the precache list only when the build includes it. */
export const VERIFIER_URL = "./verifier/index.html";

/**
 * ignore: the network's. navigate: the app shell. asset: cache first. verifier: the verifier page, network first, then the cache.
 * verifier-slash: "verifier" without its slash, answered with a redirect to "verifier/" (a page served at the wrong depth would
 * resolve its relative links one folder too high, and the worker must not depend on the host redirecting for it).
 */
export type RouteKind = "ignore" | "navigate" | "asset" | "verifier" | "verifier-slash";

/** What the worker knows about its own build. */
export interface RouteOptions {
  /** True when the precache list holds VERIFIER_URL: only then does the worker answer the verifier's paths. Default false. */
  readonly verifier?: boolean;
}

export interface RequestInfo {
  readonly method: string;
  readonly url: string;
  readonly mode: string;
  readonly accept: string | null;
  readonly range: string | null;
}

/** Path of `url` relative to the scope ("" for the scope itself), or null when outside the scope or origin. */
export function scopedPath(url: string, scope: string): string | null {
  const u = new URL(url);
  const s = new URL(scope);
  if (u.origin !== s.origin || !u.pathname.startsWith(s.pathname)) return null;
  return u.pathname.slice(s.pathname.length);
}

/** True for anything under an /api/ path segment, wherever the app is mounted. */
export function isApiPath(path: string): boolean {
  return /(^|\/)api(\/|$)/.test(path);
}

/** True for the offline verifier page (/verifier/), which the booth serves as a page of its own, wherever the app is mounted. */
export function isVerifierPath(path: string): boolean {
  return /(^|\/)verifier(\/|$)/.test(path);
}

/** The verifier's own addresses at the scope root: "verifier" (no slash), "verifier/" and "verifier/index.html". Nothing deeper is ours. */
function verifierRoute(path: string): "verifier" | "verifier-slash" | "ignore" {
  if (path === "verifier") return "verifier-slash";
  return path === "verifier/" || path === "verifier/index.html" ? "verifier" : "ignore";
}

export function classify(req: RequestInfo, scope: string, options: RouteOptions = {}): RouteKind {
  if (req.method !== "GET" || req.range) return "ignore";
  if (req.accept?.includes("text/event-stream")) return "ignore";
  const path = scopedPath(req.url, scope);
  if (path === null || isApiPath(path)) return "ignore";
  // The verifier is not the app: without this a controlled page that opens /verifier/ would get the app shell back.
  if (isVerifierPath(path)) return options.verifier === true ? verifierRoute(path) : "ignore";
  return req.mode === "navigate" ? "navigate" : "asset";
}

export function cacheName(version: string): string {
  return `${CACHE_PREFIX}${version}`;
}

/** Our own older shell caches; other caches on the origin are not ours to delete. */
export function isStaleCache(name: string, current: string): boolean {
  return name.startsWith(CACHE_PREFIX) && name !== current;
}

/** Precache entries relative to the worker: the scope root, then each built file once, sorted. */
export function precacheUrls(files: readonly string[]): readonly string[] {
  const rel = files.filter((f) => !f.endsWith(".map") && f !== "sw.js").map((f) => `./${f.replace(/^\.?\//, "")}`);
  return ["./", ...[...new Set(rel)].sort()];
}
