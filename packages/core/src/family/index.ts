// @wally/core/family: a parent's budget funds a child's budget, and the child's funds the agent. Caps compose: the
// child can only narrow what the parent set. Pure and browser-safe (no node: imports).
export { hkd } from "./format";
export { AllocationError, createAllocationLedger, type AllocationLedger } from "./ledger";
export { parentLinkOf, sameLink, summarizeParent } from "./link";
export type { CheckChildInput, FamilyCheck, FamilyField, FamilyValue, FamilyViolation, ParentSummary } from "./types";
export { checkChildWithinParent } from "./within";
