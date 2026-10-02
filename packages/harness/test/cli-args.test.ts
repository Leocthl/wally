import { describe, expect, it } from "vitest";
import { parseCliArgs, UsageError } from "../src/cli-args";
import { SCENARIO_COUNT } from "../src/config";

const parse = (argv: string[], env: Record<string, string | undefined> = {}) => parseCliArgs(argv, env);

describe("pnpm harness -- --seed 7 --n 150 --judge live|recorded", () => {
  it("parses the documented usage", () => {
    expect(parse(["--seed", "7", "--n", "150", "--judge", "live"])).toMatchObject({ seed: 7, n: 150, judge: "live" });
    expect(parse(["--seed", "7", "--n", "150", "--judge", "recorded"])).toMatchObject({ judge: "recorded" });
  });

  it("tolerates the separator pnpm may pass through", () => {
    expect(parse(["--", "--seed", "9", "--judge", "recorded"])).toMatchObject({ seed: 9, judge: "recorded" });
  });

  it("defaults to the recorded judge, so a bare run needs no server and no network, and to the F37 default size", () => {
    expect(parse(["--seed", "3"])).toMatchObject({ judge: "recorded", n: SCENARIO_COUNT.default, record: false, strict: false });
  });

  it("takes the Laya address from LAYA_BASE_URL and falls back to the loopback default", () => {
    expect(parse([], { LAYA_BASE_URL: "http://127.0.0.1:9999" }).layaUrl).toBe("http://127.0.0.1:9999");
    expect(parse([]).layaUrl).toBe("http://127.0.0.1:8808");
  });

  it.each([
    [["--seed", "x"]],
    [["--seed", "-1"]],
    [["--seed", "1.5"]],
    [["--n", "0"]],
    [["--n", "abc"]],
    [["--judge", "claude"]],
    [["--record", "--judge", "recorded"]],
    [["--nonsense"]],
  ])("rejects %j with a usage message instead of guessing", (argv) => {
    expect(() => parse(argv)).toThrow(UsageError);
  });
});
