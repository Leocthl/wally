import { describe, expect, it } from "vitest";
import { evaluateCorpus } from "../src/judge/corpus-eval";
import { createClientSource } from "../src/judge/sources";
import { BENIGN_IMPERATIVES, INJECTION_CORPUS } from "../src/scenario/injections";
import { generateScenarios } from "../src/scenario/generate";
import { createOracleClient } from "./support/oracle-client";
import type { ChoiceClient } from "../src/judge/choice-client";

const timer = (): number => 1;
const base = generateScenarios({ seed: 7, n: 1 })[0]!;

describe("judge on the whole hand-written injection corpus, engine-independent", () => {
  it("scores every corpus item and every benign control, with the tuning and held-out halves apart", async () => {
    const out = await evaluateCorpus(createClientSource(createOracleClient(), "recorded", timer), base);
    expect(out.items).toBe(INJECTION_CORPUS.length);
    expect(out.tuning.n + out.heldout.n).toBe(INJECTION_CORPUS.length);
    expect(out.benign.n).toBe(BENIGN_IMPERATIVES.length);
    expect(out.unavailable).toBe(0);
  });

  it("an oracle that spots every corpus item lets none through and flags no benign control", async () => {
    const out = await evaluateCorpus(createClientSource(createOracleClient(), "recorded", timer), base);
    expect(out.falseAllow).toEqual({ k: 0, n: INJECTION_CORPUS.length });
    expect(out.benign.k).toBe(0);
  });

  it("a judge that is down is counted as unavailable, not as an allow", async () => {
    const down: ChoiceClient = { kind: "fake", ask: async () => ({ ok: false, status: "ERROR", reason: "down", latencyMs: 0 }) };
    const out = await evaluateCorpus(createClientSource(down, "recorded", timer), base);
    expect(out.unavailable).toBe(INJECTION_CORPUS.length + BENIGN_IMPERATIVES.length);
    expect(out.falseAllow.n).toBe(0);
  });

  it("a judge that sees nothing wrong lets every item through", async () => {
    const blind: ChoiceClient = {
      kind: "fake",
      ask: async (req) => ({
        ok: true,
        truncated: false,
        latencyMs: 1,
        meta: { model: "typed-decisions", revision: null },
        answers: Object.fromEntries(req.questions.map((q) => [q.id, { choice: q.options[0]!.label, probabilities: Object.fromEntries(q.options.map((o, i) => [o.label, i === 0 ? 1 : 0])) }])),
      }),
    };
    const out = await evaluateCorpus(createClientSource(blind, "recorded", timer), base);
    expect(out.falseAllow).toEqual({ k: INJECTION_CORPUS.length, n: INJECTION_CORPUS.length });
  });
});
