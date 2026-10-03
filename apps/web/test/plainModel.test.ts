// The plain Evidence model: the few figures the plain cards show, read from a loaded run. Every figure keeps the chip of
// the file it came from; a figure the file does not carry is absent, never guessed.
import { describe, expect, it } from "vitest";
import { loadHarnessRuns } from "../src/evidence/data";
import { parseHarnessFile } from "../src/evidence/harnessGuard";
import { pickRun } from "../src/evidence/select";
import { readPlain } from "../src/evidence/plainModel";
import type { HarnessRun } from "../src/evidence/types";
import { CHIP, harnessFile, rate, wiringFile } from "./evidenceFixtures";

type Json = Record<string, unknown>;

/** A copy of an object without some keys. */
const without = (o: Json, keys: readonly string[]): Json => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));

function run(raw: Json, file = "harness-1-live.json"): HarnessRun {
  const parsed = parseHarnessFile(file, raw);
  if (!parsed.ok) throw new Error(parsed.problems.join("; "));
  return parsed.value;
}

/** The fixture with some baseline fields replaced (the fixture's own B0, B1 and B2 stay where not named). */
function withBaselines(over: Partial<Record<"B0" | "B1" | "B2", Json>>, extra: Json = {}): Json {
  const raw = harnessFile(extra);
  const b = raw["baselines"] as Record<string, Json>;
  return { ...raw, baselines: { B0: { ...b["B0"], ...over.B0 }, B1: { ...b["B1"], ...over.B1 }, B2: { ...b["B2"], ...over.B2 } } };
}

describe("readPlain on a small file", () => {
  const raw = withBaselines(
    { B0: { overspend_rate: rate(4, 20), stop_breach_rate: rate(3, 8), false_block_rate: rate(2, 10) }, B1: { false_block_rate: rate(0, 10) } },
    { injection_corpus: { items: 40, false_allow_rate: rate(8, 40), tuning_split: rate(2, 20), heldout_split: rate(6, 20), benign_flagged_rate: rate(0, 8) } },
  );
  const model = readPlain(run(raw));

  it("counts the purchases in the run", () => {
    expect(model.total).toBe(20);
    expect(model.sampleN).toBe(20);
  });

  it("went over the limit: Wally, rules only and an AI on its own, as the file counts them", () => {
    expect(model.limit).toMatchObject({ wally: { k: 0, n: 20 }, rules: { k: 0, n: 20 }, alone: { k: 4, n: 20 } });
    expect(model.limit?.wally.chip.text).toBe(CHIP);
  });

  it("stopped before paying: breaches turned into stops, with the same denominator and chip", () => {
    expect(model.risky).toMatchObject({ wally: { k: 8, n: 8 }, rules: { k: 8, n: 8 }, alone: { k: 5, n: 8 } });
    expect(model.risky?.wally.chip.text).toBe(CHIP);
  });

  it("trick listings: the ones only the listing check can catch, as stops", () => {
    expect(model.tricks).toMatchObject({ wally: { k: 4, n: 4 }, rules: { k: 1, n: 4 }, alone: { k: 4, n: 4 } });
  });

  it("approved: false blocks turned into purchases that went through", () => {
    expect(model.honest).toMatchObject({ wally: { k: 9, n: 10 }, rules: { k: 10, n: 10 }, alone: { k: 8, n: 10 } });
  });

  it("the listing check on its own, from the injection corpus", () => {
    expect(model.judgeMiss).toMatchObject({ k: 8, n: 40 });
  });

  it("speed: the typical and the nearly-all time of Wally, and the typical time of the other two", () => {
    expect(model.speed).toMatchObject({ kind: "measured", typicalMs: 250.5, nearlyAllMs: 690.2, rulesTypicalMs: 0.1, aloneTypicalMs: 390 });
  });

  it("says what the numbers back: rules already hold the limit, and the listing check adds protection against tricks", () => {
    expect(model.rulesHoldLimit).toBe(true);
    expect(model.listingCheckAdds).toBe(true);
  });

  it("is product evidence in this file and says whether the run was live", () => {
    expect(model.wiringOnly).toBe(false);
    expect(model.mode).toBe("live");
  });
});

describe("what the numbers back", () => {
  it("does not say the listing check adds anything when rules alone stopped as many tricks", () => {
    const model = readPlain(run(withBaselines({ B1: { injection_pass_through_rate: rate(0, 4) } })));
    expect(model.listingCheckAdds).toBe(false);
  });

  it("does not say rules hold the limit when they do not", () => {
    expect(readPlain(run(withBaselines({ B1: { overspend_rate: rate(2, 20) } }))).rulesHoldLimit).toBe(false);
    expect(readPlain(run(withBaselines({ B2: { overspend_rate: rate(1, 20) } }))).rulesHoldLimit).toBe(false);
  });

  it("says neither without a rules-only column", () => {
    const b = harnessFile()["baselines"] as Record<string, Json>;
    const model = readPlain(run({ ...harnessFile(), baselines: { B0: b["B0"], B2: b["B2"] } }));
    expect(model.limit?.rules).toBeNull();
    expect(model.rulesHoldLimit).toBe(false);
    expect(model.listingCheckAdds).toBe(false);
  });
});

describe("readPlain when the file is thinner", () => {
  it("leaves out what the file does not carry, and keeps the rest", () => {
    const b = harnessFile()["baselines"] as Record<string, Json>;
    const model = readPlain(run({ ...harnessFile(), baselines: { ...b, B2: without(b["B2"] as Json, ["overspend_rate", "stop_breach_rate"]) } }));
    expect(model.limit).toBeNull();
    expect(model.risky).toBeNull();
    expect(model.honest).not.toBeNull();
    expect(model.judgeMiss).toBeNull();
  });

  it("keeps Wally's figure when a comparison column is missing", () => {
    const b = harnessFile()["baselines"] as Record<string, Json>;
    const model = readPlain(run({ ...harnessFile(), baselines: { ...b, B0: without(b["B0"] as Json, ["overspend_rate"]) } }));
    expect(model.limit?.wally).toMatchObject({ k: 0, n: 20 });
    expect(model.limit?.alone).toBeNull();
    expect(model.limit?.rules).toMatchObject({ k: 0, n: 20 });
  });

  it("has nothing about Wally when B2 is not in the file", () => {
    const b = harnessFile()["baselines"] as Record<string, Json>;
    const model = readPlain(run({ ...harnessFile(), baselines: { B0: b["B0"], B1: b["B1"] } }));
    expect(model.limit).toBeNull();
    expect(model.risky).toBeNull();
    expect(model.tricks).toBeNull();
    expect(model.honest).toBeNull();
    expect(model.speed.kind).toBe("absent");
  });

  it("a recorded run has no measured speed and says so", () => {
    const recorded = harnessFile({ mode: "recorded" });
    const b = recorded["baselines"] as Record<string, Json>;
    const notMeasured = { measured: false, note: "not measured: replayed", chip: "RECORDED(n=20, seed=1, commit=abcdef1)" };
    const model = readPlain(run({ ...recorded, baselines: Object.fromEntries(Object.entries(b).map(([k, v]) => [k, { ...v, latency: notMeasured }])) }, "harness-1-recorded.json"));
    expect(model.speed).toMatchObject({ kind: "unmeasured" });
    expect(model.mode).toBe("recorded");
  });

  it("a wiring-only run is marked, so the page never shows its numbers as results", () => {
    expect(readPlain(run(wiringFile())).wiringOnly).toBe(true);
  });
});

describe("what counted as risky", () => {
  it("names the categories that held purchases to stop, not the ones with only honest purchases", () => {
    const model = readPlain(run(harnessFile({
      categories: [
        { category: "within_budget", B2: { scenarios: 6, legitimate: 6, completed: rate(6, 6), false_block: rate(0, 6) } },
        { category: "wrong_merchant", B2: { scenarios: 8, legitimate: 4, completed: rate(4, 4), false_block: rate(0, 4) } },
      ],
    })));
    expect(model.riskyKinds).toEqual(["wrong_merchant"]);
  });

  it("is empty when the file lists no categories", () => {
    const raw = { ...harnessFile() };
    delete raw["categories"];
    expect(readPlain(run(raw)).riskyKinds).toEqual([]);
  });
});

describe("readPlain on the committed result files", () => {
  const runs = loadHarnessRuns().items;
  const pick = pickRun(runs);
  const chosen = runs.find((r) => r.file === pick?.file);

  it("reads the run the screen would choose, with counts that fit their denominators", () => {
    expect(chosen).toBeDefined();
    const model = readPlain(chosen as HarnessRun);
    for (const v of [model.limit, model.risky, model.tricks, model.honest]) {
      if (v === null) continue;
      for (const r of [v.wally, v.rules, v.alone]) {
        if (r === null) continue;
        expect(r.k).toBeLessThanOrEqual(r.n);
        expect(["MEASURED", "RECORDED"]).toContain(r.chip.kind);
      }
    }
    expect(model.total).toBeGreaterThan(0);
  });
});
