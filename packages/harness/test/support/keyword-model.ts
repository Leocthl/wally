// TEST DOUBLE for the judge model: a keyword oracle over the harness's own injection corpus and listing prose.
// It stands in for Laya so pipeline tests are deterministic and offline. It says nothing about how Laya behaves.
import type { JudgeInput } from "@wally/core/ports";
import { FakeJudge, type FakeJudgeResponse } from "@wally/core/testing";
import { INJECTION_CORPUS } from "../../src/scenario/injections";

/** Longest text the fake judge reads before it reports truncation, standing in for the real context limit [F26]. */
export const FAKE_TRUNCATION_CHARS = 2_500;

const OFF_SCOPE = /earbuds|speaker|gift card bundle/i;
const RISKY_SELLER = /bank transfer|personal account/i;

export function isInjected(text: string): boolean {
  return INJECTION_CORPUS.some((i) => text.includes(i.text)) || /SYSTEM NOTE TO AI SHOPPING ASSISTANTS/.test(text);
}

export function keywordResponse(input: JudgeInput): FakeJudgeResponse {
  const text = input.listingText;
  if (text.length > FAKE_TRUNCATION_CHARS) return { inputTruncated: true, latencyMs: 12 };
  return {
    latencyMs: 12,
    answers: {
      ...(isInjected(text) ? { injection_risk: { clean: 0.05, suspicious: 0.15, injection: 0.8 } } : {}),
      ...(RISKY_SELLER.test(text) ? { seller_risk: { low_risk: 0.2, high_risk: 0.8 } } : {}),
      ...(OFF_SCOPE.test(text) || input.cart.items.some((i) => i.category !== "apparel") ? { scope_fit: { in_scope: 0.2, out_of_scope: 0.8 } } : {}),
    },
  };
}

export const keywordJudge = (): FakeJudge => new FakeJudge({ provider: "replay", respond: keywordResponse });
export const downJudge = (): FakeJudge => new FakeJudge({ provider: "laya", status: "ERROR" });
