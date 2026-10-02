import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JudgeConfigError, createJudgeFromEnv, parseJudgeEnv } from "../src/judge/create-judge";
import { ReplayJudge } from "../src/judge/replay-judge";
import { ShadowJudge } from "../src/judge/shadow-judge";
import { SystemOneJudge } from "../src/judge/system-one-judge";
import { demoInput } from "./support/inputs";
import { startMockSystemOne, type MockSystemOne } from "./support/mock-system-one";

const KEY = "factory-test-key-77c1";

function settingsOf(env: Record<string, string | undefined>) {
  const result = parseJudgeEnv(env);
  if (!result.ok) throw new Error(`expected settings, got: ${result.error}`);
  return result.settings;
}
function errorOf(env: Record<string, string | undefined>): string {
  const result = parseJudgeEnv(env);
  if (result.ok) throw new Error("expected a configuration error");
  return result.error;
}

describe("parseJudgeEnv", () => {
  it("defaults to the local Laya judge in shadow mode with the pinned model", () => {
    expect(settingsOf({})).toEqual({
      provider: "laya",
      mode: "shadow",
      baseUrl: "http://127.0.0.1:8808",
      model: "typed-decisions",
    });
  });

  it("reads LAYA_BASE_URL and LAYA_MODEL", () => {
    const s = settingsOf({ LAYA_BASE_URL: "http://localhost:9000", LAYA_MODEL: "typed-decisions", JUDGE_MODE: "enforce" });
    expect(s).toMatchObject({ provider: "laya", mode: "enforce", baseUrl: "http://localhost:9000" });
  });

  it("treats blank values like .env.example ships them as unset", () => {
    expect(settingsOf({ JUDGE_PROVIDER: "laya", JEV_BASE_URL: "", TYPESAFE_API_KEY: "  ", LAYA_BASE_URL: "" }).baseUrl).toBe("http://127.0.0.1:8808");
  });

  it("keeps the local-only promise: a non-loopback Laya URL needs an explicit opt-in", () => {
    expect(errorOf({ LAYA_BASE_URL: "http://192.0.2.10:8808" })).toMatch(/LAYA_ALLOW_REMOTE/);
    expect(settingsOf({ LAYA_BASE_URL: "http://192.0.2.10:8808", LAYA_ALLOW_REMOTE: "1" }).baseUrl).toBe("http://192.0.2.10:8808");
    expect(settingsOf({ LAYA_BASE_URL: "http://[::1]:8808" }).baseUrl).toBe("http://[::1]:8808");
  });

  it("hosted Jev needs a key, the pinned model by default, and https for a remote host", () => {
    expect(errorOf({ JUDGE_PROVIDER: "jev" })).toMatch(/TYPESAFE_API_KEY/);
    const s = settingsOf({ JUDGE_PROVIDER: "jev", TYPESAFE_API_KEY: KEY });
    expect(s).toMatchObject({ provider: "jev", baseUrl: "https://api.typesafe.ai", model: "jev-1.13.0", apiKey: KEY });
    expect(errorOf({ JUDGE_PROVIDER: "jev", TYPESAFE_API_KEY: KEY, JEV_BASE_URL: "http://api.example.invalid" })).toMatch(/https/);
    expect(settingsOf({ JUDGE_PROVIDER: "jev", TYPESAFE_API_KEY: KEY, JEV_BASE_URL: "http://127.0.0.1:4000" }).baseUrl).toBe("http://127.0.0.1:4000");
  });

  it("replay needs no URL, model or key", () => {
    expect(settingsOf({ JUDGE_PROVIDER: "replay", JUDGE_MODE: "enforce" })).toMatchObject({ provider: "replay", mode: "enforce" });
  });

  it.each([
    [{ JUDGE_PROVIDER: "llm" }, /JUDGE_PROVIDER/],
    [{ JUDGE_PROVIDER: "claude" }, /JUDGE_PROVIDER/],
    [{ JUDGE_MODE: "dry-run" }, /JUDGE_MODE/],
    [{ LAYA_BASE_URL: "not a url" }, /LAYA_BASE_URL/],
    [{ LAYA_BASE_URL: "ftp://127.0.0.1/" }, /LAYA_BASE_URL/],
  ])("rejects %j", (env, pattern) => {
    expect(errorOf(env)).toMatch(pattern);
  });

  it("never puts the key in an error message", () => {
    const messages = [
      errorOf({ JUDGE_PROVIDER: "jev", TYPESAFE_API_KEY: KEY, JEV_BASE_URL: "http://api.example.invalid" }),
      errorOf({ JUDGE_PROVIDER: "jev", TYPESAFE_API_KEY: KEY, JUDGE_MODE: "x" }),
    ];
    for (const m of messages) expect(m).not.toContain(KEY);
  });
});

describe("createJudgeFromEnv", () => {
  let mock: MockSystemOne;
  beforeEach(async () => {
    mock = await startMockSystemOne();
  });
  afterEach(async () => {
    await mock.close();
  });

  it("wraps the judge in a ShadowJudge in shadow mode and not in enforce mode", () => {
    expect(createJudgeFromEnv({ LAYA_BASE_URL: mock.baseUrl, JUDGE_MODE: "shadow" })).toBeInstanceOf(ShadowJudge);
    expect(createJudgeFromEnv({ LAYA_BASE_URL: mock.baseUrl, JUDGE_MODE: "enforce" })).toBeInstanceOf(SystemOneJudge);
    expect(createJudgeFromEnv({ JUDGE_PROVIDER: "replay", JUDGE_MODE: "enforce" })).toBeInstanceOf(ReplayJudge);
  });

  it("throws a JudgeConfigError for bad configuration, at composition time", () => {
    expect(() => createJudgeFromEnv({ JUDGE_PROVIDER: "jev" })).toThrow(JudgeConfigError);
  });

  it("assesses through the mock Laya server, shadow flag following JUDGE_MODE", async () => {
    const enforce = await createJudgeFromEnv({ LAYA_BASE_URL: mock.baseUrl, JUDGE_MODE: "enforce" }).assess(demoInput("apparel-tee"), { timeoutMs: 2000 });
    const shadow = await createJudgeFromEnv({ LAYA_BASE_URL: mock.baseUrl, JUDGE_MODE: "shadow" }).assess(demoInput("apparel-tee"), { timeoutMs: 2000 });
    expect([enforce.status, enforce.shadow]).toEqual(["OK", false]);
    expect([shadow.status, shadow.shadow]).toEqual(["OK", true]);
  });

  it("serves the recorded answers for the demo listings with JUDGE_PROVIDER=replay, offline", async () => {
    const record = await createJudgeFromEnv({ JUDGE_PROVIDER: "replay", JUDGE_MODE: "enforce" }).assess(demoInput("injected-tee"), { timeoutMs: 1000 });
    expect(record).toMatchObject({ provider: "replay", status: "OK", shadow: false });
  });
});
