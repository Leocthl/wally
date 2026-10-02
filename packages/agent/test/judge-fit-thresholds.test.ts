import { describe, expect, it } from "vitest";
import { ThresholdParseError, loadThresholds, parseThresholds } from "../src/judge/fit/thresholds";

describe("thresholds from the facts register", () => {
  it("reads all five thresholds from the live register rows F36 and F50", () => {
    const t = loadThresholds();
    for (const v of Object.values(t)) expect(v).toBeGreaterThan(0);
    for (const v of Object.values(t)) expect(v).toBeLessThan(1);
    expect(t.T_sell_esc).toBeLessThan(t.T_sell_deny);
  });

  const row36 = "| F36 | Judge thresholds | `T_inj`=0.63 (x); `T_sell_deny`=0.55 (y); `T_sell_esc`=0.42 (z); `T_scope`=0.55 (w) | src |";
  const row50 = "| F50 | addendum | `T_esc`=0.50 (P(escalate)) | src |";

  it("parses the documented row format", () => {
    expect(parseThresholds(`${row36}\n${row50}\n`)).toEqual({ T_inj: 0.63, T_sell_deny: 0.55, T_sell_esc: 0.42, T_scope: 0.55, T_esc: 0.5 });
  });

  it.each([
    ["a missing row", row36],
    ["a missing key", `${row36.replace("`T_scope`=0.55 (w)", "")}\n${row50}`],
    ["an out-of-range value", `${row36.replace("0.63", "1.4")}\n${row50}`],
    ["swapped seller thresholds", `${row36.replace("`T_sell_esc`=0.42", "`T_sell_esc`=0.60")}\n${row50}`],
  ])("fails loudly on %s", (_name, text) => {
    expect(() => parseThresholds(text)).toThrow(ThresholdParseError);
  });
});
