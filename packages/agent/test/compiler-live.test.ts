// Live test of the sentence-to-rules compiler against the running Qwen server (127.0.0.1:8809). Skips itself
// when the server is not reachable. With the model up it must agree with the rule-based compile
// (apps/web/src/booth/compile.ts, compile.test.ts) on the mandate sentences M0, M1 and M2 [F20, F90].
import { describe, expect, it } from "vitest";
import type { CompiledRules } from "@laisee/core/generated";
import { loadFixture } from "@laisee/core/testing/fixtures";
import { compileMandateText } from "../src/compiler";
import { createChatClient, DEFAULT_LOCAL_PLANNER_URL } from "../src/planner/local";

const URL_ = process.env["PLANNER_BASE_URL"] ?? DEFAULT_LOCAL_PLANNER_URL;

async function qwenIsUp(): Promise<boolean> {
  try {
    return (await fetch(`${URL_}/health`, { signal: AbortSignal.timeout(1_500) })).ok;
  } catch {
    return false;
  }
}

const up = await qwenIsUp();
const LIVE_TIMEOUT = 120_000;
const NOW = new Date("2026-10-03T02:00:00Z");
const M0_RULES: CompiledRules = loadFixture("mandate/m0.json", "mandate").rules;
const client = createChatClient({ baseUrl: URL_ });
const compile = (text: string, locale: "en" | "zh-HK" = "en") => compileMandateText({ text, locale, client, now: NOW, timeoutMs: 60_000 });

describe.skipIf(!up)("compiler against the live Qwen server", () => {
  it("M0 matches the rule-based compile", async () => {
    const out = await compile("HK$800 this month for clothes, verified sellers only");
    expect(out.ok && out.rules).toEqual(M0_RULES);
    expect(out.ok && out.validUntil).toBe("2026-10-31T15:59:59Z");
  }, LIVE_TIMEOUT);

  it("M1 matches: half of what is left per purchase", async () => {
    const out = await compile("HK$800 this month for clothes, verified sellers only, no single purchase above half of what is left");
    expect(out.ok && out.rules).toEqual({ ...M0_RULES, per_purchase: { share_of_remaining_bp: 5000 } });
  }, LIVE_TIMEOUT);

  it("M2 matches: seven days, ask above HK$300", async () => {
    const out = await compile("HK$800 for clothes over the next 7 days, verified sellers only; ask me above HK$300");
    expect(out.ok && out.rules).toEqual({ ...M0_RULES, per_purchase: { ask_above_minor: 30_000 } });
    expect(out.ok && out.validUntil).toBe("2026-10-10T02:00:00Z");
  }, LIVE_TIMEOUT);

  it("reads the Cantonese form of M0", async () => {
    const out = await compile("呢個月買衫，預算八百蚊，只限驗證賣家", "zh-HK");
    expect(out.ok && out.rules).toEqual(M0_RULES);
  }, LIVE_TIMEOUT);
});
