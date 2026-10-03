// Sentence-to-rules compiler configuration. Limits come from the engine config (which cites the register) or
// from the mandate schema; the values marked ASSUMED have no register row yet (listed in the m-qwen report).
import { ENGINE_CONFIG } from "@wally/core/config";

/** Category slugs the Seal screen knows, with words that name them; the same four apps/web/src/booth/compile.ts maps. */
export const DEFAULT_CATEGORIES: Readonly<Record<string, { readonly words: string; readonly en: string; readonly zhHK: string }>> = {
  apparel: { words: "clothes of any kind: tees, shirts, jackets, hoodies, socks; 衫, 衣服, 衣物", en: "Clothes", zhHK: "衣服" },
  footwear: { words: "shoes, sneakers, boots; 鞋, 波鞋", en: "Shoes", zhHK: "鞋" },
  electronics: { words: "electronics and gadgets: earbuds, chargers; 電子產品, 耳機", en: "Electronics", zhHK: "電子產品" },
  groceries: { words: "food and household groceries; 雜貨, 餸, 食物", en: "Groceries", zhHK: "雜貨" },
};

export interface CompilerLimits {
  /** Budget ceiling: one card's limit ceiling [F1.ceiling]; a larger budget is clamped down to it. */
  readonly ceilingMinor: number;
  /** Smallest budget accepted. ASSUMED HK$1: anything lower means the sentence named no usable amount. */
  readonly minBudgetMinor: number;
  /** Longest period a sentence may set. ASSUMED 31 days (the demo packet is monthly [F20]); longer is clamped. */
  readonly maxPeriodDays: number;
  /** The default velocity limit [F32]; a suggestion may only tighten it. */
  readonly velocity: { readonly max_mints: number; readonly window_s: number };
}

export const DEFAULT_COMPILER_LIMITS: CompilerLimits = {
  ceilingMinor: ENGINE_CONFIG.rail.ceiling_minor,
  minBudgetMinor: 100,
  maxPeriodDays: 31,
  velocity: { max_mints: ENGINE_CONFIG.velocity.max_mints, window_s: ENGINE_CONFIG.velocity.window_s },
};

/** Longest sentence: mandate.schema.json IntentText maxLength, measured after NFKC normalisation. */
export const MAX_SENTENCE_CHARS = 280;

/**
 * Default model call budget for the Seal screen. ASSUMED 10 s: a phone waits for it, and on failure the screen
 * falls back to the rule-based compile at once.
 */
export const DEFAULT_COMPILER_TIMEOUT_MS = 10_000;

/** Completion token cap. ASSUMED 160: the longest valid answer, every field set, is about 100 tokens. */
export const COMPILER_MAX_TOKENS = 160;

/** Fixed sampling seed; temperature is always 0. */
export const COMPILER_SEED = 42;
