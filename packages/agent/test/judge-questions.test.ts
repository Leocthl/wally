import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { variantById } from "../src/judge/fit/variants";
import { planRows, rotationOrder, toWireQuestions } from "../src/judge/plan";
import { JUDGE_QUESTION_DEFS, JUDGE_QUESTIONS, QUESTION_OPTIONS } from "../src/judge/questions";

const laya = JSON.parse(
  readFileSync(new URL("../../../services/laya/fixtures/questions.json", import.meta.url), "utf8"),
) as { questions: Record<string, unknown> };

describe("judge question definitions", () => {
  it("keep the v0 baseline word for word equal to services/laya/fixtures/questions.json (drift guard)", () => {
    // The shipped default is the B-19 winner; judge-variants.test.ts checks it equals its variant word for word.
    expect(variantById("v0").questions).toEqual(laya.questions);
  });

  it("list the options in the canonical order of the criteria", () => {
    for (const q of JUDGE_QUESTIONS) {
      expect(Object.keys(JUDGE_QUESTION_DEFS[q].criteria)).toEqual([...QUESTION_OPTIONS[q]]);
    }
  });

  it("use semantic labels only, never boolean words (Laya README)", () => {
    const banned = new Set(["yes", "no", "true", "false"]);
    for (const q of JUDGE_QUESTIONS) for (const label of QUESTION_OPTIONS[q]) expect(banned.has(label)).toBe(false);
  });

  it("are the four canonical questions", () => {
    expect([...JUDGE_QUESTIONS]).toEqual(["scope_fit", "injection_risk", "seller_risk", "escalate_or_proceed"]);
  });
});

describe("rotationOrder", () => {
  it("rotates the option indices", () => {
    expect(rotationOrder(3, 0)).toEqual([0, 1, 2]);
    expect(rotationOrder(3, 1)).toEqual([1, 2, 0]);
    expect(rotationOrder(2, 1)).toEqual([1, 0]);
  });

  it("is a permutation that starts at r, for any k and r (property)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 8 }), fc.nat(), (k, seed) => {
        const r = seed % k;
        const order = rotationOrder(k, r);
        expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: k }, (_, i) => i));
        expect(order[0]).toBe(r);
      }),
    );
  });

  it("gives each option every slot exactly once across the k rotations (property)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 8 }), (k) => {
        for (let slot = 0; slot < k; slot += 1) {
          const seen = Array.from({ length: k }, (_, r) => rotationOrder(k, r)[slot]);
          expect(new Set(seen).size).toBe(k);
        }
      }),
    );
  });
});

describe("planRows", () => {
  it("sends k rotations per question by default: 2 + 3 + 2 + 2 = 9 rows", () => {
    const rows = planRows(true);
    expect(rows).toHaveLength(9);
    expect(rows.map((r) => r.requestId)).toEqual([
      "scope_fit__r0",
      "scope_fit__r1",
      "injection_risk__r0",
      "injection_risk__r1",
      "injection_risk__r2",
      "seller_risk__r0",
      "seller_risk__r1",
      "escalate_or_proceed__r0",
      "escalate_or_proceed__r1",
    ]);
  });

  it("sends the four questions once, in the default option order, when rotations are off", () => {
    const rows = planRows(false);
    expect(rows.map((r) => r.requestId)).toEqual([...JUDGE_QUESTIONS]);
    expect(rows.every((r) => r.optionOrder === null)).toBe(true);
  });
});

describe("toWireQuestions", () => {
  it("builds typed choice questions with option_order only on rotated rows", () => {
    const wire = toWireQuestions(planRows(true));
    expect(Object.keys(wire)).toHaveLength(9);
    expect(wire["injection_risk__r2"]).toEqual({ ...JUDGE_QUESTION_DEFS.injection_risk, option_order: [2, 0, 1] });
    const plain = toWireQuestions(planRows(false));
    expect(plain["scope_fit"]).toEqual(JUDGE_QUESTION_DEFS.scope_fit);
    expect("option_order" in (plain["scope_fit"] ?? {})).toBe(false);
  });

  it("does not mutate the shared definitions", () => {
    const before = JSON.stringify(JUDGE_QUESTION_DEFS);
    toWireQuestions(planRows(true));
    expect(JSON.stringify(JUDGE_QUESTION_DEFS)).toBe(before);
  });
});
