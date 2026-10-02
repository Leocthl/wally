// The harness metrics this page knows how to title, in a fixed reading order. Keys are the file's own; a key the page
// does not know still appears in the all-metrics table under its raw name, so nothing the file carries is hidden.
import { label, type LabelPair } from "../i18n/label";
import { BASELINES, type BaselineId, type HarnessRun } from "./types";

export interface MetricSpec {
  readonly key: string;
  readonly title: LabelPair;
  readonly question: LabelPair;
  readonly lowerIsBetter: boolean;
  /** Charted as bars; the rest are listed in the all-metrics table only. */
  readonly headline: boolean;
}

const spec = (key: string, title: LabelPair, question: LabelPair, headline = true, lowerIsBetter = true): MetricSpec => ({ key, title, question, headline, lowerIsBetter });

export const METRICS: readonly MetricSpec[] = [
  spec("overspend_rate", label("Overspend rate", "超支率"), label("How often was more money authorised than the packet allowed?", "授權金額超出利是容許範圍的情況有幾多？")), // NEEDS-REVIEW zh-HK
  spec("over_limit_mint_rate", label("Over-limit mint rate", "超額發卡率"), label("How often was a card minted with a limit above what the packet allowed?", "發出的卡額度高於利是容許範圍的情況有幾多？")), // NEEDS-REVIEW zh-HK
  spec("wrong_merchant_rate", label("Wrong-merchant rate", "錯誤商戶率"), label("Of the purchases that reached payment, how many paid a merchant outside the mandate?", "去到付款的購買中，有幾多付錢給授權以外的商戶？")), // NEEDS-REVIEW zh-HK
  spec("false_block_rate", label("False-block rate", "誤攔率"), label("How many legitimate purchases did not complete?", "合法的購買有幾多未能完成？")), // NEEDS-REVIEW zh-HK
  spec("stop_breach_rate", label("Stop-breach rate", "攔截失守率"), label("When a purchase should have stopped, how often did more money move than allowed?", "應該攔截的購買中，有幾多仍然多付了錢？")), // NEEDS-REVIEW zh-HK
  spec("injection_pass_through_rate", label("Injection pass-through rate", "植入指令通過率"), label("Of the injected listings no hard rule would stop, how many were bought?", "硬性規則攔不住的植入指令商品，有幾多被買下？")), // NEEDS-REVIEW zh-HK
  spec("judge_timeout_rate", label("Judge calls that timed out", "判斷器逾時"), label("How often did the judge time out?", "判斷器逾時的次數？"), false), // NEEDS-REVIEW zh-HK
  spec("judge_error_rate", label("Judge calls that failed", "判斷器出錯"), label("How often did the judge fail?", "判斷器出錯的次數？"), false), // NEEDS-REVIEW zh-HK
  spec("label_agreement_rate", label("Label agreement", "與標籤一致"), label("How often did the outcome match the generator's label?", "結果與預設標籤相符的比例？"), false, false), // NEEDS-REVIEW zh-HK
];

export const BASELINE_NAMES: Readonly<Record<BaselineId, LabelPair>> = {
  B0: label("model-only gate", "純模型把關"), // NEEDS-REVIEW zh-HK
  B1: label("rules and rail limit, no judge", "規則及發卡上限，無判斷器"), // NEEDS-REVIEW zh-HK
  B2: label("full pipeline", "完整流程"), // NEEDS-REVIEW zh-HK
};

/** Every rate key the run carries, known keys first in METRICS order, unknown keys after in name order. */
export function rateKeys(run: HarnessRun): readonly string[] {
  const present = new Set(BASELINES.flatMap((b) => Object.keys(run.baselines[b]?.rates ?? {})));
  const known = METRICS.map((m) => m.key).filter((k) => present.has(k));
  const unknown = [...present].filter((k) => !METRICS.some((m) => m.key === k)).sort();
  return [...known, ...unknown];
}

export function specOf(key: string): MetricSpec {
  return METRICS.find((m) => m.key === key) ?? spec(key, label(key, key), label(key, key), false);
}

export function headlineKeys(run: HarnessRun): readonly string[] {
  return rateKeys(run).filter((k) => specOf(k).headline);
}
