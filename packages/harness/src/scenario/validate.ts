// Every generated scenario is checked against the core schemas before it can reach a system under test. A generator bug
// then fails loudly at the source instead of showing up as a strange outcome further down.
import { formatIssues, validateCart, validateListingRecord, validateMandate, validatePacketState, validatePlannerReplayRecord, validateScameterCapture, type ValidationResult } from "@wally/core/schema";
import type { Scenario } from "../types";

function check(scenario: Scenario, what: string, result: ValidationResult<unknown>): void {
  if (!result.ok) throw new Error(`scenario ${scenario.id}: invalid ${what}: ${formatIssues(result.errors)}`);
}

export function assertScenarioValid(s: Scenario): void {
  check(s, "mandate", validateMandate(s.mandate));
  check(s, "packet", validatePacketState(s.packet));
  check(s, "listing", validateListingRecord(s.listing));
  check(s, "cart", validateCart(s.cart));
  check(s, "planner record", validatePlannerReplayRecord(s.planner));
  if (s.scameterCapture !== null) check(s, "scameter capture", validateScameterCapture(s.scameterCapture));
}
