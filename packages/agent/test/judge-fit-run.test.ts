import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeJudge } from "@wally/core/testing";
import { loadCorpus } from "../src/judge/fit/corpus";
import { ServerUnreachableError, runFit } from "../src/judge/fit/fit";
import type { FitReport } from "../src/judge/fit/report";
import { runCorpus } from "../src/judge/fit/run";
import { mandate } from "./support/inputs";
import { docsLint } from "./support/docs-lint";
import { startMockSystemOne, type MockSystemOne } from "./support/mock-system-one";

// Fit loops and property runs slow down on a loaded machine; give every test here an explicit budget.
vi.setConfig({ testTimeout: 60_000 });

let mock: MockSystemOne;
let outDir: string;
beforeEach(async () => {
  mock = await startMockSystemOne();
  outDir = mkdtempSync(join(tmpdir(), "judge-fit-"));
});
afterEach(async () => {
  await mock.close();
  rmSync(outDir, { recursive: true, force: true });
});

describe("runCorpus", () => {
  it("sends every case through the judge in order and records status, truncation and latency", async () => {
    const corpus = loadCorpus().slice(0, 4);
    const judge = new FakeJudge({ respond: (input) => (input.listingText.length > 0 ? { latencyMs: 7 } : {}) });
    const progress: string[] = [];
    const results = await runCorpus(corpus, { judge, timeoutMs: 1000, mandate, onProgress: (d, t, id) => progress.push(`${d}/${t} ${id}`) });
    expect(results.map((r) => r.id)).toEqual(corpus.map((c) => c.id));
    expect(results.every((r) => r.status === "OK" && r.latencyMs === 7 && r.answers !== null)).toBe(true);
    expect(judge.calls).toHaveLength(4);
    expect(progress).toHaveLength(4);
    expect(judge.calls[0]?.listingText).toBe(corpus[0]?.listing.text);
  });

  it("keeps failed calls as rows without answers (fail closed, nothing invented)", async () => {
    const corpus = loadCorpus().slice(0, 2);
    const results = await runCorpus(corpus, { judge: new FakeJudge({ inputTruncated: true }), timeoutMs: 1000, mandate });
    expect(results.map((r) => [r.status, r.inputTruncated, r.answers])).toEqual([["ERROR", true, null], ["ERROR", true, null]]);
  });
});

describe("runFit against the mock server", () => {
  /** runFit pushes the whole corpus through the mock (164 cases since B-19), so it outgrows the 5 s default under load. */
  const RUN_FIT_TIMEOUT_MS = 60_000;
  const base = { model: "typed-decisions", date: "2026-10-02", timeoutMs: 5_000, compareCanonical: true, compareWindows: true } as const;

  it("writes a JSON and a markdown report that pass the doc-style checks", { timeout: RUN_FIT_TIMEOUT_MS }, async () => {
    const lines: string[] = [];
    const { jsonPath, markdownPath } = await runFit({ ...base, baseUrl: mock.baseUrl, outDir, log: (l) => lines.push(l) });
    expect(jsonPath.endsWith("judge-fit-2026-10-02.json")).toBe(true);
    expect(markdownPath.endsWith("judge-fit-2026-10-02.md")).toBe(true);
    const json = JSON.parse(readFileSync(jsonPath, "utf8")) as FitReport;
    expect(json.schema).toBe("judge-fit/v1");
    expect(json.corpus.n).toBe(loadCorpus().length);
    expect(json.run.statusCounts.OK).toBe(json.corpus.n);
    expect(json.meta.server.revision).toBe("55cf4c4e");
    expect(json.rotation).toHaveLength(4);
    expect(json.anchors).toHaveLength(6);
    expect(docsLint(readFileSync(markdownPath, "utf8"))).toEqual([]);
    expect(lines.length).toBeGreaterThan(3);
  });

  it("skips the canonical pass on request", { timeout: RUN_FIT_TIMEOUT_MS }, async () => {
    const { report } = await runFit({ ...base, baseUrl: mock.baseUrl, outDir, compareCanonical: false });
    expect(report.rotation).toBeNull();
  });

  it("judges the listings longer than one window in windows, and skips that pass on request", { timeout: RUN_FIT_TIMEOUT_MS }, async () => {
    const { report } = await runFit({ ...base, baseUrl: mock.baseUrl, outDir });
    const long = loadCorpus().filter((c) => c.listing.text.length > 2_000).map((c) => c.id);
    expect(report.windows?.rows.map((w) => w.id)).toEqual(long);
    expect(long.length).toBeGreaterThanOrEqual(3);
    const skipped = await runFit({ ...base, baseUrl: mock.baseUrl, outDir, compareWindows: false });
    expect(skipped.report.windows).toBeNull();
  });

  it("warms up first and sends only requests the judge adapter would send", { timeout: RUN_FIT_TIMEOUT_MS }, async () => {
    await runFit({ ...base, baseUrl: mock.baseUrl, outDir, compareCanonical: false, compareWindows: false });
    const posts = mock.judgeRequests();
    expect(posts.length).toBe(1 + loadCorpus().length + 6);
    for (const p of posts) expect((p.body as { model: string }).model).toBe("typed-decisions");
  });

  it("fails with a clear error and no files when the server is not there", async () => {
    const closed = await startMockSystemOne();
    const baseUrl = closed.baseUrl;
    await closed.close();
    await expect(runFit({ ...base, baseUrl, outDir })).rejects.toBeInstanceOf(ServerUnreachableError);
  });
});
