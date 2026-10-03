// @vitest-environment node
// Builds the app with the GitHub Pages config (vite.pages.config.ts) into a temp folder and checks what a project site
// will serve from /<repo>/: relative URLs only, the Proof link to the offline verifier under the mount, a manifest with no
// origin-relative id, and a service worker precache that lists files which exist. The scan itself is tested on planted files.
// The offline verifier page goes into this build (WALLY_VERIFIER_FILE) and into the worker's precache: the built worker, run in a
// sandbox, answers /wally/verifier/ network first, from its cache when the network is gone or slow, and the version follows the page.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { build, loadConfigFromFile, resolveConfig } from "vite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertRelativeOutput, scanOutput } from "../build/pagesPlugin";

/** Two versions of a stand-in verifier page: the real one is a build of its own (apps/verifier); the worker only needs a file of fixed name. */
const PAGE_ONE = "<!doctype html><title>Checker</title><p>the offline checker, version one</p>";
const PAGE_TWO = "<!doctype html><title>Checker</title><p>the offline checker, version two</p>";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = resolve(WEB, "vite.pages.config.ts");
let out = "";

function files(root: string, dir = root): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(root, p) : [relative(root, p).split("\\").join("/")];
  });
}

const read = (file: string): string => readFileSync(join(out, file), "utf8");

type Listener = (event: unknown) => void;

/** Runs the built worker in a sandbox and returns what its install step asks the cache to hold. */
async function precacheOf(worker: string): Promise<string[]> {
  const listeners = new Map<string, Listener>();
  const precache: string[] = [];
  const cache = { addAll: async (urls: string[]) => void precache.push(...urls) };
  const self = { registration: { scope: "https://pages.example/wally/" }, clients: { claim: async () => undefined }, skipWaiting: async () => undefined, addEventListener: (type: string, l: Listener) => listeners.set(type, l) };
  runInNewContext(worker, { self, caches: { open: async () => cache, keys: async () => [], delete: async () => true, match: async () => undefined }, fetch: async () => new Response("net"), URL, Response, JSON, Promise });
  let done: Promise<unknown> = Promise.resolve();
  listeners.get("install")?.({ waitUntil: (p: Promise<unknown>) => void (done = p) });
  await done;
  return precache;
}

const scratch: string[] = [];

/** A temp folder that is removed after the file's tests. */
function temp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}

/** Builds the Pages site with `page` as the verifier page (null: none) and returns the output folder. */
async function buildSite(page: string | null): Promise<string> {
  const dir = temp("wally-pages-");
  if (page === null) vi.stubEnv("WALLY_VERIFIER_FILE", "");
  else {
    const file = join(temp("wally-verifier-"), "index.html");
    writeFileSync(file, page);
    vi.stubEnv("WALLY_VERIFIER_FILE", file);
  }
  await build({ root: WEB, configFile: CONFIG, logLevel: "silent", build: { outDir: dir, emptyOutDir: true } });
  return dir;
}

beforeAll(async () => {
  vi.stubEnv("VITE_API", "local");
  out = await buildSite(PAGE_ONE);
}, 120_000);

afterAll(() => {
  vi.unstubAllEnvs();
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

describe("the Pages config", () => {
  it("builds into dist-pages with relative asset paths, so the booth build in dist is never touched", async () => {
    const resolved = await resolveConfig({ root: WEB, configFile: CONFIG, logLevel: "silent" }, "build");
    expect(resolved.base).toBe("./");
    expect(resolved.build.outDir).toBe("dist-pages");
    expect(resolved.build.emptyOutDir).toBe(true);
  });

  it("refuses to load unless the build is forced on-device (VITE_API=local)", async () => {
    vi.stubEnv("VITE_API", "");
    try {
      await expect(loadConfigFromFile({ command: "build", mode: "production" }, CONFIG, WEB)).rejects.toThrow(/VITE_API=local/);
    } finally {
      vi.stubEnv("VITE_API", "local");
    }
  });
});

describe("the built site", () => {
  it("has no root-absolute URL in any html, script, style or manifest", () => {
    expect(scanOutput(out)).toEqual([]);
    expect(read("index.html")).toMatch(/<link rel="manifest" href="\.\/manifest\.webmanifest"/);
    expect(read("index.html")).toMatch(/<script type="module" crossorigin src="\.\/assets\//);
  });

  it("links the Proof screen to the verifier under the mount: ./verifier/, never /verifier/", () => {
    const scripts = files(out).filter((f) => f.endsWith(".js") && f !== "sw.js");
    // The minifier may turn the quotes into backticks, so any quote counts.
    expect(scripts.some((f) => /["'`]\.\/verifier\/["'`]/.test(read(f)))).toBe(true);
    expect(scripts.some((f) => /["'`]\/verifier\/["'`]/.test(read(f)))).toBe(false);
  });

  it("keeps start_url, scope and every icon and shortcut inside the mount, and has no id (which would name the origin root)", () => {
    const manifest = JSON.parse(read("manifest.webmanifest")) as { id?: string; start_url: string; scope: string; icons: { src: string }[]; shortcuts: { url: string }[] };
    expect(manifest.id).toBeUndefined();
    expect([manifest.start_url, manifest.scope]).toEqual(["./", "./"]);
    for (const icon of manifest.icons) expect(existsSync(join(out, icon.src)), icon.src).toBe(true);
    for (const s of manifest.shortcuts) expect(s.url.startsWith("./")).toBe(true);
  });

  it("precaches only files that exist, all relative to the worker", async () => {
    const urls = await precacheOf(read("sw.js"));
    expect(urls).toEqual(expect.arrayContaining(["./", "./index.html", "./manifest.webmanifest", "./offline.html", "./icons/icon-192.png"]));
    for (const url of urls) {
      expect(url.startsWith("./"), url).toBe(true);
      if (url !== "./") expect(existsSync(join(out, url)), url).toBe(true);
    }
  });
});

describe("assertRelativeOutput", () => {
  it("passes a clean folder and names every offender (file, line, text) in one error", () => {
    const dir = mkdtempSync(join(tmpdir(), "wally-pages-scan-"));
    try {
      writeFileSync(join(dir, "ok.html"), '<a href="./x">x</a>');
      expect(() => assertRelativeOutput(dir)).not.toThrow();
      mkdirSync(join(dir, "assets"));
      writeFileSync(join(dir, "bad.html"), '<p>\n<a href="/start">x</a>');
      writeFileSync(join(dir, "assets", "a.js"), 'const v = "/verifier/";');
      writeFileSync(join(dir, "icon.png"), 'href="/not-read"');
      let message = "";
      try {
        assertRelativeOutput(dir);
      } catch (err) {
        message = err instanceof Error ? err.message : String(err);
      }
      expect(message).toMatch(/bad\.html:2\s+href="\/start"/);
      expect(message).toMatch(/assets\/a\.js:1\s+"\/verifier\/"/);
      expect(message).not.toContain("icon.png");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---- the offline checker in the built worker ------------------------------------------------------------------------

const MOUNT = "https://pages.example/wally/";

type Network = (request: unknown) => Promise<Response>;

interface Sandbox {
  /** The cache name the worker opened (wally-shell-<version>). */
  readonly cacheName: () => string;
  readonly install: () => Promise<void>;
  /** What the worker answers to a GET of `url`, or null when it leaves the request to the network. */
  readonly ask: (url: string, init?: { mode?: string; method?: string; accept?: string; range?: string }) => Promise<Response | null>;
  /** The requests the worker sent to the network. */
  readonly sent: { readonly url: string }[];
}

/** Runs the built worker with a cache that holds the built files (what install would fetch) and a network you choose. */
function sandbox(worker: string, dir: string, network: Network, options: { readonly redirectedCopies?: boolean; readonly scope?: string } = {}): Sandbox {
  const scopeUrl = options.scope ?? MOUNT;
  const listeners = new Map<string, Listener>();
  const stores = new Map<string, Map<string, Uint8Array>>();
  const sent: { url: string }[] = [];
  let opened = "";
  const keyOf = (input: unknown): string => new URL(typeof input === "string" ? input : (input as { url: string }).url, `${scopeUrl}sw.js`).href;
  const open = (name: string) => {
    opened = name;
    const store = stores.get(name) ?? new Map<string, Uint8Array>();
    stores.set(name, store);
    return {
      addAll: async (urls: string[]) => {
        for (const url of urls) store.set(keyOf(url), readFileSync(join(dir, url === "./" ? "index.html" : url)));
      },
      match: async (input: unknown) => {
        const bytes = store.get(keyOf(input));
        if (bytes === undefined) return undefined;
        const copy = new Response(new Uint8Array(bytes));
        // A copy the host had redirected when it was cached remembers it (Response.redirected).
        return options.redirectedCopies === true ? Object.defineProperty(copy, "redirected", { value: true }) : copy;
      },
    };
  };
  const self = { registration: { scope: scopeUrl }, clients: { claim: async () => undefined }, skipWaiting: async () => undefined, addEventListener: (type: string, l: Listener) => listeners.set(type, l) };
  const fetchDouble = (request: unknown): Promise<Response> => {
    sent.push({ url: (request as { url: string }).url });
    return network(request);
  };
  runInNewContext(worker, {
    self,
    caches: { open: async (name: string) => open(name), keys: async () => [...stores.keys()], delete: async () => true, match: async (input: unknown, o?: { cacheName?: string }) => open(o?.cacheName ?? opened).match(input) },
    fetch: fetchDouble,
    URL,
    Response,
    JSON,
    Promise,
    AbortController,
    // Looked up when called, so a test's fake timers apply.
    setTimeout: (fn: () => void, ms: number) => globalThis.setTimeout(fn, ms),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => globalThis.clearTimeout(id),
  });
  return {
    sent,
    cacheName: () => opened,
    async install() {
      let done: Promise<unknown> = Promise.resolve();
      listeners.get("install")?.({ waitUntil: (p: Promise<unknown>) => void (done = p) });
      await done;
    },
    async ask(url, init = {}) {
      let answer: Promise<Response> | null = null;
      const headers = new Headers({ ...(init.accept ? { accept: init.accept } : {}), ...(init.range ? { range: init.range } : {}) });
      const request = { url, method: init.method ?? "GET", mode: init.mode ?? "cors", headers };
      listeners.get("fetch")?.({ request, respondWith: (p: Promise<Response>) => void (answer = p), waitUntil: () => undefined });
      return answer === null ? null : await answer;
    },
  };
}

const offline: Network = async () => {
  throw new TypeError("Failed to fetch");
};
const online = (body: string, init: ResponseInit = {}): Network => async () => new Response(body, init);
const navigate = { mode: "navigate" } as const;

describe("the offline verifier in the built site", () => {
  it("is in the site as verifier/index.html, byte for byte, and the worker lists it", async () => {
    expect(read("verifier/index.html")).toBe(PAGE_ONE);
    const urls = await precacheOf(read("sw.js"));
    expect(urls).toContain("./verifier/index.html");
  });

  it("a site built without it has no checker page, and its worker leaves /verifier/ to the network", async () => {
    const bare = await buildSite(null);
    expect(existsSync(join(bare, "verifier"))).toBe(false);
    const urls = await precacheOf(readFileSync(join(bare, "sw.js"), "utf8"));
    expect(urls.filter((u) => u.includes("verifier"))).toEqual([]);
    const sb = sandbox(readFileSync(join(bare, "sw.js"), "utf8"), bare, offline);
    await sb.install();
    expect(await sb.ask(`${MOUNT}verifier/`, navigate)).toBeNull();
  }, 120_000);

  it("a missing or empty verifier file stops the build with the file named (no dead link ships)", async () => {
    vi.stubEnv("WALLY_VERIFIER_FILE", join(temp("wally-missing-"), "nope.html"));
    await expect(build({ root: WEB, configFile: CONFIG, logLevel: "silent", build: { outDir: temp("wally-pages-"), emptyOutDir: true } })).rejects.toThrow(/verifier page .*nope\.html.*cannot be read/);
    const empty = join(temp("wally-empty-"), "index.html");
    writeFileSync(empty, "");
    vi.stubEnv("WALLY_VERIFIER_FILE", empty);
    await expect(build({ root: WEB, configFile: CONFIG, logLevel: "silent", build: { outDir: temp("wally-pages-"), emptyOutDir: true } })).rejects.toThrow(/is empty/);
  }, 120_000);

  it("offline, answers /wally/verifier/, verifier/index.html (with a query) and the page itself from the cache", async () => {
    const sb = sandbox(read("sw.js"), out, offline);
    await sb.install();
    for (const url of [`${MOUNT}verifier/`, `${MOUNT}verifier/index.html`, `${MOUNT}verifier/?mode=developer`, `${MOUNT}verifier/index.html?x=1`]) {
      const res = await sb.ask(url, navigate);
      expect(res?.status, url).toBe(200);
      expect(await res?.text(), url).toBe(PAGE_ONE);
    }
    expect(sb.sent.length).toBeGreaterThan(0); // it tried the network first every time
  });

  it("works the same from the origin root (the Vercel copy), not only from a project path", async () => {
    const root = "https://wally-dev.vercel.app/";
    const sb = sandbox(read("sw.js"), out, offline, { scope: root });
    await sb.install();
    for (const path of ["verifier/", "verifier/index.html"]) {
      const res = await sb.ask(`${root}${path}`, navigate);
      expect(await res?.text(), path).toBe(PAGE_ONE);
    }
    const slash = await sb.ask(`${root}verifier`, navigate);
    expect(slash?.headers.get("location")).toBe(`${root}verifier/`);
    expect(await sb.ask(`${root}api/health`)).toBeNull();
  });

  it("online, the network answers first, so a phone with a connection gets the newest copy", async () => {
    const sb = sandbox(read("sw.js"), out, online("<p>fresh from the network</p>"));
    await sb.install();
    const res = await sb.ask(`${MOUNT}verifier/`, navigate);
    expect(await res?.text()).toBe("<p>fresh from the network</p>");
    expect(sb.sent[0]).toMatchObject({ url: `${MOUNT}verifier/` });
  });

  it("falls back to the cached page when the network says no (404, 500) and passes a redirect on", async () => {
    for (const status of [404, 500, 503]) {
      const sb = sandbox(read("sw.js"), out, online("gone", { status }));
      await sb.install();
      const res = await sb.ask(`${MOUNT}verifier/`, navigate);
      expect(res?.status, String(status)).toBe(200);
      expect(await res?.text(), String(status)).toBe(PAGE_ONE);
    }
    const redirected = Object.defineProperty(new Response(null, { status: 200 }), "type", { value: "opaqueredirect" });
    const sb = sandbox(read("sw.js"), out, async () => redirected);
    await sb.install();
    expect(await sb.ask(`${MOUNT}verifier/index.html`, navigate)).toBe(redirected);
  });

  it("uses the cached page when the network does not start answering in time, and does not cut a slow download", async () => {
    vi.useFakeTimers();
    try {
      const hang: Network = () => new Promise<Response>(() => undefined); // a connection that never answers
      const sb = sandbox(read("sw.js"), out, hang);
      await sb.install();
      const pending = sb.ask(`${MOUNT}verifier/`, navigate);
      await vi.advanceTimersByTimeAsync(3_900);
      let settled = false;
      void pending.then(() => (settled = true));
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toBe(false); // still waiting for the network
      await vi.advanceTimersByTimeAsync(200);
      expect(await (await pending)?.text()).toBe(PAGE_ONE);

      // An answer that has started is used as it is, however long its body takes: the timer ended with the first byte.
      const slow = sandbox(read("sw.js"), out, async () => new Response(new ReadableStream({ start() {} }), { status: 200 })); // headers now, body never ends
      await slow.install();
      const res = await slow.ask(`${MOUNT}verifier/`, navigate);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(res?.status).toBe(200);
      expect(res?.body).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends verifier without its slash to verifier/, online or not, keeping the query", async () => {
    for (const network of [offline, online("x")]) {
      const sb = sandbox(read("sw.js"), out, network);
      await sb.install();
      const res = await sb.ask(`${MOUNT}verifier?mode=developer`, navigate);
      expect(res?.status).toBe(302);
      expect(res?.headers.get("location")).toBe(`${MOUNT}verifier/?mode=developer`);
      expect(sb.sent).toEqual([]);
    }
  });

  it("serves the cached page clean when the host had redirected the copy it cached (a navigation must not get a redirected response)", async () => {
    const sb = sandbox(read("sw.js"), out, offline, { redirectedCopies: true });
    await sb.install();
    const res = await sb.ask(`${MOUNT}verifier/`, navigate);
    expect(res?.redirected).toBe(false);
    expect(res?.status).toBe(200);
    expect(await res?.text()).toBe(PAGE_ONE);
  });

  it("leaves the app alone: the shell for navigations, /api and everything it did not answer before", async () => {
    const sb = sandbox(read("sw.js"), out, offline);
    await sb.install();
    expect(await (await sb.ask(MOUNT, navigate))?.text()).toBe(read("index.html"));
    expect(await sb.ask(`${MOUNT}api/health`)).toBeNull();
    expect(await sb.ask(`${MOUNT}api/events`, { accept: "text/event-stream" })).toBeNull();
    expect(await sb.ask(`${MOUNT}verifier/`, { method: "POST" })).toBeNull();
    expect(await sb.ask(`${MOUNT}verifier/x.js`)).toBeNull();
    expect(await sb.ask("https://elsewhere.example/wally/verifier/", navigate)).toBeNull();
  });

  it("a new build replaces the cached page: a changed verifier file is a new worker version, so a new cache", async () => {
    const first = sandbox(read("sw.js"), out, offline);
    await first.install();
    const changed = await buildSite(PAGE_TWO);
    const second = sandbox(readFileSync(join(changed, "sw.js"), "utf8"), changed, offline);
    await second.install();
    expect(second.cacheName()).not.toBe(first.cacheName());
    expect(await (await second.ask(`${MOUNT}verifier/`, navigate))?.text()).toBe(PAGE_TWO);
    expect(await (await first.ask(`${MOUNT}verifier/`, navigate))?.text()).toBe(PAGE_ONE);
  }, 120_000);
});
