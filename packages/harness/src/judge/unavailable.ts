// A client and a judge that are down. Used for the judge_down category so the live server is never stopped: the failure is
// injected here and travels the same fail-closed path as a real outage (status ERROR, R10.unavailable, I5).
import type { JudgePort, JudgeRecord } from "@wally/core/ports";
import type { ChoiceClient } from "./choice-client";

export function createUnavailableClient(reason = "judge unavailable (failure injected by the harness)"): ChoiceClient {
  return { kind: "unavailable", ask: async () => ({ ok: false, status: "ERROR", reason, latencyMs: 0 }) };
}

export function createUnavailableJudge(provider: JudgeRecord["provider"]): JudgePort {
  return {
    provider,
    assess: async (): Promise<JudgeRecord> => ({ provider, model: "unavailable", version: "injected-outage", status: "ERROR", latency_ms: 0, shadow: false }),
  };
}
