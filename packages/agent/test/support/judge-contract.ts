// Shared JudgePort contract (docs/02 section 9, invariant I5): whatever goes wrong, assess resolves with a
// schema-valid JudgeRecord whose status says what happened. Never throws, never returns answers unless OK.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { JudgeInput, JudgePort } from "@wally/core/ports";
import { validateJudgeRecord } from "@wally/core/schema";
import { JUDGE_QUESTIONS, QUESTION_OPTIONS } from "../../src/judge/questions";

export type Scenario =
  | "ok"
  | "timeout"
  | "http_500"
  | "malformed_json"
  | "unknown_label"
  | "bad_probabilities"
  | "truncated"
  | "unreachable"
  | "pre_aborted"
  | "unknown_input";

export interface ScenarioSetup {
  readonly judge: JudgePort;
  readonly input: JudgeInput;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
  readonly cleanup?: () => Promise<void>;
}

export interface ContractSubject {
  readonly name: string;
  /** Provider expected on every record. */
  readonly provider: JudgePort["provider"];
  /** true for ShadowJudge wrappers. */
  readonly shadow: boolean;
  /** null = the scenario cannot happen for this implementation (a replay judge has no HTTP status). */
  readonly setup: (scenario: Scenario) => Promise<ScenarioSetup | null>;
  /** Scenarios this subject must support. */
  readonly required: readonly Scenario[];
}

const EXPECTED: Readonly<Record<Scenario, { status: "OK" | "TIMEOUT" | "ERROR"; truncated?: boolean }>> = {
  ok: { status: "OK" },
  timeout: { status: "TIMEOUT" },
  pre_aborted: { status: "TIMEOUT" },
  http_500: { status: "ERROR" },
  malformed_json: { status: "ERROR" },
  unknown_label: { status: "ERROR" },
  bad_probabilities: { status: "ERROR" },
  unreachable: { status: "ERROR" },
  unknown_input: { status: "ERROR" },
  truncated: { status: "ERROR", truncated: true },
};

async function run(subject: ContractSubject, scenario: Scenario) {
  const setup = await subject.setup(scenario);
  if (setup === null) return null;
  try {
    const opts = setup.signal === undefined ? { timeoutMs: setup.timeoutMs } : { timeoutMs: setup.timeoutMs, signal: setup.signal };
    return await setup.judge.assess(setup.input, opts);
  } finally {
    await setup.cleanup?.();
  }
}

export function describeJudgeContract(subject: ContractSubject): void {
  describe(`JudgePort contract: ${subject.name}`, () => {
    it("supports the scenarios it is required to support", async () => {
      for (const scenario of subject.required) {
        const setup = await subject.setup(scenario);
        expect(setup, scenario).not.toBeNull();
        await setup?.cleanup?.();
      }
    });

    for (const [scenario, want] of Object.entries(EXPECTED) as [Scenario, (typeof EXPECTED)[Scenario]][]) {
      it(`${scenario}: resolves (never throws) with status ${want.status}`, async () => {
        const record = await run(subject, scenario);
        if (record === null) return;
        expect(record.status).toBe(want.status);
        expect(record.provider).toBe(subject.provider);
        expect(record.shadow).toBe(subject.shadow);
        expect(Number.isInteger(record.latency_ms) && record.latency_ms >= 0).toBe(true);
        expect(record.model.length).toBeGreaterThan(0);
        expect(record.version.length).toBeGreaterThan(0);
        expect(validateJudgeRecord(record).ok).toBe(true);
        expect(record.input_truncated === true).toBe(want.truncated === true);
        if (want.status === "OK") expectCompleteAnswers(record.answers);
        else expect(record.answers).toBeUndefined();
      });
    }
  });
}

function expectCompleteAnswers(answers: unknown): void {
  expect(answers).toBeDefined();
  const bag = answers as Record<string, Record<string, number>>;
  for (const q of JUDGE_QUESTIONS) {
    expect(Object.keys(bag[q] ?? {})).toEqual([...QUESTION_OPTIONS[q]]);
    const values = Object.values(bag[q] ?? {});
    expect(values.every((v) => v >= 0 && v <= 1)).toBe(true);
    expect(values.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 4);
  }
}

/** Property: arbitrary listing text never makes assess throw or return a schema-invalid record. */
export function describeNeverThrows(name: string, make: () => Promise<ScenarioSetup>, runs = 25): void {
  describe(`JudgePort never throws: ${name}`, () => {
    it("returns a valid record for any listing text (property)", async () => {
      const setup = await make();
      try {
        await fc.assert(
          fc.asyncProperty(fc.string({ maxLength: 400 }), async (text) => {
            const record = await setup.judge.assess({ ...setup.input, listingText: text }, { timeoutMs: setup.timeoutMs });
            expect(validateJudgeRecord(record).ok).toBe(true);
            expect(record.status === "OK").toBe(record.answers !== undefined);
          }),
          { numRuns: runs },
        );
      } finally {
        await setup.cleanup?.();
      }
    });
  });
}
