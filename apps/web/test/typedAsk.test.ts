// Which endings of a typed ask hand over to the keyword reader.
import { describe, expect, it } from "vitest";
import type { RunSummary } from "../src/api/types";
import { couldNotPick } from "../src/screens/photo/typedAsk";

const run = (patch: Partial<RunSummary>): RunSummary => ({ runId: "run_1", scenario: "custom", outcome: "INFO", ...patch });

describe("couldNotPick", () => {
  it.each(["NO_PROPOSAL:planner_null", "NO_PROPOSAL:planner_timeout", "NO_PROPOSAL:planner_error", "UNKNOWN_REQUEST", "ON_DEVICE_UNKNOWN_REQUEST"])("%s is a typed ask with no item chosen", (code) => {
    expect(couldNotPick(run({ code }))).toBe(true);
  });

  it.each([
    ["a stop by the rules", run({ outcome: "DENY", decisionId: "dec_1" })],
    ["an approval", run({ outcome: "APPROVE", decisionId: "dec_1" })],
    ["a question for the shopper", run({ outcome: "ESCALATE", decisionId: "dec_1" })],
    ["an error", run({ outcome: "ERROR", code: "NO_PROPOSAL:planner_null" })],
    ["no cheaper option (a different ask)", run({ code: "NO_PROPOSAL:no_alternative" })],
    ["a repeat of an earlier purchase", run({ code: "DUPLICATE" })],
    ["an info run with no code", run({})],
    ["a failed call (nothing came back)", undefined],
  ])("%s is not", (_name, summary) => {
    expect(couldNotPick(summary)).toBe(false);
  });
});
