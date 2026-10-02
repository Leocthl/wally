// What the service worker may touch. Pure, so tests can prove it: only same-origin GETs inside the app scope, never
// /api (JSON or the SSE stream), never ranges. Navigations get the cached app shell; other requests, cache first.

export const CACHE_PREFIX = "wally-shell-";
export const SHELL_URL = "./index.html";
export const OFFLINE_URL = "./offline.html";

export type RouteKind = "ignore" | "navigate" | "asset";

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

export function classify(req: RequestInfo, scope: string): RouteKind {
  if (req.method !== "GET" || req.range) return "ignore";
  if (req.accept?.includes("text/event-stream")) return "ignore";
  const path = scopedPath(req.url, scope);
  if (path === null || isApiPath(path)) return "ignore";
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
