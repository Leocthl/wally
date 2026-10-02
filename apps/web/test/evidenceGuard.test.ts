// Guards and the run choice for the Evidence screen: unknown fields ignored, missing required fields refused with words,
// malformed optional parts dropped and named, never a fabricated number.
import { describe, expect, it } from "vitest";
import { parseHarnessFile } from "../src/evidence/harnessGuard";
import { acceptanceGap, compareToB2, pickRun, wiringStatus } from "../src/evidence/select";
import type { HarnessRun } from "../src/evidence/types";
import { harnessFile, rate, wiringFile, without } from "./evidenceFixtures";

function ok(raw: unknown, file = "harness-1-live.json"): HarnessRun {
  const parsed = parseHarnessFile(file, raw);
  if (!parsed.ok) throw new Error(parsed.problems.join("; "));
  return parsed.value;
}

describe("parseHarnessFile", () => {
  it("reads a complete file and keeps k, n and the file's chip for every rate", () => {
    const run = ok(harnessFile());
    expect(run.mode).toBe("live");
    expect(run.baselines.B0?.rates["overspend_rate"]).toEqual({ k: 4, n: 20, chip: { kind: "MEASURED", text: "MEASURED(n=20, seed=1, commit=abcdef1)" } });
    expect(run.baselines.B2?.latency).toMatchObject({ measured: true, p50: 250.5, p95: 690.2, n: 20 });
    expect(run.acceptance?.map((a) => a.id)).toEqual(["T-H1", "T-H2"]);
    expect(run.categories?.[0]?.cells.B2?.falseBlock).toMatchObject({ k: 1, n: 6 });
    expect(run.b2Blocked?.map((s) => s.id)).toEqual(["s-01"]);
    expect(run.dropped).toEqual([]);
  });

  it("ignores unknown extra fields, at the top and inside blocks", () => {
    const run = ok(harnessFile({ future_field: { anything: 1 }, baselines: { ...(harnessFile()["baselines"] as object), B3: { overspend_rate: rate(0, 1) } } }));
    expect(Object.keys(run.baselines)).toEqual(["B0", "B1", "B2"]);
  });

  it.each([
    ["schema", "the schema"],
    ["mode", "mode"],
    ["run", "run time"],
    ["baselines", "baselines"],
  ])("refuses a file without %s, in words", (key, word) => {
    const parsed = parseHarnessFile("bad.json", without(harnessFile(), key));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.problems.join(" ")).toContain(word);
  });

  it("refuses another schema, a recording file and non-objects", () => {
    expect(parseHarnessFile("x.json", harnessFile({ schema: "laisee.harness.recording/v1" })).ok).toBe(false);
    expect(parseHarnessFile("x.json", harnessFile({ schema: "laisee.harness.result/v2" })).ok).toBe(false);
    for (const raw of [null, 3, "text", [], {}]) expect(parseHarnessFile("x.json", raw).ok).toBe(false);
  });

  it("refuses baselines that carry no readable rate at all", () => {
    expect(parseHarnessFile("x.json", harnessFile({ baselines: { B0: {}, B1: { overspend_rate: { k: 1 } } } })).ok).toBe(false);
  });

  it("drops a malformed rate and says where, instead of guessing", () => {
    const file = harnessFile();
    const baselines = file["baselines"] as Record<string, Record<string, unknown>>;
    const run = ok({ ...file, baselines: { ...baselines, B2: { ...baselines["B2"], overspend_rate: { k: 5, n: 3, chip: "MEASURED(n=3)" }, false_block_rate: { k: 1, n: 3, chip: "GUESSED" } } } });
    expect(run.baselines.B2?.rates["overspend_rate"]).toBeUndefined();
    expect(run.baselines.B2?.rates["false_block_rate"]).toBeUndefined();
    expect(run.dropped).toEqual(["baselines.B2.overspend_rate", "baselines.B2.false_block_rate"]);
  });

  it("accepts k = 0, k = n and n = 0", () => {
    const file = harnessFile();
    const baselines = file["baselines"] as Record<string, Record<string, unknown>>;
    const run = ok({ ...file, baselines: { ...baselines, B1: { ...baselines["B1"], overspend_rate: rate(0, 0), false_block_rate: rate(10, 10) } } });
    expect(run.baselines.B1?.rates["overspend_rate"]).toMatchObject({ k: 0, n: 0 });
    expect(run.baselines.B1?.rates["false_block_rate"]).toMatchObject({ k: 10, n: 10 });
  });

  it("keeps a recorded run's latency as 'not measured' with the file's note", () => {
    const file = harnessFile({ mode: "recorded" });
    const baselines = file["baselines"] as Record<string, Record<string, unknown>>;
    const run = ok({ ...file, baselines: { ...baselines, B2: { ...baselines["B2"], latency: { measured: false, note: "not measured: replayed", chip: "RECORDED(n=20, seed=1, commit=abcdef1)" } } } });
    expect(run.baselines.B2?.latency).toEqual({ measured: false, note: "not measured: replayed", chip: { kind: "RECORDED", text: "RECORDED(n=20, seed=1, commit=abcdef1)" } });
  });

  it("tolerates missing optional parts: components, evidence, categories, acceptance, scenarios", () => {
    let file = harnessFile();
    for (const key of ["components", "evidence", "categories", "acceptance", "scenarios", "judge_false_allow", "definitions"]) file = without(file, key);
    const run = ok(file);
    expect(run.components).toBeNull();
    expect(run.evidence).toBeNull();
    expect(run.categories).toBeNull();
    expect(run.acceptance).toBeNull();
    expect(run.b2Blocked).toBeNull();
  });

  it("reads empty categories as an empty list, not as missing", () => {
    expect(ok(harnessFile({ categories: [] })).categories).toEqual([]);
  });
});

describe("pickRun", () => {
  const live = (file: string, at: string, real: boolean) => ok(real ? harnessFile({ run: { run_at_utc8: at } }) : wiringFile({ run: { run_at_utc8: at } }), file);
  const recorded = (file: string, at: string) => ok(harnessFile({ mode: "recorded", run: { run_at_utc8: at } }), file);

  it("prefers the newest live run whose components are all real", () => {
    const runs = [live("a.json", "2026-10-03T09:00:00+08:00", true), live("b.json", "2026-10-03T11:00:00+08:00", false), live("c.json", "2026-10-03T10:00:00+08:00", true)];
    expect(pickRun(runs)).toEqual({ file: "c.json", reason: "live-all-real" });
  });

  it("falls back to the newest live run, then the newest recorded run", () => {
    expect(pickRun([live("a.json", "2026-10-03T09:00:00+08:00", false), live("b.json", "2026-10-03T08:00:00+08:00", false), recorded("r.json", "2026-10-03T12:00:00+08:00")])).toEqual({ file: "a.json", reason: "newest-live" });
    expect(pickRun([recorded("r1.json", "2026-10-03T09:00:00+08:00"), recorded("r2.json", "2026-10-03T10:00:00+08:00")])).toEqual({ file: "r2.json", reason: "newest-recorded" });
    expect(pickRun([])).toBeNull();
  });

  it("does not count a run without a components block as all real", () => {
    const bare = ok(without(harnessFile(), "components"), "bare.json");
    expect(pickRun([bare])).toEqual({ file: "bare.json", reason: "newest-live" });
  });
});

describe("wiringStatus", () => {
  it("is clear only when the file says product evidence and every component is real", () => {
    expect(wiringStatus(ok(harnessFile())).wiringOnly).toBe(false);
    const wiring = wiringStatus(ok(wiringFile()));
    expect(wiring.wiringOnly).toBe(true);
    expect(wiring.reasons).toContain("engine: a stand-in is not the real implementation");
  });

  it("treats absent flags as wiring-only: components not confirmed real", () => {
    const status = wiringStatus(ok(without(without(harnessFile(), "components"), "evidence")));
    expect(status.wiringOnly).toBe(true);
    expect(status.componentsConfirmed).toBe(false);
  });

  it("flags a run whose file says valid but lists a stand-in component", () => {
    expect(wiringStatus(ok(wiringFile({ evidence: { valid_as_product_evidence: true, reasons: [] } }))).wiringOnly).toBe(true);
  });
});

describe("compareToB2", () => {
  const r = (k: number, n: number) => ({ k, n, chip: { kind: "MEASURED" as const, text: "MEASURED(n=1)" } });

  it("says lower, higher or equal from k/n, and whether the intervals overlap", () => {
    expect(compareToB2(r(0, 150), r(90, 150))).toEqual({ kind: "lower", overlap: false });
    expect(compareToB2(r(66, 66), r(17, 66))).toEqual({ kind: "higher", overlap: false });
    expect(compareToB2(r(0, 84), r(0, 84))).toEqual({ kind: "equal", overlap: true });
    expect(compareToB2(r(1, 10), r(2, 10))).toEqual({ kind: "lower", overlap: true });
  });

  it("cannot compare when either side has n = 0 or is missing", () => {
    expect(compareToB2(r(0, 0), r(3, 91))).toEqual({ kind: "none", overlap: false });
    expect(compareToB2(null, r(3, 91))).toEqual({ kind: "none", overlap: false });
  });
});

describe("acceptanceGap", () => {
  const row = (id: string, k: number, n: number, pass: boolean) => ({ id, target: "t", evaluatedOn: "B2", pass, result: { k, n, chip: { kind: "MEASURED" as const, text: "MEASURED(n=1)" } } });

  it("T-H1: zero over-limit mints; a miss counts the mints", () => {
    expect(acceptanceGap(row("T-H1", 0, 120, true))).toEqual({ known: true, met: true, short: 0, consistent: true });
    expect(acceptanceGap(row("T-H1", 2, 120, false))).toEqual({ known: true, met: false, short: 2, consistent: true });
  });

  it("T-H2: at least the F38 share approved; a miss says how many more were needed", () => {
    expect(acceptanceGap(row("T-H2", 0, 66, false))).toEqual({ known: true, met: false, short: 60, consistent: true });
    expect(acceptanceGap(row("T-H2", 60, 66, true))).toEqual({ known: true, met: true, short: 0, consistent: true });
    expect(acceptanceGap(row("T-H2", 0, 0, false))).toEqual({ known: true, met: false, short: 0, consistent: true });
  });

  it("flags a verdict that disagrees with its own k/n, and leaves unknown ids to the file", () => {
    expect(acceptanceGap(row("T-H2", 0, 66, true)).consistent).toBe(false);
    expect(acceptanceGap(row("T-H9", 1, 2, true))).toEqual({ known: false, met: true, short: 0, consistent: true });
  });
});
