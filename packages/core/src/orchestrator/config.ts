// Orchestrator timeouts and TTL: every default is an ENGINE_CONFIG value with its register row. Overrides are
// validated at construction (fail fast); no number is invented here.
import { ENGINE_CONFIG } from "../config";
import type { OrchestratorConfig } from "./types";

export const ORCHESTRATOR_DEFAULTS: OrchestratorConfig = Object.freeze({
  plannerTimeoutMs: ENGINE_CONFIG.timeouts.planner_ms, // [F33]
  judgeTimeoutMs: ENGINE_CONFIG.timeouts.judge_ms, // [F34]
  cardTtlMs: ENGINE_CONFIG.card.ttl_ms, // [F30]
});

export class OrchestratorConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrchestratorConfigError";
  }
}

const KEYS = ["plannerTimeoutMs", "judgeTimeoutMs", "cardTtlMs"] as const;

export function resolveConfig(partial: Partial<OrchestratorConfig> | undefined): OrchestratorConfig {
  const config = { ...ORCHESTRATOR_DEFAULTS, ...(partial ?? {}) };
  const bad = KEYS.filter((k) => !Number.isSafeInteger(config[k]) || config[k] <= 0);
  if (bad.length > 0) throw new OrchestratorConfigError(`orchestrator config needs positive integers: ${bad.join(", ")}`);
  return Object.freeze(config);
}

/** card-record.schema.json purpose: at most this many digits in total, so no card number fits (I8). */
const MAX_PURPOSE_DIGITS = 12;

/** Mint purpose: the cart id, with any digit past the schema's limit dropped. */
export function purposeOf(cartId: string): string {
  let digits = 0;
  return [...cartId]
    .filter((ch) => {
      if (ch < "0" || ch > "9") return true;
      digits += 1;
      return digits <= MAX_PURPOSE_DIGITS;
    })
    .join("");
}
