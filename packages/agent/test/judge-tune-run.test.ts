import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CORPUS_DIR } from "../src/judge/fit/corpus";
import { runTune, type TuneRun } from "../src/judge/fit/tune";
import { WORDING_VARIANTS } from "../src/judge/fit/variants";
import { startMockSystemOne, type MockSystemOne } from "./support/mock-system-one";

// Fit loops and property runs slow down on a loaded machine; give every test here an explicit budget.
vi.setConfig({ testTimeout: 60_000 });

let mock: MockSystemOne;
let dir: string;
let runDir: string;

/** Two families with two cases each, taken from the real corpus files. */
function tinyCorpus(into: string): void {
  const pick = (file: string, n: number) => (JSON.parse(readFileSync(join(DEFAULT_CORPUS_DIR, file), "utf8")) as { cases: unknown[] }).cases.slice(0, n);
  const doc = { corpus: "judge-corpus/tiny", provenance: "SIMULATED", note: "test", cases: [...pick("clean-apparel.json", 2), ...pick("off-category.json", 2)] };
  writeFileSync(join(into, "tiny.json"), JSON.stringify(doc));
}

beforeEach(async () => {
  mock = await startMockSystemOne();
  dir = mkdtempSync(join(tmpdir(), "tune-"));
  runDir = mkdtempSync(join(tmpdir(), "tune-run-"));
  tinyCorpus(dir);
});
afterEach(async () => {
  await mock.close();
  rmSync(dir, { recursive: true, force: true });
  rmSync(runDir, { recursive: true, force: true });
});

describe("runTune against the mock server", () => {
  const options = () => ({ baseUrl: mock.baseUrl, model: "typed-decisions", date: "2026-10-02", timeoutMs: 2000, runPath: join(runDir, "run.json"), corpusDir: dir });

  it("runs every variant on tuning, decides, then judges held-out once, and saves each stage", { timeout: 60_000 }, async () => {
    const run = await runTune(options());
    expect(run.variants.map((v) => v.id)).toEqual(WORDING_VARIANTS.map((v) => v.id));
    expect(run.split.tuningIds).toHaveLength(2);
    expect(run.split.heldoutIds).toHaveLength(2);
    for (const v of run.variants) expect(v.results.map((r) => r.id).sort()).toEqual([...run.split.tuningIds].sort());
    expect(run.heldout?.results.map((r) => r.id).sort()).toEqual([...run.split.heldoutIds].sort());
    expect(Date.parse(run.selection!.decidedAt)).toBeLessThanOrEqual(Date.parse(run.heldout!.startedAt));
    expect(run.anchors?.length).toBe(6);
    const saved = JSON.parse(readFileSync(join(runDir, "run.json"), "utf8")) as TuneRun;
    expect(saved.selection?.winner).toBe(run.selection?.winner);
  });

  it("measures Chinese cases on the raw checkpoint: the language gate is off for this tool", { timeout: 60_000 }, async () => {
    const zhDir = mkdtempSync(join(tmpdir(), "tune-zh-"));
    try {
      const cases = (JSON.parse(readFileSync(join(dir, "tiny.json"), "utf8")) as { cases: { listing: { text: string } }[] }).cases;
      const chinese = ["輕量羽絨褸好輕身，摺埋可以塞入細袋。", "粗針羊毛冷衫，人手收邊，厚身得嚟又唔痕。", "校服背心裙，滌棉布料，唔易皺，七日內可以換尺碼。", "藍牙耳機，連續播放十小時，附送充電盒。"];
      const doc = { corpus: "judge-corpus/tiny-zh", provenance: "SIMULATED", note: "test", cases: cases.map((c, i) => ({ ...c, listing: { ...c.listing, text: chinese[i] ?? "" } })) };
      writeFileSync(join(zhDir, "tiny-zh.json"), JSON.stringify(doc));
      const run = await runTune({ ...options(), corpusDir: zhDir, runPath: join(runDir, "zh-run.json") });
      const results = [...run.variants.flatMap((v) => v.results), ...(run.heldout?.results ?? [])];
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.status === "OK" && r.answers !== null)).toBe(true);
      const asked = mock.judgeRequests().map((r) => (r.body as { state: { listing: { description: string } } }).state.listing.description);
      expect(asked.some((d) => chinese.some((c) => d.includes(c.slice(0, 6))))).toBe(true);
    } finally {
      rmSync(zhDir, { recursive: true, force: true });
    }
  });

  it("resumes from the run file without asking the server again", { timeout: 60_000 }, async () => {
    await runTune(options());
    const calls = mock.judgeRequests().length;
    await runTune(options());
    expect(mock.judgeRequests().length).toBe(calls);
  });
});
