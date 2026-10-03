// Build step for the service worker (no workbox): emits src/pwa/sw.ts as dist/sw.js and fills its VERSION and
// PRECACHE with every built file plus the public folder, so the hashed shell and assets work offline. A file with a fixed
// name (the offline verifier page of the Pages build, the public files) cannot show a change in its name, so the version
// also hashes what is in it: a new build then replaces the cached copy, because a new version is a new cache.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { Plugin } from "vite";
import { precacheUrls } from "./swPolicy";

const SW_SOURCE = resolve(import.meta.dirname, "sw.ts");
export const SW_FILE = "sw.js";

/** A missing public folder simply means there are no public files to precache. */
function readDir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function listFiles(dir: string): string[] {
  return readDir(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path).map((f) => `${name}/${f}`) : [name];
  });
}

/**
 * Version = hash of the precache list, the HTML shell and the contents of the files whose names do not change with their
 * contents: any rebuilt hashed asset changes a name, and any change in a fixed-name file changes `fixed`, so a new worker.
 */
export function shellVersion(urls: readonly string[], html: string, fixed: readonly (string | Uint8Array)[] = []): string {
  const hash = createHash("sha256").update(urls.join("\n")).update(html);
  for (const content of fixed) hash.update(createHash("sha256").update(content).digest()); // each file's own digest: two files cannot trade bytes
  return hash.digest("hex").slice(0, 12);
}

/** Fills the placeholders. The list is a JSON string inside a string literal, so a minifier cannot fold it. */
export function fillWorker(code: string, urls: readonly string[], version: string): string {
  if (!code.includes("__WALLY_PRECACHE_JSON__") || !code.includes("__WALLY_VERSION__")) throw new Error("sw.js placeholders missing; the worker build changed");
  if (!/^[0-9a-f]+$/.test(version)) throw new Error("sw.js version must be hex");
  const escaped = JSON.stringify(JSON.stringify(urls)).slice(1, -1);
  return code.replaceAll("__WALLY_PRECACHE_JSON__", escaped).replaceAll("__WALLY_VERSION__", version);
}

function listPublic(publicDir: string): string[] {
  return listFiles(publicDir).map((f) => relative(publicDir, join(publicDir, f)).split("\\").join("/"));
}

type Bundle = Parameters<NonNullable<Extract<Plugin["generateBundle"], (...args: never[]) => unknown>>>[1];

/** Contents of the built assets outside assets/ (their names are not hashed; index.html has its own place in the version) and of the public files. */
function fixedNameContents(bundle: Bundle, publicDir: string): readonly (string | Uint8Array)[] {
  const built = Object.entries(bundle).flatMap(([name, item]) => (item.type === "asset" && name !== "index.html" && !name.startsWith("assets/") ? [item.source] : []));
  const publicFiles = listPublic(publicDir).map((file) => readFileSync(join(publicDir, file)));
  return [...built, ...publicFiles];
}

export function wallyPwa({ publicDir }: { readonly publicDir: string }): Plugin {
  return {
    name: "wally-pwa",
    apply: "build",
    buildStart() {
      this.emitFile({ type: "chunk", id: SW_SOURCE, fileName: SW_FILE });
    },
    // "post": after vite:build-html has emitted index.html into the bundle.
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        const worker = bundle[SW_FILE];
        if (!worker || worker.type !== "chunk") throw new Error("wally-pwa: sw.js chunk missing");
        const urls = precacheUrls([...Object.keys(bundle).filter((f) => f !== SW_FILE), ...listPublic(publicDir)]);
        const html = bundle["index.html"];
        const htmlText = html && html.type === "asset" ? String(html.source) : "";
        worker.code = fillWorker(worker.code, urls, shellVersion(urls, htmlText, fixedNameContents(bundle, publicDir)));
      },
    },
  };
}
