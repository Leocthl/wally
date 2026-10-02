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

describe("factory.ts is the one swap point", () => {
  it("only the factory names the engine, the fake rail or the fake merchant", () => {
    const offenders = sources.filter((s) => s.file !== "factory.ts" && /@laisee\/core\/engine|FakeRail|FakeMerchant|FakeJudge|FakePlanner/.test(s.text)).map((s) => s.file);
    expect(offenders).toEqual([]);
  });

  it("rail-sim is imported for types only, anywhere but the factory", () => {
    const offenders = sources
      .filter((s) => s.file !== "factory.ts")
      .filter((s) => /^import\s+(?!type\b)[^;]*from\s+"@laisee\/rail-sim"/m.test(s.text))
      .map((s) => s.file);
    expect(offenders).toEqual([]);
  });

  it("every dependency can be replaced through createComponents without touching anything else", () => {
    const rail = () => { throw new Error("replaced"); };
    const swapped = createComponents({ engine: referenceEngine, createRail: rail as never });
    expect(swapped.engine).toBe(referenceEngine);
    expect(swapped.createRail).toBe(rail);
    expect(Object.keys(createComponents()).sort()).toEqual(["createMerchant", "createRail", "engine", "executor"]);
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

  it("still lists the stand-ins as not real, so a half-swapped factory cannot claim product evidence", () => {
    const c = describeComponents("core@0.3.1+9be9705");
    expect([c.rail.real, c.merchant.real, c.executor.real, c.cartBuilder.real]).toEqual([false, false, false, false]);
  });
});
