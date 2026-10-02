// Local Qwen planner configuration (PLANNER_PROVIDER=local). Every default cites its source; ASSUMED values
// have no register row yet and are listed in the m-qwen lane report.

/** llama-server started by services/qwen/serve.sh; loopback only, port fixed there (Laya keeps 8808). */
export const DEFAULT_LOCAL_PLANNER_URL = "http://127.0.0.1:8809";

/** Aliases serve.sh gives the two pinned GGUF files (services/qwen/MODEL_SHA256). */
export const LOCAL_MODELS = {
  "9b": "qwen3.5-9b-q4km",
  "4b": "qwen3.5-4b-q4km",
} as const;

export type LocalModelKey = keyof typeof LOCAL_MODELS;

/**
 * Default model, chosen by the rule stated before the evaluation (data/results/qwen-planner-2026-10-02.md):
 * highest correct-item rate among models with no invalid answer and p95 under the planner timeout [F33].
 * The other stays selectable with PLANNER_MODEL and QWEN_MODEL.
 */
export const DEFAULT_LOCAL_MODEL: string = LOCAL_MODELS["9b"];

export interface LocalPlannerConfig {
  /** Longest shopper request, measured after NFKC normalisation, before any model call [F56]. */
  readonly maxRequestChars: number;
  /** Largest quantity per item the planner may propose. ASSUMED 10 (the schema allows 20). */
  readonly maxQty: number;
  /** Most distinct items in one proposal. ASSUMED 3. */
  readonly maxItems: number;
  /** Longest model note, in characters (lane brief). The note never reaches the shopper; see answer.ts. */
  readonly noteMaxChars: number;
  /** Most listing records and items put in one prompt (prompt-size bound). ASSUMED 8 and 24. */
  readonly maxListings: number;
  readonly maxPromptItems: number;
  /** Longest listing text per listing when includeListingText is on. ASSUMED 1,500 characters. */
  readonly maxListingTextChars: number;
  /** Completion token cap. ASSUMED 160: the longest valid answer is about 90 tokens. */
  readonly maxTokens: number;
  /** Fixed sampling seed; temperature is always 0. */
  readonly seed: number;
  /**
   * Measurement only, never the booth default: also show each listing description, inside a delimited
   * untrusted block, to measure how often a generative planner is moved by injected listing text.
   */
  readonly includeListingText: boolean;
}

export const DEFAULT_LOCAL_PLANNER_CONFIG: LocalPlannerConfig = {
  maxRequestChars: 1_000,
  maxQty: 10,
  maxItems: 3,
  noteMaxChars: 120,
  maxListings: 8,
  maxPromptItems: 24,
  maxListingTextChars: 1_500,
  maxTokens: 160,
  seed: 42,
  includeListingText: false,
};

export function resolveLocalConfig(patch: Partial<LocalPlannerConfig> | undefined): LocalPlannerConfig {
  return { ...DEFAULT_LOCAL_PLANNER_CONFIG, ...patch };
}
