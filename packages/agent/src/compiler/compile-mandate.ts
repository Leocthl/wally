// Sentence-to-rules compiler for the Seal screen (lane m-qwen): "HK$800 this month for clothes, verified sellers
// only" (or Chinese, or Cantonese) -> CompiledRules the shopper sees as editable chips and must confirm before
// sealing. One grammar-constrained completion from the local Qwen server reads the sentence; code does the money,
// the dates, the clamps and the labels. Never sealed automatically, never throws: { ok: false } on any failure,
// and the caller falls back to the rule-based compile (apps/web/src/booth/compile.ts).
import type { CompiledRules } from "@wally/core/generated";
import { validateMandate } from "@wally/core/schema";
import { normaliseRequest, type ChatClient } from "../planner/local";
import { parseCompilerAnswer } from "./answer";
import {
  COMPILER_MAX_TOKENS,
  COMPILER_SEED,
  DEFAULT_CATEGORIES,
  DEFAULT_COMPILER_LIMITS,
  DEFAULT_COMPILER_TIMEOUT_MS,
  MAX_SENTENCE_CHARS,
  type CompilerLimits,
} from "./config";
import { labelsFor, type RuleLabel } from "./labels";
import { buildCompilerMessages, buildCompilerSchema } from "./prompt";
import { buildRules, toTimestamp, type Clamp, type Note } from "./rules";

export type CompileFailure =
  | "empty_sentence"
  | "sentence_too_long"
  | "model_unavailable"
  | "invalid_answer"
  | "no_budget"
  | "budget_below_minimum"
  | "no_category"
  | "schema_check_failed";

export interface CompileInput {
  readonly text: string;
  /** Screen language; a hint to the model. Labels and notes always carry both languages. */
  readonly locale: "en" | "zh-HK";
  readonly client: ChatClient;
  readonly now: Date;
  readonly limits?: Partial<CompilerLimits>;
  /** Category slugs offered (default the four the Seal screen knows), each with words that name it. */
  readonly categories?: Readonly<Record<string, { readonly words: string; readonly en: string; readonly zhHK: string }>>;
  readonly model?: string;
  readonly timeoutMs?: number;
}

export type CompileOutcome =
  | {
      readonly ok: true;
      readonly rules: CompiledRules;
      /** mandate.valid_until, resolved in code from `now`. */
      readonly validUntil: string;
      /** One short chip label per rule, English and zh-HK, made in code from the validated rules. */
      readonly labels: readonly RuleLabel[];
      /** Defaults the compiler applied because the sentence was silent (confidence notes). */
      readonly notes: readonly Note[];
      /** What the sentence asked for that the suggestion does not carry, and why. */
      readonly clamped: readonly Clamp[];
      /** Always true: a suggestion; the shopper edits and confirms the chips before anything is signed. */
      readonly confirmRequired: true;
      readonly source: "generative";
      readonly model: string | null;
      readonly latencyMs: number;
    }
  | { readonly ok: false; readonly reason: CompileFailure; readonly latencyMs: number };

/** Placeholder identities for a schema check of the rules alone; never signed, never stored. */
const CHECK_DID = "did:key:z6MkDemoCompiXerCheckKeyXXXXXXXXXXXXXXXXXXXXXXXX";

function schemaValid(rules: CompiledRules, sentence: string, now: Date, validUntil: string): boolean {
  const probe = {
    id: "mnd_compilerCheck",
    delegator: CHECK_DID,
    agent: CHECK_DID,
    intent_text: sentence,
    rules,
    valid_from: toTimestamp(now.getTime()),
    valid_until: validUntil,
  };
  return validateMandate(probe).ok && Date.parse(validUntil) > now.getTime();
}

const failed = (reason: CompileFailure, latencyMs = 0): CompileOutcome => ({ ok: false, reason, latencyMs });

export async function compileMandateText(input: CompileInput): Promise<CompileOutcome> {
  try {
    const sentence = normaliseRequest(typeof input.text === "string" ? input.text : "");
    if (sentence === "") return failed("empty_sentence");
    if (sentence.length > MAX_SENTENCE_CHARS) return failed("sentence_too_long");
    const categories = input.categories ?? DEFAULT_CATEGORIES;
    const slugs = Object.keys(categories);
    const limits = { ...DEFAULT_COMPILER_LIMITS, ...input.limits };
    const res = await input.client.complete(
      {
        model: input.model ?? "local",
        messages: buildCompilerMessages(sentence, categories, input.locale),
        schemaName: "wally_rules",
        schema: buildCompilerSchema(slugs),
        maxTokens: COMPILER_MAX_TOKENS,
        seed: COMPILER_SEED,
      },
      input.timeoutMs ?? DEFAULT_COMPILER_TIMEOUT_MS,
    );
    if (!res.ok) return failed("model_unavailable", res.latencyMs);
    const raw = parseCompilerAnswer(res.content);
    if (raw === null) return failed("invalid_answer", res.latencyMs);
    const built = buildRules(raw, slugs, input.now, limits);
    if (!built.ok) return failed(built.reason, res.latencyMs);
    if (!schemaValid(built.rules, sentence, input.now, built.validUntil)) return failed("schema_check_failed", res.latencyMs);
    return {
      ok: true,
      rules: built.rules,
      validUntil: built.validUntil,
      labels: labelsFor(built.rules, built.validUntil, categories),
      notes: built.notes,
      clamped: built.clamped,
      confirmRequired: true,
      source: "generative",
      model: res.model,
      latencyMs: res.latencyMs,
    };
  } catch {
    return failed("model_unavailable"); // never throws
  }
}
