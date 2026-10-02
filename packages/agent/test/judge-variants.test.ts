import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WORDING_VARIANTS, variantById } from "../src/judge/fit/variants";
import { JUDGE_QUESTION_DEFS, JUDGE_QUESTIONS, QUESTION_OPTIONS, SHIPPED_WORDING_VARIANT } from "../src/judge/questions";
import { SystemOneJudge } from "../src/judge/system-one-judge";
import { demoInput } from "./support/inputs";
import { startMockSystemOne, type MockSystemOne } from "./support/mock-system-one";

const laya = JSON.parse(readFileSync(new URL("../../../services/laya/fixtures/questions.json", import.meta.url), "utf8")) as {
  questions: Record<string, unknown>;
};
/** Laya shares a 256-token header between a question's options; this keeps every variant well inside it. */
const MAX_WORDS_PER_OPTION = 30;
const words = (s: string): number => s.split(/\s+/).filter((w) => w.length > 0).length;

describe("wording variants", () => {
  it("are a bounded, uniquely named set that starts with the v0 baseline", () => {
    const ids = WORDING_VARIANTS.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("v0");
    expect(ids.length).toBeGreaterThanOrEqual(6);
    expect(ids.length).toBeLessThanOrEqual(10);
  });

  it("keep v0 word for word equal to services/laya/fixtures/questions.json (the wording F36 was read off)", () => {
    expect(variantById("v0").questions).toEqual(laya.questions);
  });

  it("change only instructions and criteria text: same four questions, same labels in canonical order", () => {
    for (const v of WORDING_VARIANTS) {
      expect(Object.keys(v.questions), v.id).toEqual([...JUDGE_QUESTIONS]);
      for (const q of JUDGE_QUESTIONS) {
        expect(v.questions[q].type, `${v.id} ${q}`).toBe("choice");
        expect(Object.keys(v.questions[q].criteria), `${v.id} ${q}`).toEqual([...QUESTION_OPTIONS[q]]);
        expect(v.questions[q].instructions.length, `${v.id} ${q}`).toBeGreaterThan(0);
        for (const text of Object.values(v.questions[q].criteria)) expect(words(text), `${v.id} ${q}`).toBeLessThanOrEqual(MAX_WORDS_PER_OPTION);
      }
    }
  });

  it("ship one of the variants as the default, word for word", () => {
    expect(JUDGE_QUESTION_DEFS).toEqual(variantById(SHIPPED_WORDING_VARIANT).questions);
  });

  it("throws on an unknown id", () => {
    expect(() => variantById("v99")).toThrow(/unknown wording variant/);
  });
});

describe("SystemOneJudge questions option", () => {
  let mock: MockSystemOne;
  beforeEach(async () => {
    mock = await startMockSystemOne();
  });
  afterEach(async () => {
    await mock.close();
  });

  const sentQuestions = () => (mock.judgeRequests()[0]?.body as { questions: Record<string, { instructions: string; criteria: unknown }> }).questions;

  it("sends the shipped wording by default", async () => {
    await new SystemOneJudge({ provider: "laya", baseUrl: mock.baseUrl, model: "typed-decisions" }).assess(demoInput("apparel-tee"), { timeoutMs: 2000 });
    expect(sentQuestions()["injection_risk__r0"]?.instructions).toBe(JUDGE_QUESTION_DEFS.injection_risk.instructions);
  });

  it("sends a variant's instructions and criteria on every rotated row when given one", async () => {
    const v = variantById("v5");
    const record = await new SystemOneJudge({ provider: "laya", baseUrl: mock.baseUrl, model: "typed-decisions", questions: v.questions }).assess(demoInput("apparel-tee"), {
      timeoutMs: 2000,
    });
    expect(record.status).toBe("OK");
    const sent = sentQuestions();
    expect(Object.keys(sent)).toHaveLength(9);
    for (const [id, q] of Object.entries(sent)) {
      const base = JUDGE_QUESTIONS.find((name) => id.startsWith(name))!;
      expect(q.instructions).toBe(v.questions[base].instructions);
      expect(q.criteria).toEqual(v.questions[base].criteria);
    }
  });
});
