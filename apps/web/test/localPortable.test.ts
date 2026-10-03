// @vitest-environment node
// Static guard: the portable booth backend and the on-device client run in a browser, so they import no node:*
// module, no server file, and nothing at runtime from @wally/agent/judge (its index reads files at load; only types
// may come from there). The planner index is browser-loadable (its file loader is only called by the server).
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const WEB = join(import.meta.dirname, "..");
const DIRS = ["src/booth/backend", "src/api/local"];

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const path = join(dir, d.name);
    if (d.isDirectory()) return files(path);
    return /\.tsx?$/.test(d.name) ? [path] : [];
  });
}

interface ImportRef {
  readonly typeOnly: boolean;
  readonly specifier: string;
}

/** Every static import/export-from (multi-line too), side-effect import, dynamic import() and require() specifier. */
function importsOf(text: string): readonly ImportRef[] {
  const from = [...text.matchAll(/(?:^|\n)\s*(?:import|export)\s+(type\s+)?[^;]*?\bfrom\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: m[1] !== undefined, specifier: m[2] ?? "" }));
  const bare = [...text.matchAll(/(?:^|\n)\s*import\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: false, specifier: m[1] ?? "" }));
  const calls = [...text.matchAll(/(?<![.#\w])(?:import|require)\s*\(\s*["']([^"']+)["']/g)].map((m) => ({ typeOnly: false, specifier: m[1] ?? "" }));
  return [...from, ...bare, ...calls];
}

const sources = DIRS.flatMap((d) => files(join(WEB, d))).map((path) => ({ path: relative(WEB, path), refs: importsOf(readFileSync(path, "utf8")) }));

describe("portable backend and on-device client", () => {
  it("has source files and imports to check", () => {
    expect(sources.length).toBeGreaterThan(10);
    expect(sources.flatMap((s) => s.refs).length).toBeGreaterThan(50);
  });

  it.each(sources.map((s) => [s.path, s.refs] as const))("%s imports no node: module, no server file, no runtime judge index", (_path, refs) => {
    for (const { specifier, typeOnly } of refs) {
      expect(specifier).not.toMatch(/^node:/);
      expect(specifier).not.toMatch(/^(\.\.\/)+server\//);
      expect(specifier).not.toMatch(/^@wally\/(core\/(log\/file|testing\/fixtures)|rail-sim\/node)$/);
      if (specifier === "@wally/agent/judge") expect(typeOnly, "@wally/agent/judge may be imported for types only").toBe(true);
    }
  });

  it("the scan sees a multi-line import and a type-only import", () => {
    const refs = importsOf('import {\n  a,\n  b,\n} from "node:fs";\nimport type { X } from "@wally/agent/judge";\nconst y = this.#require();');
    expect(refs).toEqual([
      { typeOnly: false, specifier: "node:fs" },
      { typeOnly: true, specifier: "@wally/agent/judge" },
    ]);
  });
});
