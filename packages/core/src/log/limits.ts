// Size limits for what the log accepts. ASSUMED implementation limits, not policy numbers (no register ID):
// they sit far above anything the engine writes (a DECISION line is a few KB; rule inputs are flat records),
// so only a runaway or hostile payload reaches them. The writer and the verifier share the line limit, so the
// writer never appends a line the verifier would refuse. Browser-safe.
import { jcs } from "../crypto/jcs";
import type { Decision } from "../generated";

export const LOG_LIMITS = Object.freeze({
  /** ASSUMED: longest JSONL line, in characters of its JCS form, that is appended or read. */
  lineChars: 64 * 1024,
  /** ASSUMED: largest `inputs` object of one rule result or explanation, in JCS characters. */
  inputsChars: 8 * 1024,
  /** ASSUMED: deepest nesting inside one `inputs` object (the object itself is level 1). */
  inputsDepth: 6,
});

/** Nesting depth of a JSON value, counting objects and arrays; stops counting past `limit`. */
function depthOf(value: unknown, limit: number): number {
  if (value === null || typeof value !== "object") return 0;
  if (limit <= 0) return 1;
  let deepest = 0;
  for (const child of Object.values(value)) deepest = Math.max(deepest, depthOf(child, limit - 1));
  return 1 + deepest;
}

function inputsFinding(inputs: unknown, path: string): string | null {
  if (depthOf(inputs, LOG_LIMITS.inputsDepth) > LOG_LIMITS.inputsDepth) return `${path} nests deeper than ${LOG_LIMITS.inputsDepth} levels`;
  let size: number;
  try {
    size = jcs(inputs).length;
  } catch {
    return `${path} has no canonical JSON form`;
  }
  return size > LOG_LIMITS.inputsChars ? `${path} is ${size} characters, over ${LOG_LIMITS.inputsChars}` : null;
}

/** Why a DECISION's rule or explanation inputs are too large or too deep for the log, or null. */
export function decisionInputsProblem(decision: Pick<Decision, "rules" | "explanation">): string | null {
  const rules = Array.isArray(decision.rules) ? decision.rules : [];
  for (const [i, rule] of rules.entries()) {
    const found = inputsFinding(rule?.inputs, `$.rules[${i}].inputs`);
    if (found !== null) return found;
  }
  return decision.explanation === undefined ? null : inputsFinding(decision.explanation.inputs, "$.explanation.inputs");
}

/** Why a canonical line is too long for the log, or null. */
export function lineProblem(line: string): string | null {
  return line.length > LOG_LIMITS.lineChars ? `line is ${line.length} characters, over ${LOG_LIMITS.lineChars}` : null;
}
