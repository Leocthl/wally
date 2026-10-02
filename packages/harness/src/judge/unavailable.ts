// A client that is down. Used for the judge_down category so the live server is never stopped: the failure is injected
// at the client and travels the same fail-closed path as a real outage (status ERROR, R10.unavailable, I5).
import type { ChoiceClient } from "./choice-client";

export function createUnavailableClient(reason = "judge unavailable (failure injected by the harness)"): ChoiceClient {
  return { kind: "unavailable", ask: async () => ({ ok: false, status: "ERROR", reason, latencyMs: 0 }) };
}
