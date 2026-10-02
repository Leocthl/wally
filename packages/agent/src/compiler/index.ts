// @laisee/agent/compiler (lane m-qwen): sentence -> suggested rule chips for the Seal screen, on the local Qwen
// server. Composition root (apps/web server):
//   const client = createChatClient({ baseUrl: localPlannerUrlFromEnv(process.env) });   // @laisee/agent/planner
//   const out = await compileMandateText({ text, locale, client, now: new Date() });
//   out.ok ? show out.labels and out.rules as editable chips : fall back to compileMandate (booth/compile.ts)
export { compileMandateText, type CompileFailure, type CompileInput, type CompileOutcome } from "./compile-mandate";
export { DEFAULT_CATEGORIES, DEFAULT_COMPILER_LIMITS, DEFAULT_COMPILER_TIMEOUT_MS, MAX_SENTENCE_CHARS, type CompilerLimits } from "./config";
export { labelsFor, type ChipKind, type RuleLabel } from "./labels";
export { capEnd, describeEndDate, isRealDate, resolveEndDate, type EndDate, type ResolvedEnd } from "./end-date";
export { buildRules, monthEndHk, periodClamp, toTimestamp, type Clamp, type Note, type RawRules } from "./rules";
export { COMPILER_SYSTEM_PROMPT } from "./prompt";
