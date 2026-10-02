// @vitest-environment node
// Builds the app with the GitHub Pages config (vite.pages.config.ts) into a temp folder and checks what a project site
// will serve from /<repo>/: relative URLs only, the Proof link to the offline verifier under the mount, a manifest with no
// origin-relative id, and a service worker precache that lists files which exist. The scan itself is tested on planted files.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { build, loadConfigFromFile, resolveConfig } from "vite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertRelativeOutput, scanOutput } from "../build/pagesPlugin";

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

beforeAll(async () => {
  vi.stubEnv("VITE_API", "local");
  out = mkdtempSync(join(tmpdir(), "wally-pages-"));
  await build({ root: WEB, configFile: CONFIG, logLevel: "silent", build: { outDir: out, emptyOutDir: true } });
}, 120_000);

afterAll(() => {
  vi.unstubAllEnvs();
  if (out) rmSync(out, { recursive: true, force: true });
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
