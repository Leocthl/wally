// The sentence a refused family seal carries. Kept apart from family.ts so session.ts can word a refusal without importing
// the module that imports session.ts.
import { hkd } from "@wally/core/family";
import type { ExceedsParentDetails } from "@wally/core/orchestrator";

/** The core's sentences speak of "the parent"; the booth's parent is Mum. */
const inMumsWords = (message: string): string => message.replace(/the parent budget/gi, "Mum's budget").replace(/the parent/gi, "Mum");

/** The sentence a refused family seal carries: the budget case in the words the Seal screen uses, the rest from the core's template. */
export function exceedsMessage(details: ExceedsParentDetails, coreMessage: string): string {
  if (details.field === "budget" && typeof details.allowed === "number") return `That's more than Mum allows (${hkd(details.allowed)}).`;
  return inMumsWords(coreMessage);
}
