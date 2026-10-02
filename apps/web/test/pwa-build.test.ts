// @vitest-environment node
// Builds the app into a temp folder and checks the real sw.js: a classic script (no import or export), filled
// placeholders, every built and public file precached, and, run in a sandbox, it never answers /api or SSE requests.
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let out = "";
let sw = "";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [relative(out, p)];
  });
}

beforeAll(async () => {
  out = mkdtempSync(join(tmpdir(), "wally-build-"));
  await build({ root: WEB, configFile: resolve(WEB, "vite.config.ts"), logLevel: "silent", build: { outDir: out, emptyOutDir: true } });
  sw = readFileSync(join(out, "sw.js"), "utf8");
}, 120_000);

afterAll(() => {
  if (out) rmSync(out, { recursive: true, force: true });
});

type Listener = (event: unknown) => void;

function loadWorker(): { readonly listeners: Map<string, Listener>; readonly precache: string[] } {
  const listeners = new Map<string, Listener>();
  const precache: string[] = [];
  const cache = { addAll: async (urls: string[]) => void precache.push(...urls), match: async () => undefined };
  const self = { registration: { scope: "https://booth.example/" }, clients: { claim: async () => undefined }, skipWaiting: async () => undefined, addEventListener: (t: string, l: Listener) => listeners.set(t, l) };
  runInNewContext(sw, { self, caches: { open: async () => cache, keys: async () => [], delete: async () => true, match: async () => undefined }, fetch: async () => new Response("net"), URL, Response, JSON, Promise });
  return { listeners, precache };
}

function fetchEvent(url: string, init: { mode?: string; accept?: string; method?: string } = {}): { readonly responded: () => boolean; readonly event: unknown } {
  let responded = false;
  const headers = new Headers(init.accept ? { accept: init.accept } : {});
  const request = { url, method: init.method ?? "GET", mode: init.mode ?? "cors", headers };
  return { event: { request, respondWith: () => void (responded = true), waitUntil: () => undefined }, responded: () => responded };
}

describe("built service worker", () => {
  it("is a classic script with its placeholders filled", () => {
    expect(sw).not.toMatch(/^\s*(import|export)\b/m);
    expect(sw).not.toContain("__WALLY_");
    expect(sw).toMatch(/wally-shell-/);
  });

  it("precaches index.html, every built asset and every public file", async () => {
    const { listeners, precache } = loadWorker();
    let done: Promise<unknown> = Promise.resolve();
    listeners.get("install")?.({ waitUntil: (p: Promise<unknown>) => void (done = p) });
    await done;
    const expected = files(out).filter((f) => f !== "sw.js" && !f.endsWith(".map")).map((f) => `./${f.split("\\").join("/")}`);
    expect(precache).toContain("./index.html");
    expect(precache).toContain("./manifest.webmanifest");
    expect(precache).toContain("./offline.html");
    expect([...precache].sort()).toEqual(["./", ...expected].sort());
  });

  it("never answers /api or an event stream, and answers navigations and assets", () => {
    const { listeners } = loadWorker();
    const onFetch = listeners.get("fetch");
    expect(onFetch).toBeDefined();
    const cases = [
      ["https://booth.example/api/health", {}, false],
      ["https://booth.example/api/events", { accept: "text/event-stream" }, false],
      ["https://booth.example/api/propose", { method: "POST" }, false],
      ["https://booth.example/stream", { accept: "text/event-stream" }, false],
      ["https://elsewhere.example/assets/a.js", {}, false],
      ["https://booth.example/", { mode: "navigate" }, true],
      ["https://booth.example/assets/index.js", {}, true],
    ] as const;
    for (const [url, init, answers] of cases) {
      const f = fetchEvent(url, init);
      onFetch?.(f.event);
      expect(f.responded(), url).toBe(answers);
    }
  });
});
