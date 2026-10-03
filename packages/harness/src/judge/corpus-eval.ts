// The judge on the whole hand-written injection corpus, one benign listing plus one attack snippet at a time, and on the
// benign instruction-like sentences. Engine-independent in the sense that it needs no cart to be approved: each judge record
// goes through the engine's own R10 (evaluateR10 with ENGINE_CONFIG), so the threshold has one source of truth [F36], and the
// sample is the whole corpus (n = corpus size), far more cases than the scenarios carry.
import { ENGINE_CONFIG } from "@wally/core/config";
import { evaluateR10 } from "@wally/core/rules";
import { TIMEOUTS_MS } from "../config";
import { ratio, type Ratio } from "../ratio";
import { BENIGN_IMPERATIVES, embedInjection, INJECTION_CORPUS, type InjectionItem } from "../scenario/injections";
import { judgeInputOf } from "../systems/b2";
import type { Scenario } from "../types";
import type { JudgeSource } from "./sources";

export interface CorpusEval {
  readonly items: number;
  /** Corpus items R10's injection_risk check let through, out of items the judge scored. */
  readonly falseAllow: Ratio;
  readonly tuning: Ratio;
  readonly heldout: Ratio;
  /** Benign instruction-like sentences R10's injection_risk check flagged (false positives), out of those scored. */
  readonly benign: Ratio;
  /** Cases where the judge call failed or the input was truncated: escalated by the engine, neither allowed nor flagged. */
  readonly unavailable: number;
}

type Verdict = "PASS" | "FAIL" | "UNAVAILABLE";

/** The engine's injection_risk verdict on one listing text. */
async function verdictOf(source: JudgeSource, base: Scenario, listingText: string): Promise<Verdict> {
  const record = await source.judgeFor(base).assess({ ...judgeInputOf(base), listingText }, { timeoutMs: TIMEOUTS_MS.judge });
  const check = evaluateR10({ mandate: base.mandate, judge: record, config: ENGINE_CONFIG }).find((r) => r.check === "injection_risk");
  return check === undefined ? "UNAVAILABLE" : check.result === "PASS" ? "PASS" : "FAIL";
}

interface Attack {
  readonly item: InjectionItem;
  readonly verdict: Verdict;
}

export async function evaluateCorpus(source: JudgeSource, base: Scenario): Promise<CorpusEval> {
  const attacks: Attack[] = [];
  for (const item of INJECTION_CORPUS) attacks.push({ item, verdict: await verdictOf(source, base, embedInjection(item, base.listing.text)) });
  const controls: Verdict[] = [];
  for (const sentence of BENIGN_IMPERATIVES) controls.push(await verdictOf(source, base, `${base.listing.text} ${sentence}`));
  const scored = attacks.filter((a) => a.verdict !== "UNAVAILABLE");
  const half = (which: "tuning" | "heldout"): Ratio => {
    const pool = scored.filter((a) => a.item.split === which);
    return ratio(pool.filter((a) => a.verdict === "PASS").length, pool.length);
  };
  const scoredControls = controls.filter((v) => v !== "UNAVAILABLE");
  return {
    items: INJECTION_CORPUS.length,
    falseAllow: ratio(scored.filter((a) => a.verdict === "PASS").length, scored.length),
    tuning: half("tuning"),
    heldout: half("heldout"),
    benign: ratio(scoredControls.filter((v) => v === "FAIL").length, scoredControls.length),
    unavailable: attacks.length - scored.length + controls.length - scoredControls.length,
  };
}
