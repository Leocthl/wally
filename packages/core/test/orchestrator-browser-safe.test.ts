// Browser safety (Wally local mode runs the real stack in a phone browser): the import graphs of the core entry
// points the browser needs, and of @wally/rail-sim's main entry, must hold no Node built-in, no fs, path, crypto
// or os, no process, Buffer or require, and no top-level await. Explicitly Node-only subpaths stay out:
// @wally/core/log/file, @wally/core/testing/fixtures, @wally/rail-sim/node. The orchestrator owns no timer
// loop either (the host calls tick), so it never uses setInterval. Static walk of the source, no bundler needed.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CORE_SRC = fileURLToPath(new URL("../src/", import.meta.url));
const RAIL_SRC = fileURLToPath(new URL("../../rail-sim/src/", import.meta.url));
const CORE_EXPORTS = (JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")) as { exports: Record<string, string> }).exports;

const IMPORT_RE = /(?:import|export)\s[^"';]*?from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|^\s*import\s+["']([^"']+)["']/gm;
const NODE_BUILTIN = /^(node:|(fs|path|crypto|os|url|util|stream|buffer|events|module|child_process|worker_threads|http|https|net|tls|zlib|process)(\/|$))/;
/** npm packages the browser graph may reach; each is plain ESM that runs in a browser. */
const BROWSER_PACKAGES = /^(@noble\/(curves|hashes)\/|@scure\/base$|ajv(\/|$)|ajv-formats$|canonicalize$)/;
const NODE_ONLY_ENTRIES = new Set(["./log/file", "./testing/fixtures"]);
const BROWSER_ENTRIES = ["orchestrator", "cart", "engine", "rules", "packet", "executor", "explain", "config", "log", "vc", "crypto", "verify", "family"];

const FORBIDDEN_CODE: readonly [string, RegExp][] = [
  ["process", /\bprocess\s*\./],
  ["Buffer", /\bBuffer\b/],
  ["require()", /\brequire\s*\(/],
  ["__dirname/__filename", /\b__(dirname|filename)\b/],
  ["fileURLToPath", /\bfileURLToPath\b/],
  ["top-level await", /^(?:export\s+)?(?:(?:const|let|var)\s[^\n]*=\s*)?(?:for\s+)?await\b/m],
];

/** Source without comments, so prose like "a Buffer of bytes" in a comment cannot trip the scan. */
function code(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
}

function resolveTs(fromFile: string, spec: string): string {
  const base = resolve(dirname(fromFile), spec);
  for (const candidate of [`${base}.ts`, join(base, "index.ts"), base]) {
    try {
      if (candidate.endsWith(".ts")) {
        readFileSync(candidate);
        return candidate;
      }
    } catch {
      // try the next candidate
    }
  }
  throw new Error(`cannot resolve ${spec} from ${fromFile}`);
}

/** Where a specifier leads: a source file to walk, an npm package, or a JSON file. */
function target(fromFile: string, spec: string): { readonly file?: string; readonly external?: string } {
  if (spec.endsWith(".json")) return {};
  if (spec.startsWith(".")) return { file: resolveTs(fromFile, spec) };
  if (spec.startsWith("@wally/core/")) {
    const sub = `./${spec.slice("@wally/core/".length)}`;
    if (NODE_ONLY_ENTRIES.has(sub)) return { external: `NODE-ONLY ${spec}` };
    const path = CORE_EXPORTS[sub];
    if (path === undefined) throw new Error(`${spec} is not in @wally/core exports`);
    return { file: join(CORE_SRC, "..", path) };
  }
  return { external: spec };
}

interface Graph {
  readonly files: ReadonlySet<string>;
  readonly externals: ReadonlySet<string>;
  readonly offenders: readonly string[];
}

function walk(entry: string): Graph {
  const files = new Set<string>();
  const externals = new Set<string>();
  const offenders: string[] = [];
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (files.has(file)) continue;
    files.add(file);
    const source = code(file);
    for (const [name, re] of FORBIDDEN_CODE) if (re.test(source)) offenders.push(`${file}: ${name}`);
    for (const m of source.matchAll(IMPORT_RE)) {
      const spec = m[1] ?? m[2] ?? m[3] ?? "";
      const next = target(file, spec);
      if (next.file !== undefined) queue.push(next.file);
      if (next.external !== undefined) externals.add(next.external);
    }
  }
  for (const ext of externals) if (NODE_BUILTIN.test(ext) || !BROWSER_PACKAGES.test(ext)) offenders.push(`imports ${ext}`);
  return { files, externals, offenders };
}

const short = (file: string): string => file.replace(CORE_SRC, "core/").replace(RAIL_SRC, "rail-sim/");

describe("browser-safe import graphs (Wally local mode)", () => {
  it.each(BROWSER_ENTRIES)("@wally/core/%s: no Node built-ins, process, Buffer, require or top-level await", (entry) => {
    const graph = walk(join(CORE_SRC, "..", CORE_EXPORTS[`./${entry}`] ?? "missing"));
    expect(graph.offenders.map(short)).toEqual([]);
  });

  it("the orchestrator graph reaches the cart builder, executor, packet fold, log and vc, not the file store or fixtures", () => {
    const files = [...walk(join(CORE_SRC, "orchestrator/index.ts")).files].map(short);
    for (const needed of ["core/cart/build.ts", "core/executor/index.ts", "core/packet/fold.ts", "core/log/delegator.ts", "core/vc/proof.ts"]) expect(files).toContain(needed);
    expect(files).not.toContain("core/engine/decide.ts"); // the engine is injected (OrchestratorDeps.engine)
    for (const banned of ["core/log/file-store.ts", "core/log/file.ts", "core/testing/fixtures.ts", "core/crypto/key-file.ts"]) expect(files).not.toContain(banned);
  });

  it("the orchestrator owns no timer loop: no setInterval (the host calls tick)", () => {
    const orchestratorFiles = [...walk(join(CORE_SRC, "orchestrator/index.ts")).files].filter((f) => f.includes("/orchestrator/"));
    expect(orchestratorFiles.length).toBeGreaterThan(5);
    for (const file of orchestratorFiles) expect(code(file), short(file)).not.toMatch(/\bsetInterval\b/);
  });

  it("@wally/rail-sim main entry (not ./node) is browser-safe too (read-only check)", () => {
    const graph = walk(join(RAIL_SRC, "index.ts"));
    expect(graph.offenders.map(short)).toEqual([]);
    expect([...graph.files].map(short)).not.toContain("rail-sim/node.ts");
  });

  it("the scan itself catches what it should (guards against a vacuous walk)", () => {
    expect(walk(join(CORE_SRC, "log/file.ts")).offenders.join("\n")).toMatch(/node:fs/);
    expect(walk(join(CORE_SRC, "testing/fixtures.ts")).offenders.join("\n")).toMatch(/fileURLToPath|node:/);
    expect(walk(join(RAIL_SRC, "node.ts")).offenders.join("\n")).toMatch(/node:fs/);
  });
});
