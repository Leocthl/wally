// The Wally service worker (built to sw.js by vitePlugin.ts, which fills VERSION and PRECACHE). Install: cache the
// hashed app shell. Activate: drop older Wally caches. Fetch: classify() decides; /api and SSE are never touched.
// Updates wait until the page says SKIP_WAITING (the "New version ready" toast), so a demo never swaps mid-run.
import { cacheName, classify, isStaleCache, OFFLINE_URL, SHELL_URL } from "./swPolicy";

interface ExtendableEventLike extends Event {
  waitUntil(promise: Promise<unknown>): void;
}

interface FetchEventLike extends ExtendableEventLike {
  readonly request: Request;
  respondWith(response: Promise<Response>): void;
}

interface WorkerScope {
  readonly registration: { readonly scope: string };
  readonly clients: { claim(): Promise<void> };
  skipWaiting(): Promise<void>;
  addEventListener(type: string, listener: (event: Event) => void): void;
}

const VERSION: string = "__WALLY_VERSION__";
const PRECACHE: readonly string[] = JSON.parse("__WALLY_PRECACHE_JSON__") as readonly string[];
const CACHE = cacheName(VERSION);
const scope = self as unknown as WorkerScope;

async function install(): Promise<void> {
  const cache = await caches.open(CACHE);
  await cache.addAll([...PRECACHE]);
}

async function activate(): Promise<void> {
  const names = await caches.keys();
  await Promise.all(names.filter((n) => isStaleCache(n, CACHE)).map((n) => caches.delete(n)));
  await scope.clients.claim();
}

async function shell(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE);
  const cached = (await cache.match(SHELL_URL)) ?? (await cache.match("./"));
  if (cached) return cached;
  try {
    return await fetch(request);
  } catch {
    return (await cache.match(OFFLINE_URL)) ?? Response.error();
  }
}

async function asset(request: Request): Promise<Response> {
  const cached = await caches.match(request, { cacheName: CACHE });
  return cached ?? fetch(request);
}

scope.addEventListener("install", (event) => (event as ExtendableEventLike).waitUntil(install()));
scope.addEventListener("activate", (event) => (event as ExtendableEventLike).waitUntil(activate()));
scope.addEventListener("message", (event) => {
  if ((event as MessageEvent<{ readonly type?: string }>).data?.type === "SKIP_WAITING") void scope.skipWaiting();
});
scope.addEventListener("fetch", (event) => {
  const e = event as FetchEventLike;
  const r = e.request;
  const kind = classify({ method: r.method, url: r.url, mode: r.mode, accept: r.headers.get("accept"), range: r.headers.get("range") }, scope.registration.scope);
  if (kind === "navigate") e.respondWith(shell(r));
  else if (kind === "asset") e.respondWith(asset(r));
});
