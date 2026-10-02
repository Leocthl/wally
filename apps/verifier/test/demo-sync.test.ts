// The SIMULATED demo files are byte copies of the core golden files; when core regenerates them, copy again
// (see src/demo/index.ts). Read from disk, not imported: the verifier may not import core test files.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO } from "../src/demo";

// join on import.meta.dirname: Vite rewrites `new URL(path, import.meta.url)` into a served asset URL.
const GOLDEN = join(import.meta.dirname, "..", "..", "..", "packages", "core", "test", "golden");
const golden = (name: string): string => readFileSync(join(GOLDEN, name), "utf8");

describe("demo files", () => {
  it.each([
    ["demo-log.jsonl", DEMO.log],
    ["demo-public-keys.json", DEMO.keys],
    ["demo-checkpoint.json", DEMO.checkpoint],
  ])("%s matches the core golden file", (name, text) => {
    expect(text).toBe(golden(name));
  });

  it("are labelled SIMULATED test keys, not the booth keys", () => {
    expect(JSON.parse(DEMO.keys).note).toMatch(/SIMULATED.*Not the booth keys/);
  });
});
