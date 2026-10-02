// @laisee/core/verify runs in the offline verifier page: its whole relative import graph must stay free of
// node: built-ins (and of FileLogStore), and must not reach signing-only code paths it does not need.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));
const IMPORT_RE = /(?:import|export)\s[^"']*?from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;
const NODE_BUILTINS = /^(node:|fs$|fs\/|path$|crypto$|os$|child_process$|url$|stream$|util$|buffer$)/;

function resolveTs(fromFile: string, spec: string): string {
  const base = resolve(dirname(fromFile), spec);
  for (const candidate of [`${base}.ts`, join(base, "index.ts")]) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      // try the next candidate
    }
  }
  throw new Error(`cannot resolve ${spec} from ${fromFile}`);
}

function importGraph(entry: string): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (graph.has(file)) continue;
    const specs = [...readFileSync(file, "utf8").matchAll(IMPORT_RE)].map((m) => m[1] ?? m[2] ?? "");
    graph.set(file, specs);
    for (const spec of specs) if (spec.startsWith(".") && !spec.endsWith(".json")) queue.push(resolveTs(file, spec));
  }
  return graph;
}

describe("@laisee/core/verify is browser-safe", () => {
  const graph = importGraph(join(SRC, "verify/index.ts"));

  it("imports no Node built-ins anywhere in its graph", () => {
    const offenders = [...graph].flatMap(([file, specs]) => specs.filter((s) => NODE_BUILTINS.test(s)).map((s) => `${file}: ${s}`));
    expect(offenders).toEqual([]);
  });

  it("does not pull in the file store, the key-file loader or the orchestrator", () => {
    const files = [...graph.keys()].map((f) => f.slice(SRC.length));
    expect(files).toContain("verify/index.ts");
    for (const banned of ["log/file-store.ts", "log/file.ts", "crypto/key-file.ts", "orchestrator/index.ts", "testing/index.ts"]) {
      expect(files).not.toContain(banned);
    }
  });

  it("keeps @laisee/core/crypto, vc and log free of Node built-ins too", () => {
    for (const entry of ["crypto/index.ts", "vc/index.ts", "log/index.ts"]) {
      const offenders = [...importGraph(join(SRC, entry))].flatMap(([, specs]) => specs.filter((s) => NODE_BUILTINS.test(s)));
      expect(offenders, entry).toEqual([]);
    }
  });
});
