// The budget amount of a seal request is checked at the boundary: a whole number of minor units from 1 to the compiler's
// budget ceiling (HK$2,000, the same figure the first run caps a typed amount to). An absurd amount (9e99, a number past
// the safe integers) is a calm 400 INVALID_FIELD, never a 500 from the packet fold, and nothing is sealed.
import { DEFAULT_COMPILER_LIMITS } from "@wally/agent/compiler";
import { describe, expect, it } from "vitest";
import { m0SealRequest } from "../src/api/mock/presets";
import { BoothError } from "../src/booth/backend/errors";
import { parseSealRequest } from "../src/booth/backend/validate";

const CEILING = DEFAULT_COMPILER_LIMITS.ceilingMinor;
const base = (): Record<string, unknown> => JSON.parse(JSON.stringify(m0SealRequest(new Date()))) as Record<string, unknown>;

/** The request with `budget.amount_minor` replaced (the raw JSON a client sends; 9e99 is what JSON.parse makes of "9e99"). */
function withAmount(amount: unknown): Record<string, unknown> {
  const body = base();
  const rules = body["rules"] as { budget: Record<string, unknown> };
  return { ...body, rules: { ...rules, budget: { ...rules.budget, amount_minor: amount } } };
}

function refusal(body: Record<string, unknown>): BoothError {
  try {
    parseSealRequest(body);
  } catch (err) {
    if (err instanceof BoothError) return err;
    throw err;
  }
  throw new Error("expected the request to be refused");
}

describe("the budget amount of a seal request", () => {
  it("is 200,000 minor units at most: the figure the first run and the sentence reader cut a typed amount to", () => {
    expect(CEILING).toBe(200_000);
  });

  it.each([1, 80_000, CEILING])("accepts %i", (amount) => {
    expect(parseSealRequest(withAmount(amount)).rules.budget.amount_minor).toBe(amount);
  });

  it.each([
    ["9e99", JSON.parse("9e99") as unknown],
    ["9007199254740993", JSON.parse("9007199254740993") as unknown],
    ["Infinity as a string", "Infinity"],
    ["NaN", Number.NaN],
    ["10^11", 100_000_000_000],
    ["one over the ceiling", CEILING + 1],
    ["zero", 0],
    ["negative", -1],
    ["a fraction", 1.5],
    ["a numeric string", "100"],
    ["null", null],
    ["a list", [100]],
  ])("refuses %s with a 400 INVALID_FIELD that names the field", (_name, amount) => {
    const err = refusal(withAmount(amount));
    expect(err.status).toBe(400);
    expect(err.code).toBe("INVALID_FIELD");
    expect(err.message).toContain("budget.amount_minor");
  });

  it("leaves a request with no budget object to the credential's schema check (the existing 400s keep their codes)", () => {
    expect(() => parseSealRequest({ ...base(), rules: {} })).not.toThrow();
  });
});
