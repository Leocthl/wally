import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createComponents, describeComponents } from "../src/factory";
import { referenceEngine } from "./support/reference-engine";

const srcDir = fileURLToPath(new URL("../src", import.meta.url));
const sources = (readdirSync(srcDir, { recursive: true, encoding: "utf8" }) as string[])
  .filter((f) => f.endsWith(".ts"))
  .map((f) => ({ file: f, text: readFileSync(join(srcDir, f), "utf8") }));

/** Value imports (not `import type`) of `names` from `module`, found by reading the import statements. */
function valueImports(text: string, module: string): readonly string[] {
  const statements = [...text.matchAll(/^import\s+(?!type\b)\{([^}]*)\}\s+from\s+"([^"]+)"/gm)];
  return statements
    .filter((m) => m[2] === module)
    .flatMap((m) => (m[1] ?? "").split(",").map((n) => n.trim().replace(/^type\s+.*/, "").split(/\s+as\s+/)[0] ?? ""))
    .filter((n) => n.length > 0);
}

// The implementations a swap replaces: only factory.ts may import them as values.
const SWAPPABLE: readonly (readonly [module: string, names: readonly string[]])[] = [
  ["@laisee/core/engine", ["engine", "createEngine"]],
  ["@laisee/core/executor", ["createExecutor"]],
  ["@laisee/rail-sim", ["RailSim", "MerchantStub"]],
  ["@laisee/agent/judge", ["SystemOneJudge", "ReplayJudge", "createJudgeFromEnv"]],
];

describe("factory.ts is the one swap point", () => {
  it("only the factory imports the engine, the executor, the rail, the merchant or the judge implementation", () => {
    const offenders = sources
      .filter((s) => s.file !== "factory.ts")
      .flatMap((s) => SWAPPABLE.flatMap(([module, names]) => valueImports(s.text, module).filter((n) => names.includes(n)).map((n) => `${s.file}: ${n}`)));
    expect(offenders).toEqual([]);
  });

  it("the factory does import all of them, so the check above reads something", () => {
    const factory = sources.find((s) => s.file === "factory.ts")?.text ?? "";
    for (const [module, names] of SWAPPABLE.slice(0, 3)) expect(valueImports(factory, module).some((n) => names.includes(n)), module).toBe(true);
    expect(valueImports(factory, "@laisee/agent/judge")).toContain("SystemOneJudge");
  });

  it("no fake is imported into src: from core's testing module only the in-memory log store, fixtures and the clean answers", () => {
    const fakes = sources.filter((s) => /\bFake[A-Z]\w*/.test(s.text.replace(/^\s*\/\/.*$/gm, ""))).map((s) => s.file);
    expect(fakes).toEqual([]);
    const allowed = new Set(["MemoryLogStore", "CLEAN_ANSWERS"]);
    const stray = sources.flatMap((s) => valueImports(s.text, "@laisee/core/testing").filter((n) => !allowed.has(n)).map((n) => `${s.file}: ${n}`));
    expect(stray).toEqual([]);
  });

  it("every dependency can be replaced through createComponents without touching anything else", () => {
    const governed = async () => { throw new Error("replaced"); };
    const swapped = createComponents({ governed });
    expect(swapped.governed).toBe(governed);
    expect(swapped.engine).toBe(createComponents().engine);
    expect(Object.keys(createComponents()).sort()).toEqual(["engine", "governed", "ungoverned"]);
  });

  it("the reference engine stays a test file: nothing under src names it", () => {
    expect(sources.filter((s) => /reference-engine|referenceEngine|referenceDecide/.test(s.text)).map((s) => s.file)).toEqual([]);
    expect(referenceEngine.decide).toBeTypeOf("function");
  });
});

describe("describeComponents reads the engine version, it does not trust a declaration", () => {
  it("calls the always-DENY stub and the test double not real", () => {
    expect(describeComponents("core@0.0.0+stub").engine.real).toBe(false);
    expect(describeComponents("harness-reference-double@test").engine.real).toBe(false);
  });

  it("calls an engine with an ordinary version real", () => {
    expect(describeComponents("core@0.3.1+9be9705").engine.real).toBe(true);
  });

  it("lists the cart builder as the one stand-in left, so a result cannot claim product evidence yet", () => {
    const c = describeComponents("core@0.3.1+9be9705");
    expect([c.engine.real, c.rail.real, c.merchant.real, c.executor.real, c.judge.real]).toEqual([true, true, true, true, true]);
    expect(c.cartBuilder.real).toBe(false);
    expect(c.cartBuilder.note).toMatch(/@laisee\/core\/cart/);
  });
});
