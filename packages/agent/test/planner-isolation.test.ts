// T-I4: the planner has no credentials and no payment tool. Static checks on the planner sources (the
// import-boundary lint covers the same ground for agent src; this test also covers what lint cannot see).
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createReplayPlanner } from "../src/planner/replay-planner";
import { createRulePlanner } from "../src/planner/rule-planner";
import { ALL_FIXTURE_LISTINGS } from "./support/planner-data";

const DIR = fileURLToPath(new URL("../src/planner/", import.meta.url));
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".ts"));
const source = (file: string): string => readFileSync(`${DIR}${file}`, "utf8");
const code = (file: string): string => source(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const imports = (file: string): readonly string[] => [...source(file).matchAll(/(?:from|import)\s+"([^"]+)"/g)].map((m) => m[1] ?? "");

const ALLOWED = /^(\.\/[a-z-]+|@laisee\/core\/(ports|generated|schema)|node:fs|node:path)$/;

describe("planner sources (T-I4)", () => {
  it("has the planner files", () => {
    expect(FILES.length).toBeGreaterThanOrEqual(12);
  });

  it.each(FILES)("%s imports only core types and schemas, relative files, and node:fs or node:path", (file) => {
    for (const spec of imports(file)) expect(spec, `${file} imports ${spec}`).toMatch(ALLOWED);
  });

  it.each(FILES)("%s never imports signing, log, orchestrator, rail, engine or fakes", (file) => {
    expect(source(file)).not.toMatch(/@laisee\/(rail-sim|core\/(crypto|vc|log|orchestrator|verify|testing|executor|engine|rules|packet|explain))/);
    expect(source(file)).not.toMatch(/node:(crypto|child_process|net|http|https|dns|vm|worker_threads)/);
  });

  it.each(FILES)("%s reads no environment and names no secret, key or card field", (file) => {
    expect(code(file)).not.toMatch(/process\.|import\.meta\.env/);
    expect(code(file)).not.toMatch(/ANTHROPIC|API_KEY|TYPESAFE|SECRET|PRIVATE|PASSWORD|\bcvv\b|\bpan\b|card_handle|handle\b/i);
  });

  it.each(FILES)("%s has no console output and stays small", (file) => {
    expect(code(file)).not.toMatch(/console\./);
    expect(source(file).split("\n").length).toBeLessThanOrEqual(400);
  });

  it("only the factory takes an env object, and only for PLANNER_PROVIDER and LAYA_URL", () => {
    const names = [...code("factory.ts").matchAll(/env\["([A-Z_]+)"\]/g)].map((m) => m[1]);
    expect([...new Set(names)].sort()).toEqual(["LAYA_URL", "PLANNER_PROVIDER"]);
  });
});

describe("planner objects", () => {
  it("expose propose and alternatives and nothing else: no payment tool, no key, no log", () => {
    expect(Object.keys(createRulePlanner({ catalogue: ALL_FIXTURE_LISTINGS })).sort()).toEqual(["alternatives", "propose"]);
    expect(Object.keys(createReplayPlanner({ records: [] })).sort()).toEqual(["alternatives", "propose"]);
  });
});
