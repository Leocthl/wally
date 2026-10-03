// The photo reader is model-facing code: it reads no environment, holds no key, imports nothing from signing, log,
// orchestrator or rail code, uses no node: module (it runs in the browser too), logs nothing, and stays small.
// It reads a picture into words; sealing, deciding and paying happen elsewhere.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const DIR = fileURLToPath(new URL("../src/vision/", import.meta.url));
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".ts"));
const source = (file: string): string => readFileSync(`${DIR}${file}`, "utf8");
const code = (file: string): string => source(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const imports = (file: string): readonly string[] => [...source(file).matchAll(/(?:from|import)\s+"([^"]+)"/g)].map((m) => m[1] ?? "");
const ALLOWED = /^(\.\/[a-z0-9-]+|\.\.\/planner\/local)$/;

describe("vision sources", () => {
  it("has the photo reader files", () => {
    expect(FILES).toEqual(expect.arrayContaining(["describe.ts", "answer.ts", "prompt.ts", "image.ts", "vocab.ts", "color.ts", "palette.ts", "match.ts", "base64.ts", "index.ts"]));
  });

  it.each(FILES)("%s imports only its own files and the local chat client", (file) => {
    for (const spec of imports(file)) expect(spec, `${file} imports ${spec}`).toMatch(ALLOWED);
  });

  it.each(FILES)("%s reads no environment, names no secret or card field, uses no node module or Buffer, and never logs", (file) => {
    expect(code(file)).not.toMatch(/process\.|import\.meta\.env|console\.|Buffer\b|require\(/);
    expect(code(file)).not.toMatch(/API_KEY|SECRET|PRIVATE|PASSWORD|\bcvv\b|\bpan\b|card_handle|sign\(|signer/i);
    expect(source(file)).not.toMatch(/node:/);
    expect(source(file).split("\n").length).toBeLessThanOrEqual(400);
  });

  it("makes no network call of its own: the chat client is the only way out", () => {
    for (const file of FILES) expect(code(file), file).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon/);
  });
});
