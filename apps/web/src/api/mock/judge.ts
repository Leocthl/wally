// Mock judge. Presets return the recorded SIMULATED answers (provider replay). Free text gets a keyword heuristic that
// blends two recorded answer sets, so the engine's real thresholds decide. It is NOT Laya and the UI says so
// (model "mock-heuristic"). The live Laya judge arrives with the HTTP client; docs/00 D12.
import type { JudgeAnswers, JudgeRecord } from "@laisee/core/generated";
import { CHARS_PER_TOKEN_ESTIMATE, MOCK_CONFIG } from "./config";
import { JUDGE_RECORDS } from "./fixtures";

const MODEL = "mock-heuristic";
const VERSION = "mock";
/** Keyword hits that move a score from the clean answers to the risky answers completely. */
const HITS_FOR_FULL = 2;

const INJECTION = [
  /ignore (all |any |your |the )?(previous|prior|above|budget|instructions)/i,
  /system note/i,
  /\b(ai|llm|bot) (shopping )?assistants?\b/i,
  /approve (the|this|it|your) (purchase|order|payment)?/i,
  /disregard/i,
  /override/i,
  /you must/i,
  /do not (tell|mention|ask)/i,
  /\binstructions?\b/i,
  /gift card/i,
  /act as/i,
  /pretend/i,
];
const SELLER = [/bank transfer/i, /personal account/i, /\bfps\b/i, /cash only/i, /western union/i, /no returns/i, /crypto|bitcoin|usdt/i, /whatsapp/i];
const SCOPE = [/laptop|phone|earbuds|headphones|console|television|\btv\b|electronics|gadget/i, /gift card|voucher/i, /jewel|gold bar/i];

const hits = (text: string, patterns: readonly RegExp[]): number => patterns.filter((p) => p.test(text)).length;
const score = (text: string, patterns: readonly RegExp[], full: number = HITS_FOR_FULL): number => Math.min(1, hits(text, patterns) / full);

const round4 = (x: number): number => Math.round(x * 1e4) / 1e4;
const mix = (a: number, b: number, t: number): number => round4(a * (1 - t) + b * t);

function mixGroup<T extends Record<string, number>>(a: T, b: T, t: number): T {
  return Object.fromEntries(Object.keys(a).map((k) => [k, mix(a[k] ?? 0, b[k] ?? 0, t)])) as T;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE);
}

function answersFor(text: string): JudgeAnswers {
  const clean = JUDGE_RECORDS.tee.answers;
  const injected = JUDGE_RECORDS.injected.answers;
  const risky = JUDGE_RECORDS.hoodie.answers;
  const offCat = JUDGE_RECORDS.earbuds.answers;
  if (!clean || !injected || !risky || !offCat) throw new Error("judge fixtures lack answers");
  return {
    scope_fit: mixGroup(clean.scope_fit, offCat.scope_fit, score(text, SCOPE, 1)),
    injection_risk: mixGroup(clean.injection_risk, injected.injection_risk, score(text, INJECTION)),
    seller_risk: mixGroup(clean.seller_risk, risky.seller_risk, score(text, SELLER)),
    escalate_or_proceed: clean.escalate_or_proceed,
  };
}

/** Free-text listing: truncated input fails closed to status ERROR (I5, F26); otherwise heuristic answers. */
export function heuristicJudge(text: string): JudgeRecord {
  const base = { provider: "replay", model: MODEL, version: VERSION, latency_ms: JUDGE_RECORDS.tee.latency_ms, shadow: false } as const;
  if (estimateTokens(text) > MOCK_CONFIG.judgeStateTokens) return { ...base, status: "ERROR", input_truncated: true };
  return { ...base, status: "OK", answers: answersFor(text) };
}

export function recordedJudge(key: keyof typeof JUDGE_RECORDS): JudgeRecord {
  return JUDGE_RECORDS[key];
}
