import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import type { RunOutput } from "../src/run";
import { testRun } from "./support/run-fixture";
import { RUN_MS } from "./support/timeouts";

const CHIP = /^(MEASURED|RECORDED)\(n=\d+, seed=\d+, commit=[0-9a-f]{7}\)$/;
const RATE_KEY = /(^|_)(rate|pct|percent|percentage|share)(_|$)/i;
const REPORTED = ["baselines", "judge_false_allow", "injection_corpus", "categories", "acceptance"] as const;

interface Violation {
  readonly path: string;
  readonly problem: string;
}

/** The T-H3 lint. Walks the reported blocks of a result and returns every number that travels without n, seed and commit. */
export function lintReportedNumbers(result: Record<string, unknown>): Violation[] {
  const out: Violation[] = [];
  const walk = (value: unknown, path: string): void => {
    if (typeof value === "string") {
      if (/\d\s?%/.test(value) && !/\d+\/\d+/.test(value)) out.push({ path, problem: `percentage without k/n: ${value}` });
      return;
    }
    if (typeof value === "number" && !Number.isFinite(value)) out.push({ path, problem: "non-finite number" });
    if (Array.isArray(value)) return value.forEach((v, i) => walk(v, `${path}[${i}]`));
    if (typeof value !== "object" || value === null) return;
    const obj = value as Record<string, unknown>;
    const isRatio = "k" in obj && "n" in obj;
    if (isRatio) {
      const { k, n, display, chip } = obj as { k: unknown; n: unknown; display: unknown; chip: unknown };
      if (!Number.isInteger(k) || !Number.isInteger(n) || (k as number) > (n as number)) out.push({ path, problem: "k/n not integers with k <= n" });
      if (typeof display !== "string" || !display.startsWith(`${String(k)}/${String(n)} `)) out.push({ path, problem: "display does not lead with k/n" });
      if (typeof chip !== "string" || !CHIP.test(chip)) out.push({ path, problem: "ratio without a MEASURED/RECORDED chip carrying n, seed, commit" });
    }
    if (("p50_ms" in obj || "measured" in obj) && (typeof obj["chip"] !== "string" || !CHIP.test(obj["chip"]))) out.push({ path, problem: "latency without a chip" });
    for (const [key, v] of Object.entries(obj)) {
      if (RATE_KEY.test(key) && typeof v === "number") out.push({ path: `${path}.${key}`, problem: "a rate stored as a bare number" });
      if (RATE_KEY.test(key) && typeof v === "object" && v !== null && !("k" in v && "n" in v) && !("measured" in v)) out.push({ path: `${path}.${key}`, problem: "a rate without k and n" });
      walk(v, `${path}.${key}`);
    }
  };
  for (const block of REPORTED) walk(result[block], block);
  return out;
}

describe("T-H3: every reported number carries n, seed and commit", () => {
  let live: RunOutput;
  let recorded: RunOutput;
  beforeAll(async () => {
    live = await testRun({ mode: "live", n: 100 });
    recorded = await testRun({ mode: "recorded", n: 100 });
  }, RUN_MS);

  it("passes the lint on a live result and a recorded result", () => {
    expect(lintReportedNumbers(live.result)).toEqual([]);
    expect(lintReportedNumbers(recorded.result)).toEqual([]);
  });

  it("the lint catches a bare rate, a ratio without a chip, and a percentage without k/n", () => {
    const bad = { baselines: { B2: { overspend_rate: 0.03, false_block_rate: { k: 1, n: 10, display: "1/10 (10.0%)" }, note: "3.3% of scenarios" } } };
    const problems = lintReportedNumbers(bad).map((v) => v.problem);
    expect(problems).toEqual(expect.arrayContaining(["a rate stored as a bare number", "ratio without a MEASURED/RECORDED chip carrying n, seed, commit", "percentage without k/n: 3.3% of scenarios"]));
  });

  it("states seed, n, commit, checkpoint revision, device and the UTC+8 run time at the top", () => {
    const run = live.result["run"] as Record<string, unknown>;
    expect(run).toMatchObject({ seed: 7, n: 100, commit: expect.stringMatching(/^[0-9a-f]{40}$/), checkpoint_revision: expect.stringMatching(/^[0-9a-f]{40}$/), device: "test device" });
    expect(String(run["run_at_utc8"])).toMatch(/\+08:00$/);
  });

  it("says which judge ran, and labels a live run MEASURED and a recorded run RECORDED", () => {
    expect(live.result["label"]).toMatch(/^MEASURED\(/);
    expect(recorded.result["label"]).toMatch(/^RECORDED\(/);
    expect((live.result["run"] as { judge: { source: string } }).judge.source).toBe("live");
    expect((recorded.result["run"] as { judge: { source: string } }).judge.source).toBe("recorded");
  });

  it("reports latency from live runs only [F26]", () => {
    const lat = (r: RunOutput) => (r.result["baselines"] as Record<string, { latency: { measured: boolean } }>)["B2"]?.latency;
    expect(lat(live)?.measured).toBe(true);
    expect(lat(recorded)?.measured).toBe(false);
  });

  it("flags fewer scenarios than the F37 minimum", async () => {
    const small = await testRun({ n: 40 });
    expect((small.result["run"] as { meets_scenario_minimum: boolean }).meets_scenario_minimum).toBe(false);
    expect((small.result["evidence"] as { reasons: string[] }).reasons.join(" ")).toContain("fewer scenarios");
  }, RUN_MS);

  it("contains no PAN-like digit run and no CVV field (I8) in the JSON or the summary", () => {
    for (const text of [JSON.stringify(live.result), live.summary]) {
      expect(text).not.toMatch(/(?<![\w.])(?:\d[ -]?){13,19}(?![\w])/);
      expect(text.toLowerCase()).not.toMatch(/cvv\D{0,12}\d{3}/);
    }
  });

  it("states its scope: counts not proofs, SIMULATED parts, a log checked for integrity rather than consent, a modelled shopper", () => {
    const scope = (live.result["scope"] as string[]).join(" ");
    expect(scope).toContain("Zero over-limit mints in these 100 scenarios is a count of zero");
    expect(scope).toContain("not a proof that no cart can overspend");
    expect(scope).toContain("SIMULATED");
    expect(scope).toContain("chain integrity");
    expect(scope).toContain("does not show that the delegator consented");
    expect(scope).toContain("simulated shopper");
    expect(scope).toContain("A judge timeout is not retried");
    expect(live.summary).toContain("## Scope: what these numbers say");
  });

  it("makes no claim the harness did not measure: no guarantee, no proof, no 'cannot overspend'", () => {
    for (const text of [JSON.stringify(live.result), live.summary, JSON.stringify(recorded.result)]) {
      expect(text).not.toMatch(/guarantee|\bproves?\b|impossible|cannot overspend|no overspend|never overspend/i);
    }
  });

  it("explains each miss one scenario at a time: legitimate purchases blocked by gate, stop cases that got through", () => {
    const breakdown = live.result["breakdown"] as { legitimate_blocked: Record<string, { count: number; by_gate: Record<string, number>; rows: unknown[] }>; stops_through: Record<string, { count: number; rows: unknown[] }> };
    for (const b of ["B0", "B1", "B2"]) {
      expect(breakdown.legitimate_blocked[b]?.rows).toHaveLength(breakdown.legitimate_blocked[b]?.count ?? -1);
      expect(Object.values(breakdown.legitimate_blocked[b]?.by_gate ?? {}).reduce((a, n) => a + n, 0)).toBe(breakdown.legitimate_blocked[b]?.count);
      expect(breakdown.stops_through[b]?.rows).toHaveLength(breakdown.stops_through[b]?.count ?? -1);
    }
    expect(live.summary).toContain("## Legitimate purchases blocked, by gate");
    expect(live.summary).toContain("## Stop cases that got through");
  });

  it("reports the host load of a live run, because latency and timeouts depend on it, and none for a replay that has no recorded load", () => {
    expect((live.result["run"] as { host_load_average_1m: unknown }).host_load_average_1m).toBe(1.5);
    expect(live.summary).toContain("**Host load**: 1-minute load average 1.5 at the end of the run");
    expect((recorded.result["run"] as { host_load_average_1m: unknown }).host_load_average_1m).toBeNull();
    expect(recorded.summary).not.toContain("Host load");
  });

  it("counts the stop cases that got through for a model-free rule apart; for B2 they are the repeated carts and nothing else", () => {
    const through = (live.result["breakdown"] as { stops_through: Record<string, { count: number; model_free_count: number; rows: { category: string }[] }> }).stops_through;
    for (const b of ["B0", "B1", "B2"]) expect(through[b]?.model_free_count).toBeLessThanOrEqual(through[b]?.count ?? -1);
    expect(through["B2"]?.rows.filter((r) => r.category !== "duplicate")).toEqual([]);
    expect(live.summary).toMatch(/\*\*B2\*\*: \d+ of \d+ stop cases got through; \d+ of them were for a model-free rule/);
  });

  it("round-trips through JSON without loss", () => {
    expect(JSON.parse(JSON.stringify(live.result))).toEqual(live.result);
  });
});

describe("the committed result files pass the same lint", () => {
  const dir = fileURLToPath(new URL("../../../data/results/", import.meta.url));
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^harness-\d+-(live|recorded)\.json$/.test(f)) : [];

  it.skipIf(files.length === 0)("every harness-<seed>-<mode>.json under data/results carries n, seed and commit on each number", () => {
    for (const f of files) {
      const result = JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, unknown>;
      expect(lintReportedNumbers(result), f).toEqual([]);
      expect(String(result["label"]), f).toMatch(/^(MEASURED|RECORDED)\(n=\d+, seed=\d+, commit=[0-9a-f]{7}\)$/);
      expect(result["mode"] === "live" ? String(result["label"]).startsWith("MEASURED") : String(result["label"]).startsWith("RECORDED"), f).toBe(true);
    }
  });
});

describe("the summary passes scripts/docs-check.py", () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const python = spawnSync("python3", ["--version"]);

  function check(summary: string, json: string): string[] {
    const dir = mkdtempSync(join(tmpdir(), "harness-docs-"));
    mkdirSync(join(dir, "scripts"));
    mkdirSync(join(dir, "docs"));
    mkdirSync(join(dir, "data/results"), { recursive: true });
    copyFileSync(join(root, "scripts/docs-check.py"), join(dir, "scripts/docs-check.py"));
    copyFileSync(join(root, "docs/facts-register.md"), join(dir, "docs/facts-register.md"));
    writeFileSync(join(dir, "data/results/harness-7-recorded.md"), summary);
    writeFileSync(join(dir, "data/results/harness-7-recorded.json"), json);
    const out = execFileSync("python3", [join(dir, "scripts/docs-check.py")], { cwd: dir, encoding: "utf8" });
    return out.split("\n").filter((l) => l.includes("data/results/"));
  }

  it.skipIf(python.error !== undefined)("raises no problem for the generated files (unknown F-IDs, bare numbers, style, PAN-like runs)", async () => {
    const run = await testRun({ mode: "recorded", n: 100 });
    expect(check(run.summary, JSON.stringify(run.result, null, 2))).toEqual([]);
  }, RUN_MS);

  it.skipIf(python.error !== undefined)("and the check does bite: a bare percentage and an unknown register ID are reported", () => {
    const problems = check("# Bad\n\n- overspend was 12.5% of runs\n- see [F999]\n", "{}");
    expect(problems.length).toBeGreaterThan(0);
  });
});
