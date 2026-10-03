import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeJudge } from "@wally/core/testing";
import { ShadowJudge } from "../src/judge/shadow-judge";
import { SystemOneJudge } from "../src/judge/system-one-judge";
import { isWarmable } from "../src/judge/warm-up";
import { demoInput } from "./support/inputs";
import { MOCK_REVISION, startMockSystemOne, type MockSystemOne } from "./support/mock-system-one";

let mock: MockSystemOne;
beforeEach(async () => {
  mock = await startMockSystemOne();
});
afterEach(async () => {
  await mock.close();
});

const laya = () => new SystemOneJudge({ provider: "laya", baseUrl: mock.baseUrl, model: "typed-decisions" });

describe("warmUp: the first call after a Laya restart is slow (F26), so do it before a judge is watching", () => {
  it("sends one full-size request, caches the checkpoint version and reports ok with a measured time", async () => {
    const result = await laya().warmUp({ timeoutMs: 2_000 });
    expect(result.ok).toBe(true);
    expect(Number.isInteger(result.latencyMs) && result.latencyMs >= 0).toBe(true);
    const posts = mock.judgeRequests();
    expect(posts).toHaveLength(1);
    expect(Object.keys((posts[0]?.body as { questions: object }).questions)).toHaveLength(9);
    expect(mock.requests().filter((r) => r.path === "/health")).toHaveLength(1);
  });

  it("makes the next assess skip the health lookup and report the version learned at warm-up", async () => {
    const judge = laya();
    await judge.warmUp({ timeoutMs: 2_000 });
    const record = await judge.assess(demoInput("apparel-tee"), { timeoutMs: 2_000 });
    expect(record.status).toBe("OK");
    expect(record.version).toBe(MOCK_REVISION.slice(0, 8));
    expect(mock.requests().filter((r) => r.path === "/health")).toHaveLength(1);
  });

  it("reports not ok, without throwing, when the server fails or is too slow", async () => {
    mock.setBehavior({ kind: "http", status: 500 });
    expect((await laya().warmUp({ timeoutMs: 2_000 })).ok).toBe(false);
    mock.setBehavior({ kind: "hang" });
    const slow = await laya().warmUp({ timeoutMs: 60 });
    expect(slow.ok).toBe(false);
    expect(slow.latencyMs).toBeLessThan(1_000);
  });

  it("reports not ok for an unusable timeout or an aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    expect((await laya().warmUp({ timeoutMs: 0 })).ok).toBe(false);
    expect((await laya().warmUp({ timeoutMs: 1_000, signal: controller.signal })).ok).toBe(false);
  });
});

describe("isWarmable", () => {
  it("is true for SystemOneJudge and for a ShadowJudge around anything, false for plain judges", async () => {
    expect(isWarmable(laya())).toBe(true);
    expect(isWarmable(new ShadowJudge(laya()))).toBe(true);
    expect(isWarmable(new FakeJudge())).toBe(false);
    const shadowed = new ShadowJudge(new FakeJudge());
    expect(await shadowed.warmUp({ timeoutMs: 100 })).toEqual({ ok: true, latencyMs: 0 });
  });

  it("a ShadowJudge forwards the warm-up to the real judge", async () => {
    const result = await new ShadowJudge(laya()).warmUp({ timeoutMs: 2_000 });
    expect(result.ok).toBe(true);
    expect(mock.judgeRequests()).toHaveLength(1);
  });
});
