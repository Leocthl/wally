// The sentence-to-rules compiler (lane m-qwen) is model-facing code: it reads no environment, holds no key and
// imports nothing from signing, log, orchestrator or rail code. It only suggests rules; sealing happens elsewhere.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const DIR = fileURLToPath(new URL("../src/compiler/", import.meta.url));
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".ts"));
const source = (file: string): string => readFileSync(`${DIR}${file}`, "utf8");
const code = (file: string): string => source(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const imports = (file: string): readonly string[] => [...source(file).matchAll(/(?:from|import)\s+"([^"]+)"/g)].map((m) => m[1] ?? "");
const ALLOWED = /^(\.\/[a-z-]+|\.\.\/planner\/local|@laisee\/core\/(generated|schema|config))$/;

describe("compiler sources", () => {
  it("has the compiler files", () => {
    expect(FILES).toEqual(expect.arrayContaining(["compile-mandate.ts", "rules.ts", "labels.ts", "prompt.ts", "answer.ts", "config.ts", "index.ts"]));
  });

  it.each(FILES)("%s imports only core types, schemas and config, its own files and the local chat client", (file) => {
    for (const spec of imports(file)) expect(spec, `${file} imports ${spec}`).toMatch(ALLOWED);
  });

  it.each(FILES)("%s reads no environment, names no secret, never signs and has no console output", (file) => {
    expect(code(file)).not.toMatch(/process\.|import\.meta\.env|console\./);
    expect(code(file)).not.toMatch(/API_KEY|SECRET|PRIVATE|\bcvv\b|\bpan\b|sign\(|signer/i);
    expect(source(file).split("\n").length).toBeLessThanOrEqual(400);
  });
});
