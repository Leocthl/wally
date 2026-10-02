// Resolution binding: an escalation answer (or R11 expiry) applies only to the ESCALATE it names, on the cart
// that was escalated. The orchestrator reads that decision from the log and passes it as resolution.escalated;
// the engine checks the binding here and turns any failure into DENY R11 with inputs.answer_problem, so an
// answer can never approve a different cart, a closed escalation or an unsigned reply (I5).
import { THRESHOLD_REFS } from "../config";
import type { Cart } from "../generated";
import type { DecideContext, EscalationResolution } from "../ports";
import { failed, type R11Outcome } from "../rules";
import { cartFingerprint } from "./hash";

const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> => v !== null && typeof v === "object" && !Array.isArray(v);

function sameCart(escalatedCart: unknown, cart: Cart): boolean {
  try {
    // cartFingerprint canonicalises whatever it gets; a malformed cart throws or fingerprints differently.
    return isRecord(escalatedCart) && cartFingerprint(escalatedCart as unknown as Cart) === cartFingerprint(cart);
  } catch {
    return false; // a cart that cannot be canonicalised binds nothing
  }
}

function escalationState(escalated: Readonly<Record<string, unknown>>): unknown {
  const escalation = escalated["escalation"];
  return isRecord(escalation) ? escalation["state"] : undefined;
}

/** Why this resolution must not be applied to this cart, or null when it binds. Never throws. */
export function bindingProblem(resolution: EscalationResolution, cart: Cart, ctx: DecideContext | undefined): string | null {
  const escalated: unknown = resolution.escalated;
  if (!isRecord(escalated)) return "escalated_missing";
  if (escalated["id"] !== resolution.resolves) return "escalated_mismatch";
  if (escalated["outcome"] !== "ESCALATE") return "not_escalated";
  if (escalationState(escalated) !== "OPEN") return "escalation_not_open";
  if (!sameCart(escalated["cart"], cart)) return "cart_mismatch";
  if (resolution.answer === undefined) return null;
  if (ctx?.answerSignatureValid !== true) return "signature_invalid";
  return null; // decision_id, signer, choice and timing are R11's own checks
}

/** The R11 outcome as a DENY naming `problem`; any answer it had accepted is dropped. */
export function refusedR11(base: R11Outcome, resolution: EscalationResolution, problem: string): R11Outcome {
  const { choice: _choice, answered_at: _answeredAt, ...inputs } = base.result.inputs;
  const result = failed(
    {
      id: "R11",
      inputs: { ...inputs, resolves: resolution.resolves, answered: resolution.answer !== undefined, answer_problem: problem },
      comparator: "<",
      thresholdRef: THRESHOLD_REFS.escalation_window,
    },
    "DENY",
    "R11.expired",
  );
  return { ...base, result, answer: null };
}
