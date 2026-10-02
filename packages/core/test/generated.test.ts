import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

describe("generated types", () => {
  it("match schemas/ (run `pnpm gen:types` if this fails)", () => {
    const run = () =>
      execFileSync(process.execPath, ["scripts/gen-types.mjs", "--check"], { cwd: ROOT, encoding: "utf8", stdio: "pipe" });
    expect(run).not.toThrow();
  }, 30_000);
});
