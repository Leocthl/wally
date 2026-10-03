// The Wally service worker (built to sw.js by vitePlugin.ts, which fills VERSION and PRECACHE). Install: cache the
// hashed app shell. Activate: drop older Wally caches. Fetch: classify() decides; /api and SSE are never touched.
// Updates wait until the page says SKIP_WAITING (the "New version ready" toast), so a demo never swaps mid-run.
// A static-site build (Pages) also precaches the offline verifier page, so "Open the offline checker" works offline: the
// verifier is answered network first (a fresh copy when there is a network) and from this version's cache when there is not.
// The booth build has no such page in its list; the booth server serves /verifier/ itself and the worker leaves it alone.
import { cacheName, classify, isStaleCache, OFFLINE_URL, SHELL_URL, VERIFIER_URL } from "./swPolicy";

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
const HAS_VERIFIER = PRECACHE.includes(VERIFIER_URL);
/**
 * How long the verifier's network answer may take to start before the cached page is used instead (UI only, ASSUMED: no
 * register row). A phone on a bad connection should open the checker, not wait for it. Once the answer has started, the
 * page is not cut short: a slow download of the 440 kB file is let finish.
 */
const VERIFIER_NETWORK_MS = 4_000;
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

/**
 * The network's answer, or a rejection when it has not started within `ms`. The timer ends with the first byte of the answer, so
 * a slow download is let finish. The request is not aborted when the time is up (a navigation request cannot be given a signal in
 * every browser): its late answer is simply not used.
 */
function networkWithin(request: Request, ms: number): Promise<Response> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("the network was too slow")), ms);
    fetch(request).then(
      (response) => {
        clearTimeout(timer);
        resolve(response);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** A navigation must not be answered with a response that came through a redirect; a clean copy of it is the same page. */
async function clean(response: Response): Promise<Response> {
  if (!response.redirected) return response;
  return new Response(await response.blob(), { headers: response.headers, status: response.status, statusText: response.statusText });
}

/**
 * The offline verifier: the network first, so an online phone gets the newest copy; this version's cached copy when the
 * network fails, answers too late or says no. A redirect the host answers with (to the page's other address) is passed on.
 */
async function verifier(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE);
  const keep = async (): Promise<Response | undefined> => {
    const cached = await cache.match(VERIFIER_URL);
    return cached === undefined ? undefined : clean(cached);
  };
  try {
    const network = await networkWithin(request, VERIFIER_NETWORK_MS);
    if (network.ok || network.type === "opaqueredirect") return network;
    return (await keep()) ?? network;
  } catch {
    return (await keep()) ?? Response.error();
  }
}

/** "verifier" without its slash goes to "verifier/": the page's relative links need the folder, online or not. */
function verifierSlash(request: Request): Response {
  const url = new URL(request.url);
  url.pathname = `${url.pathname}/`;
  return Response.redirect(url.href, 302);
}

scope.addEventListener("install", (event) => (event as ExtendableEventLike).waitUntil(install()));
scope.addEventListener("activate", (event) => (event as ExtendableEventLike).waitUntil(activate()));
scope.addEventListener("message", (event) => {
  if ((event as MessageEvent<{ readonly type?: string }>).data?.type === "SKIP_WAITING") void scope.skipWaiting();
});
scope.addEventListener("fetch", (event) => {
  const e = event as FetchEventLike;
  const r = e.request;
  const kind = classify({ method: r.method, url: r.url, mode: r.mode, accept: r.headers.get("accept"), range: r.headers.get("range") }, scope.registration.scope, { verifier: HAS_VERIFIER });
  if (kind === "navigate") e.respondWith(shell(r));
  else if (kind === "asset") e.respondWith(asset(r));
  else if (kind === "verifier") e.respondWith(verifier(r));
  else if (kind === "verifier-slash") e.respondWith(Promise.resolve(verifierSlash(r)));
});
