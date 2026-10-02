// Import-boundary lint (X-03): runs the repo ESLint config on sample sources placed in each package.
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const RULE = "@typescript-eslint/no-restricted-imports";
const eslint = new ESLint({ cwd: ROOT });

async function violations(filePath: string, code: string): Promise<number> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((m) => m.ruleId === RULE).length;
}

const value = (spec: string) => `import * as m from "${spec}";\nexport const x = m;\n`;
const typeOnly = (spec: string) => `import type * as m from "${spec}";\nexport type X = typeof m;\n`;

describe("agent imports (I4)", () => {
  const src = "packages/agent/src/planner/sample.ts";
  it.each(["@laisee/rail-sim", "@laisee/core/crypto", "@laisee/core/vc", "@laisee/core/log", "@laisee/core/orchestrator", "@laisee/core/testing", "../../../rail-sim/src/index", "@laisee/core/src/ports"])(
    "blocks %s in agent src",
    async (spec) => expect(await violations(src, value(spec))).toBeGreaterThan(0),
  );
  it.each(["@laisee/core/ports", "@laisee/core/generated", "@laisee/core/schema", "@laisee/core/config"])(
    "allows %s in agent src",
    async (spec) => expect(await violations(src, value(spec))).toBe(0),
  );
  it("allows fakes in agent tests but still blocks rail-sim there", async () => {
    expect(await violations("packages/agent/test/sample.test.ts", value("@laisee/core/testing"))).toBe(0);
    expect(await violations("packages/agent/test/sample.test.ts", value("@laisee/rail-sim"))).toBeGreaterThan(0);
  });
});

describe("verifier imports", () => {
  const src = "apps/verifier/src/sample.ts";
  it("allows @laisee/core/verify and type-only generated or ports", async () => {
    expect(await violations(src, value("@laisee/core/verify"))).toBe(0);
    expect(await violations(src, typeOnly("@laisee/core/generated"))).toBe(0);
    expect(await violations(src, typeOnly("@laisee/core/ports"))).toBe(0);
  });
  it.each(["@laisee/core/engine", "@laisee/core/generated", "@laisee/rail-sim", "@laisee/core/crypto", "../../../packages/core/src/verify"])(
    "blocks value import of %s",
    async (spec) => expect(await violations(src, value(spec))).toBeGreaterThan(0),
  );
});

describe("harness imports", () => {
  const src = "packages/harness/src/sample.ts";
  it("uses package exports, never relative copies", async () => {
    expect(await violations(src, value("@laisee/core/engine"))).toBe(0);
    expect(await violations(src, value("@laisee/rail-sim"))).toBe(0);
    expect(await violations(src, value("../../core/src/engine/stub"))).toBeGreaterThan(0);
    expect(await violations(src, value("../../rail-sim/src/index"))).toBeGreaterThan(0);
  });
});
