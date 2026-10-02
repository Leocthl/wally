// @vitest-environment node
// The production build of the booth page evaluates no code from strings: no eval, no new Function, no Function(...).
// The schema validators are compiled ahead of time (packages/core/src/schema/compiled), so a strict CSP without
// 'unsafe-eval' can serve the page. The build also carries the on-device data (scenario table, recordings).
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const WEB = join(import.meta.dirname, "..");
const EVAL = /\bnew\s+Function\b|(?<![\w$.])Function\s*\(|(?<![\w$.])eval\s*\(/;
let outDir = "";
let scripts: readonly { readonly name: string; readonly text: string }[] = [];

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(join(dir, d.name)) : [join(dir, d.name)]));
}

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), "wally-web-build-"));
  await build({ root: WEB, configFile: join(WEB, "vite.config.ts"), logLevel: "silent", build: { outDir, emptyOutDir: true } });
  scripts = files(outDir)
    .filter((f) => f.endsWith(".js"))
    .map((f) => ({ name: f.slice(outDir.length + 1), text: readFileSync(f, "utf8") }));
}, 120_000);

afterAll(() => {
  rmSync(outDir, { recursive: true, force: true });
});

describe("booth page build", () => {
  it("emits scripts", () => {
    expect(scripts.length).toBeGreaterThan(0);
  });

  it("evaluates no code from strings (no eval, new Function or Function(...))", () => {
    const hits = scripts.flatMap(({ name, text }) => {
      const at = text.search(EVAL);
      return at < 0 ? [] : [`${name}: ${text.slice(Math.max(0, at - 60), at + 60)}`];
    });
    expect(hits).toEqual([]);
  });

  it("bundles the on-device data: the booth table, the derived listings and the planner records", () => {
    const all = scripts.map((s) => s.text).join("\n");
    for (const marker of ["lst_vintageTee", "lst_visitorText", "booth-unverified", "booth-off-category", "recorded@"]) expect(all).toContain(marker);
  });
});
