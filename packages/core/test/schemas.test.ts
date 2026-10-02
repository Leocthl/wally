import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  validateBySchemaName,
  validateCardRecord,
  validateCart,
  validateDecision,
  validateJudgeRecord,
  validateMandateCredential,
  VALIDATORS,
} from "../src/schema";

const SCHEMA_DIR = fileURLToPath(new URL("../../../schemas/", import.meta.url));

type Json = Record<string, unknown>;

function schemaFile(name: string): Json {
  return JSON.parse(readFileSync(join(SCHEMA_DIR, name), "utf8")) as Json;
}

function firstExample(name: string): Json {
  const examples = schemaFile(name)["examples"] as Json[];
  return structuredClone(examples[0] as Json);
}

const schemaFiles = readdirSync(SCHEMA_DIR).filter((f) => f.endsWith(".schema.json"));

describe("schema examples", () => {
  it("has a validator for every schema file", () => {
    for (const file of schemaFiles) {
      expect(Object.keys(VALIDATORS)).toContain(file.replace(".schema.json", ""));
    }
  });

  it.each(schemaFiles)("%s: every example validates", (file) => {
    const examples = (schemaFile(file)["examples"] ?? []) as unknown[];
    expect(examples.length).toBeGreaterThan(0);
    for (const example of examples) {
      const result = validateBySchemaName(file.replace(".schema.json", ""), example);
      expect(result.ok ? [] : result.errors).toEqual([]);
    }
  });

  it("fails closed on an unknown schema name", () => {
    expect(validateBySchemaName("nope", {}).ok).toBe(false);
  });
});

describe("negative cases", () => {
  it("rejects a PAN or CVV field on a card record (I8)", () => {
    const card = firstExample("card-record.schema.json");
    expect(validateCardRecord({ ...card, pan: "1".repeat(16) }).ok).toBe(false);
    expect(validateCardRecord({ ...card, cvv: "1".repeat(3) }).ok).toBe(false);
  });

  it("rejects a card purpose that could hold a card number (I8)", () => {
    const card = firstExample("card-record.schema.json");
    expect(validateCardRecord({ ...card, purpose: `order ${"1".repeat(16)}` }).ok).toBe(false);
  });

  it("rejects float money", () => {
    const cart = firstExample("cart.schema.json");
    expect(validateCart({ ...cart, total_minor: 259.5 }).ok).toBe(false);
  });

  it("rejects APPROVE without approved_limit_minor", () => {
    const { explanation: _explanation, ...rest } = firstExample("decision.schema.json");
    const d = { ...rest, outcome: "APPROVE" };
    expect(validateDecision(d).ok).toBe(false);
    expect(validateDecision({ ...d, approved_limit_minor: 55000 }).ok).toBe(true);
  });

  it("rejects ESCALATE without escalation", () => {
    const d = { ...firstExample("decision.schema.json"), outcome: "ESCALATE" };
    expect(validateDecision(d).ok).toBe(false);
    expect(validateDecision({ ...d, escalation: { state: "OPEN", expires_at: "2026-10-03T02:13:00Z" } }).ok).toBe(true);
  });

  it("rejects DENY carrying a limit", () => {
    const d = firstExample("decision.schema.json");
    expect(d["outcome"]).toBe("DENY");
    expect(validateDecision({ ...d, approved_limit_minor: 55000 }).ok).toBe(false);
  });

  it("accepts judge providers laya, jev, replay and nothing else", () => {
    const judge = firstExample("decision.schema.json")["judge"] as Json;
    for (const provider of ["laya", "jev", "replay"]) expect(validateJudgeRecord({ ...judge, provider }).ok).toBe(true);
    for (const provider of ["llm", "other"]) expect(validateJudgeRecord({ ...judge, provider }).ok).toBe(false);
    expect(validateJudgeRecord({ ...judge, provider: "replay", fallback_from: "laya" }).ok).toBe(true);
    expect(validateJudgeRecord({ ...judge, provider: "replay", fallback_from: "replay" }).ok).toBe(false);
  });

  it("requires status ERROR when Laya truncated the input", () => {
    const judge = firstExample("decision.schema.json")["judge"] as Json;
    const { answers: _answers, ...noAnswers } = judge;
    expect(validateJudgeRecord({ ...judge, input_truncated: true }).ok).toBe(false);
    expect(validateJudgeRecord({ ...noAnswers, status: "ERROR", input_truncated: true }).ok).toBe(true);
    expect(validateJudgeRecord({ ...judge, input_truncated: false }).ok).toBe(true);
    expect(validateJudgeRecord({ ...judge, input_truncated: "yes" }).ok).toBe(false);
  });

  it("rejects a credential with a wrong cryptosuite, missing proof or extra field", () => {
    const vc = firstExample("mandate-credential.schema.json");
    const proof = vc["proof"] as Json;
    expect(validateMandateCredential({ ...vc, proof: { ...proof, cryptosuite: "eddsa-rdfc-2022" } }).ok).toBe(false);
    const { proof: _dropped, ...unsigned } = vc;
    expect(validateMandateCredential(unsigned).ok).toBe(false);
    expect(validateMandateCredential({ ...vc, signature: "x" }).ok).toBe(false);
  });

  it("rejects a judge status OK without answers", () => {
    const judge = firstExample("decision.schema.json")["judge"] as Json;
    const { answers: _answers, ...noAnswers } = judge;
    expect(validateJudgeRecord(noAnswers).ok).toBe(false);
    expect(validateJudgeRecord({ ...noAnswers, status: "TIMEOUT" }).ok).toBe(true);
  });
});
