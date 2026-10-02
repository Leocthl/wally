// B-10: the recorded demo answers (JUDGE_PROVIDER=replay) and the live Laya judge lead to the same R10 outcome under
// the proposed thresholds (data/results/judge-thresholds-proposal.json), using the engine's own evaluateR10. The
// offline part always runs; the live part skips itself when /health does not answer.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENGINE_CONFIG, type EngineConfig } from "@laisee/core/config";
import type { JudgeRecord } from "@laisee/core/ports";
import { evaluateR10 } from "@laisee/core/rules";
import { DEFAULT_LAYA_BASE_URL, DEFAULT_LAYA_MODEL } from "../src/judge/config";
import { loadReplayRecordings } from "../src/judge/replay-recordings";
import { ReplayJudge } from "../src/judge/replay-judge";
import { SystemOneJudge } from "../src/judge/system-one-judge";
import { DEMO_LISTINGS, demoInput, mandate, type DemoListing } from "./support/inputs";

const BASE_URL = process.env["LAYA_BASE_URL"] ?? DEFAULT_LAYA_BASE_URL;
const MODEL = process.env["LAYA_MODEL"] ?? DEFAULT_LAYA_MODEL;
const LIVE_TIMEOUT_MS = 20_000;
/** Per test: generous, because a loaded machine queues calls on the one-worker server. */
const TEST_TIMEOUT_MS = 60_000;

const proposal = JSON.parse(readFileSync(new URL("../../../data/results/judge-thresholds-proposal.json", import.meta.url), "utf8")) as {
  thresholds: { t_inj: number; t_sell_deny: number; t_sell_esc: number; t_scope: number; t_esc: number | null };
};
const withJudge = (judge: EngineConfig["judge"]): EngineConfig => ({ ...ENGINE_CONFIG, judge });
const PROPOSED = withJudge({ ...proposal.thresholds, t_esc: proposal.thresholds.t_esc ?? ENGINE_CONFIG.judge.t_esc });

type Verdict = "APPROVE" | "ESCALATE" | "DENY";
/** The R10 part of the decision: DENY beats ESCALATE beats pass, as the engine combines rule results. */
function r10(record: JudgeRecord, config: EngineConfig): { readonly verdict: Verdict; readonly templates: readonly string[] } {
  const results = evaluateR10({ mandate, judge: record, config });
  const failed = results.filter((r) => r.result === "FAIL");
  const verdict: Verdict = failed.some((r) => r.verdict === "DENY") ? "DENY" : failed.length > 0 ? "ESCALATE" : "APPROVE";
  return { verdict, templates: failed.map((r) => r.template_id ?? "").sort() };
}

const replay = new ReplayJudge({ recordings: loadReplayRecordings() });
const recorded = async (name: DemoListing) => replay.assess(demoInput(name), { timeoutMs: 1000 });

describe("recorded demo answers under the proposed and the current thresholds", () => {
  it.each([PROPOSED, ENGINE_CONFIG])("tee and socks pass R10, the injected tee is denied by R10.injection (%#)", async (config) => {
    expect(r10(await recorded("apparel-tee"), config).verdict).toBe("APPROVE");
    expect(r10(await recorded("apparel-socks"), config).verdict).toBe("APPROVE");
    const injected = r10(await recorded("injected-tee"), config);
    expect(injected.verdict).toBe("DENY");
    expect(injected.templates).toContain("R10.injection");
  });

  it("the earbuds are stopped by R10 under the proposed thresholds (R6 stops them first in the engine)", async () => {
    expect(r10(await recorded("off-category-earbuds"), PROPOSED).verdict).not.toBe("APPROVE");
  });
});

async function layaIsUp(): Promise<boolean> {
  try {
    return (await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(1_500) })).ok;
  } catch {
    return false;
  }
}

describe.skipIf(!(await layaIsUp()))("recorded and live demo answers agree on the R10 outcome (live Laya)", () => {
  const live = new SystemOneJudge({ provider: "laya", baseUrl: BASE_URL, model: MODEL });
  it.each([...DEMO_LISTINGS])("%s", { timeout: TEST_TIMEOUT_MS }, async (name) => {
    const record = await live.assess(demoInput(name), { timeoutMs: LIVE_TIMEOUT_MS });
    expect(record.status).toBe("OK");
    expect(r10(record, PROPOSED)).toEqual(r10(await recorded(name), PROPOSED));
  });
});
