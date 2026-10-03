// Vite plugin for the GitHub Pages build (vite.pages.config.ts only; the booth build never loads it). It applies the rules
// in pagesRules.ts: the Proof screen's root-absolute verifier link becomes relative while modules are transformed, the
// manifest loses its origin-relative id once the files are written, and the written site is scanned so a root-absolute URL
// that slips in later fails the build instead of shipping a dead link. It also puts the offline verifier page (built apart,
// one self-contained file) into the bundle as verifier/index.html, so the service worker (src/pwa) lists it in its precache
// and the checker opens offline, and the site's version changes when the page does.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";
import { findRootAbsolute, isScanned, relativeManifest, relativeVerifierLinks, type Finding } from "./pagesRules";

const MANIFEST = "manifest.webmanifest";
const SCRIPT_ID = /\.[cm]?[jt]sx?$/;

/** Files under `dir`, as paths relative to it with forward slashes. */
function listFiles(dir: string, prefix = ""): string[] {
  return readdirSync(join(dir, prefix)).flatMap((name) => {
    const rel = prefix === "" ? name : `${prefix}/${name}`;
    return statSync(join(dir, rel)).isDirectory() ? listFiles(dir, rel) : [rel];
  });
}

/** Vite copies public/ into the output before this plugin runs, so a missing manifest means the build changed under us. */
function readManifest(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch (cause) {
    throw new Error(`pages: ${MANIFEST} is not in the build output (it comes from apps/web/public)`, { cause });
  }
}

/** Every root-absolute URL left in the html, scripts, styles, svg and manifest under `dir`. */
export function scanOutput(dir: string): readonly Finding[] {
  return listFiles(dir)
    .filter(isScanned)
    .flatMap((file) => findRootAbsolute(file, readFileSync(join(dir, file), "utf8")));
}

/** Throws one error that names every offender, so a single build shows the whole list. */
export function assertRelativeOutput(dir: string): void {
  const found = scanOutput(dir);
  if (found.length === 0) return;
  const lines = found.map((f) => `  ${f.file}:${f.line}  ${f.text}`);
  throw new Error(`pages: these URLs start at the origin root, so on a project site (/<repo>/) they would leave the app:\n${lines.join("\n")}\nWrite them relative ("./x") or from import.meta.env.BASE_URL.`);
}

/** Where the verifier page lives in the site; the worker's VERIFIER_URL is this, relative to the worker. */
export const VERIFIER_FILE = "verifier/index.html";

export interface PagesOptions {
  /** The built verifier page (apps/verifier, one index.html). Absent: the site is built without it (and the worker does not answer /verifier/). */
  readonly verifierFile?: string | undefined;
}

/** The page's bytes, or an error that says which file; an empty or missing file would ship a dead link. */
function readVerifier(path: string): Uint8Array {
  let bytes: Uint8Array;
  try {
    bytes = readFileSync(path);
  } catch (cause) {
    throw new Error(`pages: the verifier page ${path} cannot be read (build apps/verifier first: pnpm pages:build does)`, { cause });
  }
  if (bytes.length === 0) throw new Error(`pages: the verifier page ${path} is empty`);
  return bytes;
}

export function wallyPages(options: PagesOptions = {}): Plugin {
  return {
    name: "wally-pages",
    apply: "build",
    enforce: "pre",
    buildStart() {
      if (options.verifierFile !== undefined && options.verifierFile !== "") this.emitFile({ type: "asset", fileName: VERIFIER_FILE, source: readVerifier(options.verifierFile) });
    },
    transform(code, id) {
      if (!SCRIPT_ID.test(id.split("?")[0] ?? "") || id.includes("/node_modules/")) return null;
      const next = relativeVerifierLinks(code);
      return next === code ? null : { code: next, map: null };
    },
    writeBundle(options) {
      if (options.dir === undefined) throw new Error("pages: the build has no output folder");
      const manifest = join(options.dir, MANIFEST);
      writeFileSync(manifest, relativeManifest(readManifest(manifest)));
      assertRelativeOutput(options.dir);
    },
  };
}
