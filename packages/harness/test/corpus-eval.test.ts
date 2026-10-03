import { describe, expect, it } from "vitest";
import { evaluateCorpus } from "../src/judge/corpus-eval";
import { createClientSource } from "../src/judge/sources";
import { BENIGN_IMPERATIVES, INJECTION_CORPUS } from "../src/scenario/injections";
import { generateScenarios } from "../src/scenario/generate";
import { FakeJudge } from "@wally/core/testing";
import { createOracleClient } from "./support/oracle-client";
import { keywordJudge } from "./support/keyword-model";

const base = generateScenarios({ seed: 7, n: 1 })[0]!;
const oracle = () => createClientSource({ judge: keywordJudge(), client: createOracleClient(), kind: "recorded" });

describe("judge on the whole hand-written injection corpus, scored by the engine's own R10", () => {
  it("scores every corpus item and every benign control, with the tuning and held-out halves apart", async () => {
    const out = await evaluateCorpus(oracle(), base);
    expect(out.items).toBe(INJECTION_CORPUS.length);
    expect(out.tuning.n + out.heldout.n).toBe(INJECTION_CORPUS.length);
    expect(out.benign.n).toBe(BENIGN_IMPERATIVES.length);
    expect(out.unavailable).toBe(0);
  });

  it("an oracle that spots every corpus item lets none through and flags no benign control", async () => {
    const out = await evaluateCorpus(oracle(), base);
    expect(out.falseAllow).toEqual({ k: 0, n: INJECTION_CORPUS.length });
    expect(out.benign.k).toBe(0);
  });

  it("a judge that is down is counted as unavailable, not as an allow", async () => {
    const down = new FakeJudge({ status: "ERROR" });
    const out = await evaluateCorpus(createClientSource({ judge: down, client: createOracleClient(), kind: "recorded" }), base);
    expect(out.unavailable).toBe(INJECTION_CORPUS.length + BENIGN_IMPERATIVES.length);
    expect(out.falseAllow.n).toBe(0);
  });

  it("an input the judge cannot read in full (truncated) is unavailable, never an allow (F26)", async () => {
    const truncating = new FakeJudge({ inputTruncated: true });
    const out = await evaluateCorpus(createClientSource({ judge: truncating, client: createOracleClient(), kind: "recorded" }), base);
    expect(out.unavailable).toBe(INJECTION_CORPUS.length + BENIGN_IMPERATIVES.length);
    expect(out.falseAllow.n).toBe(0);
  });

  it("a judge that sees nothing wrong lets every item through", async () => {
    const blind = new FakeJudge(); // clean answers for every listing
    const out = await evaluateCorpus(createClientSource({ judge: blind, client: createOracleClient(), kind: "recorded" }), base);
    expect(out.falseAllow).toEqual({ k: INJECTION_CORPUS.length, n: INJECTION_CORPUS.length });
  });

  it("a judge that flags everything stops every item and flags every benign control", async () => {
    const paranoid = new FakeJudge({ answers: { injection_risk: { clean: 0.02, suspicious: 0.18, injection: 0.8 } } });
    const out = await evaluateCorpus(createClientSource({ judge: paranoid, client: createOracleClient(), kind: "recorded" }), base);
    expect(out.falseAllow.k).toBe(0);
    expect(out.benign).toEqual({ k: BENIGN_IMPERATIVES.length, n: BENIGN_IMPERATIVES.length });
  });
});
