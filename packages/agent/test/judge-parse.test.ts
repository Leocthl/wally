import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validateJudgeRecord } from "@laisee/core/schema";
import { averageDistributions } from "../src/judge/average";
import { parseSystemOneResponse } from "../src/judge/parse";
import { planRows } from "../src/judge/plan";
import { JUDGE_QUESTIONS, QUESTION_OPTIONS } from "../src/judge/questions";
import { BASE_DISTRIBUTIONS, CLEAN_USAGE, answerFor, wireResponse, type Distributions } from "./support/wire";

const rows = planRows(true);
const canonicalRows = planRows(false);
const strict = { requireUsage: true };

function failureOf(body: unknown, r = rows, opts = strict) {
  const result = parseSystemOneResponse(body, r, opts);
  if (result.ok) throw new Error("expected a parse failure");
  return result;
}

describe("parseSystemOneResponse: valid responses", () => {
  it("returns the four questions in canonical option order", () => {
    const result = parseSystemOneResponse(wireResponse(rows), rows, strict);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.value.answers)).toEqual([...JUDGE_QUESTIONS]);
    for (const q of JUDGE_QUESTIONS) {
      expect(Object.keys(result.value.answers[q])).toEqual([...QUESTION_OPTIONS[q]]);
    }
    expect(result.value.answers.injection_risk.clean).toBeCloseTo(0.7, 6);
  });

  it("averages the rotations back into the canonical option order", () => {
    const perRotation = [0.9, 0.7, 0.5];
    const response = wireResponse(rows);
    const edited = {
      ...response,
      answers: {
        ...response.answers,
        injection_risk__r0: answerFor({ clean: 0.9, suspicious: 0.06, injection: 0.04 }),
        injection_risk__r1: answerFor({ clean: 0.7, suspicious: 0.2, injection: 0.1 }),
        injection_risk__r2: answerFor({ clean: 0.5, suspicious: 0.3, injection: 0.2 }),
      },
    };
    const result = parseSystemOneResponse(edited, rows, strict);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const mean = perRotation.reduce((a, b) => a + b, 0) / perRotation.length;
    expect(result.value.answers.injection_risk.clean).toBeCloseTo(mean, 6);
    expect(result.value.answers.injection_risk.suspicious).toBeCloseTo((0.06 + 0.2 + 0.3) / 3, 6);
    expect(result.value.answers.injection_risk.injection).toBeCloseTo((0.04 + 0.1 + 0.2) / 3, 6);
  });

  it("parses the canonical (non-rotated) plan", () => {
    const result = parseSystemOneResponse(wireResponse(canonicalRows), canonicalRows, strict);
    expect(result.ok).toBe(true);
  });

  it("reads model and routing model for the record", () => {
    const result = parseSystemOneResponse(wireResponse(rows), rows, strict);
    expect(result.ok && result.value.model).toBe("laya-rl-agent");
    expect(result.ok && result.value.routingModel).toBe("typed-decisions");
  });

  it("ignores extra answers and extra top-level fields", () => {
    const response = { ...wireResponse(rows), extra: 1, answers: { ...wireResponse(rows).answers, unrelated: answerFor({ a: 1 }) } };
    expect(parseSystemOneResponse(response, rows, strict).ok).toBe(true);
  });

  it("accepts a missing usage block only when the provider does not require it", () => {
    const noUsage = { ...wireResponse(rows), usage: undefined };
    expect(parseSystemOneResponse(noUsage, rows, { requireUsage: false }).ok).toBe(true);
    expect(failureOf(noUsage).reason).toBe("missing_usage");
  });
});

describe("parseSystemOneResponse: strict failures (all become status ERROR)", () => {
  it.each([null, undefined, 5, "text", [], true])("rejects a non-object body: %j", (body) => {
    expect(failureOf(body).reason).toBe("invalid_shape");
  });

  it("rejects a response without answers", () => {
    expect(failureOf({ usage: CLEAN_USAGE }).reason).toBe("invalid_shape");
    expect(failureOf({ usage: CLEAN_USAGE, answers: [] }).reason).toBe("invalid_shape");
  });

  it("rejects an empty answers object (the server answers 200 to zero questions)", () => {
    expect(failureOf({ usage: { input_tokens: 0, output_tokens: 0 }, answers: {} }).reason).toMatch(/missing_usage|invalid_shape/);
  });

  it("rejects a missing rotation answer", () => {
    const response = wireResponse(rows);
    const { scope_fit__r1: _dropped, ...rest } = response.answers;
    expect(failureOf({ ...response, answers: rest }).reason).toBe("invalid_shape");
  });

  it("rejects an unknown label inside probabilities", () => {
    const response = wireResponse(rows);
    const bad = { ...response.answers, seller_risk__r0: answerFor({ low_risk: 0.5, high_risk: 0.4, maybe: 0.1 }) };
    expect(failureOf({ ...response, answers: bad }).reason).toBe("unknown_label");
  });

  it("rejects an unknown label in choice", () => {
    const response = wireResponse(rows);
    const bad = { ...response.answers, scope_fit__r0: answerFor({ in_scope: 0.8, out_of_scope: 0.2 }, "perhaps") };
    expect(failureOf({ ...response, answers: bad }).reason).toBe("unknown_label");
  });

  it("rejects a missing probability", () => {
    const response = wireResponse(rows);
    const bad = { ...response.answers, scope_fit__r0: answerFor({ in_scope: 1 }) };
    expect(failureOf({ ...response, answers: bad }).reason).toBe("missing_probability");
  });

  it.each([
    ["do not sum to 1", { in_scope: 0.5, out_of_scope: 0.2 }],
    ["sum above 1", { in_scope: 0.9, out_of_scope: 0.9 }],
    ["are negative", { in_scope: 1.2, out_of_scope: -0.2 }],
    ["exceed 1", { in_scope: 1.5, out_of_scope: -0.5 }],
  ])("rejects probabilities that %s", (_name, probs) => {
    const response = wireResponse(rows);
    const bad = { ...response.answers, scope_fit__r0: answerFor(probs) };
    expect(failureOf({ ...response, answers: bad }).reason).toBe("bad_probabilities");
  });

  it.each([
    ["a string", "0.8"],
    ["null", null],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["an object", { v: 0.8 }],
  ])("rejects a probability that is %s", (_name, value) => {
    const response = wireResponse(rows);
    const answer = { ...answerFor({ in_scope: 0.8, out_of_scope: 0.2 }), probabilities: { in_scope: value, out_of_scope: 0.2 } };
    expect(failureOf({ ...response, answers: { ...response.answers, scope_fit__r0: answer } }).reason).toBe("bad_probabilities");
  });

  it("rejects a wrong answer type and a non-object probabilities field", () => {
    const response = wireResponse(rows);
    const wrongType = { ...answerFor({ in_scope: 0.8, out_of_scope: 0.2 }), type: "score" };
    expect(failureOf({ ...response, answers: { ...response.answers, scope_fit__r0: wrongType } }).reason).toBe("invalid_shape");
    const noProbs = { type: "choice", choice: "in_scope" };
    expect(failureOf({ ...response, answers: { ...response.answers, scope_fit__r0: noProbs } }).reason).toBe("invalid_shape");
  });
});

describe("parseSystemOneResponse: truncation hides the tail, so it is an error", () => {
  const truncated = (patch: Record<string, unknown>) => ({ ...wireResponse(rows), usage: { ...CLEAN_USAGE, ...patch } });

  it("flags usage.truncated", () => {
    const result = failureOf(truncated({ truncated: true, truncated_questions: ["injection_risk__r0"] }));
    expect(result.reason).toBe("truncated");
    expect(result.inputTruncated).toBe(true);
  });

  it("flags state_tokens_dropped > 0 even when truncated says false", () => {
    const result = failureOf(truncated({ state_tokens_dropped: 12 }));
    expect(result.reason).toBe("truncated");
    expect(result.inputTruncated).toBe(true);
  });

  it("flags a non-empty truncated_questions list", () => {
    expect(failureOf(truncated({ truncated_questions: ["scope_fit__r1"] })).inputTruncated).toBe(true);
  });

  it("does not trust answers that arrive with a truncation flag", () => {
    const result = parseSystemOneResponse(truncated({ truncated: true }), rows, strict);
    expect(result.ok).toBe(false);
  });

  it("rejects a usage block with wrong types when usage is required", () => {
    expect(failureOf(truncated({ truncated: "no" })).reason).toBe("invalid_shape");
    expect(failureOf(truncated({ state_tokens_dropped: "0" })).reason).toBe("invalid_shape");
    expect(failureOf({ ...wireResponse(rows), usage: "none" }).reason).toBe("invalid_shape");
  });

  it("reports input_truncated false for ordinary failures", () => {
    expect(failureOf({ answers: {}, usage: CLEAN_USAGE }).inputTruncated).toBe(false);
  });
});

describe("parseSystemOneResponse properties", () => {
  it("never throws, whatever JSON arrives (fail closed)", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (body) => {
        const result = parseSystemOneResponse(body, rows, strict);
        expect(typeof result.ok).toBe("boolean");
      }),
      { numRuns: 400 },
    );
  });

  it("only returns OK answers that validate as a JudgeRecord and sum to 1 per question", () => {
    const simplex = (labels: readonly string[]) =>
      fc.array(fc.double({ min: 0.001, max: 1, noNaN: true }), { minLength: labels.length, maxLength: labels.length }).map((ws) => {
        const total = ws.reduce((a, b) => a + b, 0);
        return Object.fromEntries(labels.map((l, i) => [l, (ws[i] ?? 0) / total]));
      });
    const dists = fc.record({
      scope_fit: simplex(QUESTION_OPTIONS.scope_fit),
      injection_risk: simplex(QUESTION_OPTIONS.injection_risk),
      seller_risk: simplex(QUESTION_OPTIONS.seller_risk),
      escalate_or_proceed: simplex(QUESTION_OPTIONS.escalate_or_proceed),
    });
    fc.assert(
      fc.property(dists, (d: Distributions) => {
        const result = parseSystemOneResponse(wireResponse(rows, d), rows, strict);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        for (const q of JUDGE_QUESTIONS) {
          const values = Object.values(result.value.answers[q]);
          expect(values.every((v) => v >= 0 && v <= 1)).toBe(true);
          expect(values.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
        }
        const record = {
          provider: "laya",
          model: "typed-decisions",
          version: "x",
          status: "OK",
          latency_ms: 1,
          shadow: false,
          answers: result.value.answers,
        };
        expect(validateJudgeRecord(record).ok).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

describe("averageDistributions", () => {
  const labels = ["a", "b", "c"] as const;
  const weight = fc.double({ min: 0.001, max: 1, noNaN: true });
  const dist = fc.tuple(weight, weight, weight).map(([x, y, z]) => {
    const total = x + y + z;
    return { a: x / total, b: y / total, c: z / total };
  });

  it("is the per-label arithmetic mean, normalised and keyed in label order", () => {
    const avg = averageDistributions([{ a: 0.6, b: 0.4, c: 0 }, { a: 0.2, b: 0.2, c: 0.6 }], labels);
    expect(Object.keys(avg)).toEqual(["a", "b", "c"]);
    expect(avg.a).toBeCloseTo(0.4, 6);
    expect(avg.b).toBeCloseTo(0.3, 6);
    expect(avg.c).toBeCloseTo(0.3, 6);
  });

  it("does not depend on the order of the rotations (property)", () => {
    fc.assert(
      fc.property(fc.array(dist, { minLength: 1, maxLength: 5 }), (ds) => {
        const forward = averageDistributions(ds, labels);
        const backward = averageDistributions([...ds].reverse(), labels);
        for (const l of labels) expect(forward[l]).toBeCloseTo(backward[l] ?? Number.NaN, 5);
      }),
    );
  });

  it("stays a distribution and is bounded by the extremes of its inputs (property)", () => {
    fc.assert(
      fc.property(fc.array(dist, { minLength: 1, maxLength: 5 }), (ds) => {
        const avg = averageDistributions(ds, labels);
        expect(Object.values(avg).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
        for (const l of labels) {
          const column = ds.map((d) => d[l]);
          expect(avg[l] ?? Number.NaN).toBeGreaterThanOrEqual(Math.min(...column) - 1e-5);
          expect(avg[l] ?? Number.NaN).toBeLessThanOrEqual(Math.max(...column) + 1e-5);
        }
      }),
    );
  });

  it("does not mutate its input", () => {
    const input = [{ a: 0.5, b: 0.25, c: 0.25 }];
    const copy = JSON.stringify(input);
    averageDistributions(input, labels);
    expect(JSON.stringify(input)).toBe(copy);
  });

  it("BASE_DISTRIBUTIONS are valid distributions (test helper sanity)", () => {
    for (const q of JUDGE_QUESTIONS) {
      expect(Object.values(BASE_DISTRIBUTIONS[q]).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    }
  });
});
