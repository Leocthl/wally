// Sentence to rule chips for the Seal screen (POST /api/compile, compileRules). Two readers, one result shape:
//   model  the local Qwen reads the sentence (@wally/agent/compiler); code does the money, the dates, the clamps, the labels
//   rules  the fixed rules parser of the Seal screen (booth/compile.ts), no model
// The model path is used only when the host gives one. If it fails, the rules answer and the notes say why: the model never
// stops the Seal screen from working. Nothing here seals anything; confirmRequired is always true.
import { DEFAULT_CATEGORIES, labelsFor, type Clamp, type CompileOutcome, type Note } from "@wally/agent/compiler";
import type { AskLocale, CompileLabel, CompileResult, CompileRulesRequest } from "../../api/types";
import { chipsToRules, compileMandate, expiryClamps, validUntilFor } from "../compile";
import { BoothError } from "./errors";

/** The model reader, bound to its client by the host. It must not throw (compileMandateText never does). */
export type ModelCompile = (input: { readonly text: string; readonly locale: AskLocale; readonly now: Date }) => Promise<CompileOutcome>;

export interface CompileDeps {
  readonly now: Date;
  readonly model: ModelCompile | null;
}

const NO_MODEL_NOTE: Readonly<Record<AskLocale, string>> = {
  en: "Read by the fixed rules parser, not a model.",
  "zh-HK": "由固定規則解析，不是模型。",
};

const WHY_FALLBACK: Readonly<Record<AskLocale, (reason: string) => string>> = {
  en: (reason) => `The local model could not read this sentence (${reason}), so the fixed rules parser read it instead.`,
  "zh-HK": (reason) => `本機模型未能讀取這句話（${reason}），改由固定規則解析。`,
};

const noteText = (note: Note, locale: AskLocale): string => (locale === "zh-HK" ? note.zhHK : note.en);
/** The compiler's own words for a bracketed register id ("one card's limit ceiling [F1]") are for the team, not the shopper. */
const withoutIds = (why: string): string => why.replace(/\s*\[F\d+[^\]]*\]/g, "");

/**
 * What the suggestion left out, in the shopper's words and language: never the field names, "asked ... applied ..." or register
 * ids that the compiler keeps for the team. The end date, the case a shopper meets, has its own sentence.
 */
function clampText(c: Clamp, locale: AskLocale): string {
  const days = /^(\d+) days$/.exec(c.applied)?.[1];
  if (c.field === "valid_until" && days !== undefined) {
    return locale === "zh-HK" ? `結束日期已縮短至由今日起 ${days} 日，這是一個預算最長可維持的日數。` : `The end date is cut to ${days} days from now, the longest a budget can run.`; // NEEDS-REVIEW (zh-HK)
  }
  return locale === "zh-HK" ? `你要求的「${c.asked}」已改為「${c.applied}」。` : `You asked for ${c.asked}; Wally used ${c.applied} instead (${withoutIds(c.why)}).`; // NEEDS-REVIEW (zh-HK)
}

function fromModel(out: Extract<CompileOutcome, { ok: true }>, locale: AskLocale): CompileResult {
  return {
    source: "model",
    rules: out.rules,
    validUntil: out.validUntil,
    labels: out.labels,
    notes: out.notes.map((n) => noteText(n, locale)),
    clamped: out.clamped.map((c) => clampText(c, locale)),
    confirmRequired: true,
  };
}

function fromRules(req: CompileRulesRequest, now: Date, why: readonly string[]): CompileResult {
  const compiled = compileMandate(req.text, now);
  const issue = compiled.issues[0];
  if (issue !== undefined) {
    const detail = req.locale === "zh-HK" ? issue.zh : issue.en;
    throw new BoothError(422, "CANNOT_COMPILE", `The sentence does not give usable rules: ${detail}`);
  }
  const rules = chipsToRules(compiled.chips);
  const validUntil = validUntilFor(compiled.chips, now);
  const labels: readonly CompileLabel[] = labelsFor(rules, validUntil, DEFAULT_CATEGORIES);
  const clamped = expiryClamps(compiled.chips, now).map((c) => clampText(c, req.locale));
  return { source: "rules", rules, validUntil, labels, notes: [...why, NO_MODEL_NOTE[req.locale]], clamped, confirmRequired: true };
}

async function readByModel(model: ModelCompile, req: CompileRulesRequest, now: Date): Promise<CompileOutcome> {
  try {
    return await model({ text: req.text, locale: req.locale, now });
  } catch {
    return { ok: false, reason: "model_unavailable", latencyMs: 0 }; // a throwing reader is a failed one, never a crash
  }
}

export async function compileRules(req: CompileRulesRequest, deps: CompileDeps): Promise<CompileResult> {
  if (deps.model === null) return fromRules(req, deps.now, []);
  const out = await readByModel(deps.model, req, deps.now);
  return out.ok ? fromModel(out, req.locale) : fromRules(req, deps.now, [WHY_FALLBACK[req.locale](out.reason)]);
}
