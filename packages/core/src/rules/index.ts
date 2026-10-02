// @laisee/core/rules: R1-R12 as pure functions (docs/02 section 7). Browser-safe: no I/O, no clock.
// Hard rules R1-R8 and R12 only ever DENY; only ESCALATE verdicts (R4 ask_above, R9 unverified,
// R10) can be answered by the delegator, and the engine enforces that.
export { evaluateR1, evaluateR2, type R1Input, type R2Input } from "./mandate";
export { cartTotals, evaluateR3, evaluateR4, evaluateR5, type CartTotals, type R3Input, type R4Input, type R5Input } from "./money";
export { evaluateR6, type R6Input } from "./scope";
export { evaluateR7, evaluateR8, type R7Input, type R8Input } from "./rate";
export { evaluateR9, type R9Input } from "./seller";
export { evaluateR10, type R10Input } from "./judge";
export { evaluateR11, type R11Input, type R11Outcome } from "./escalation";
export { evaluateR12, quoteChanges, type QuoteField, type R12Input } from "./drift";
export {
  failed,
  isMoney,
  judged,
  parseTime,
  passed,
  skipped,
  timeOf,
  type Comparator,
  type RuleInputs,
  type RuleResult,
  type RuleSpec,
  type RuleVerdict,
} from "./result";

/** Hard rules: their DENY survives any escalation answer. R4's ask_above ESCALATE is the one answerable FAIL here. */
export const HARD_RULES = Object.freeze(["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R12"] as const);
