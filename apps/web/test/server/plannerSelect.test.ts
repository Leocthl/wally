// @vitest-environment node
// Planner choice at server start (PLANNER_PROVIDER=auto is the default): local when the Qwen server's /health answers,
// else rule when Laya's does, else replay. An explicit PLANNER_PROVIDER wins and nothing is probed. The probe is loopback
// only, refuses redirects and never throws. The choice is made once and fixed for the life of the booth.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PROBE_TIMEOUT_MS, probeHealth, selectPlanner, settledChoice, type HealthProbe } from "../../server/booth/plannerSelect";
import { settingsFromEnv } from "../../server/booth/settings";
import { composeBooth } from "../../server/compose";
import { MemoryLogStore } from "@laisee/core/testing";
import { ephemeralKeys } from "../../server/booth/keys";

const QWEN = "http://127.0.0.1:8809";
const LAYA = "http://127.0.0.1:8808";

/** A probe that says yes to the listed base urls and records what it was asked. */
function probes(up: readonly string[]): { probe: HealthProbe; asked: { url: string; allowRemote: boolean; timeoutMs: number }[] } {
  const asked: { url: string; allowRemote: boolean; timeoutMs: number }[] = [];
  return { asked, probe: async (url, allowRemote, timeoutMs) => (asked.push({ url, allowRemote, timeoutMs }), up.includes(url)) };
}

describe("settings", () => {
  it("unset and auto mean the start-up check picks; a named provider is the operator's choice; claude and unknown names are refused", () => {
    expect(settingsFromEnv({})).toMatchObject({ plannerAuto: true, plannerProvider: "rule", plannerUrl: QWEN, layaUrl: LAYA });
    expect(settingsFromEnv({ PLANNER_PROVIDER: "auto" })).toMatchObject({ plannerAuto: true });
    for (const name of ["rule", "replay", "local"] as const) expect(settingsFromEnv({ PLANNER_PROVIDER: name })).toMatchObject({ plannerAuto: false, plannerProvider: name });
    expect(() => settingsFromEnv({ PLANNER_PROVIDER: "claude" })).toThrow(/claude/);
    expect(() => settingsFromEnv({ PLANNER_PROVIDER: "gpt" })).toThrow();
  });

  it("reads the local server's address, model and remote permission from the environment", () => {
    expect(settingsFromEnv({ PLANNER_BASE_URL: "http://127.0.0.1:9000", PLANNER_MODEL: "qwen3.5-4b-q4km", PLANNER_ALLOW_REMOTE: "1" })).toMatchObject({
      plannerUrl: "http://127.0.0.1:9000",
      plannerModel: "qwen3.5-4b-q4km",
      plannerAllowRemote: true,
    });
  });
});

describe("selectPlanner", () => {
  it("auto: local when the Qwen server answers, whatever Laya does", async () => {
    for (const up of [[QWEN], [QWEN, LAYA]]) {
      const { probe } = probes(up);
      expect(await selectPlanner(settingsFromEnv({}), probe)).toMatchObject({ provider: "local", chosenBy: "auto", detail: expect.stringContaining("local model answered") as unknown });
    }
  });

  it("auto: rule when only Laya answers, replay when neither does; each choice says why", async () => {
    expect(await selectPlanner(settingsFromEnv({}), probes([LAYA]).probe)).toMatchObject({ provider: "rule", chosenBy: "auto", detail: expect.stringContaining("Laya did") as unknown });
    expect(await selectPlanner(settingsFromEnv({ PLANNER_PROVIDER: "auto" }), probes([]).probe)).toMatchObject({ provider: "replay", chosenBy: "auto", detail: expect.stringContaining("neither") as unknown });
  });

  it("auto probes each server's own address with the 1.5 s limit; the remote permission applies to the model only", async () => {
    const { probe, asked } = probes([]);
    await selectPlanner(settingsFromEnv({ PLANNER_BASE_URL: "http://10.0.0.5:8809", PLANNER_ALLOW_REMOTE: "1" }), probe);
    expect(PROBE_TIMEOUT_MS).toBe(1_500);
    expect(asked).toEqual([
      { url: "http://10.0.0.5:8809", allowRemote: true, timeoutMs: 1_500 },
      { url: LAYA, allowRemote: false, timeoutMs: 1_500 },
    ]);
  });

  it("an explicit PLANNER_PROVIDER wins and nothing is probed, even when the server it names is down", async () => {
    for (const name of ["rule", "replay", "local"] as const) {
      const { probe, asked } = probes([]);
      expect(await selectPlanner(settingsFromEnv({ PLANNER_PROVIDER: name }), probe)).toEqual({ provider: name, chosenBy: "env", detail: `Chosen by the operator (PLANNER_PROVIDER=${name}).` });
      expect(asked).toEqual([]);
    }
  });

  it("without the start-up check the booth is composed with what the settings name: the rule planner, said to be the default", () => {
    expect(settledChoice(settingsFromEnv({}))).toMatchObject({ provider: "rule", chosenBy: "default" });
    const booth = composeBooth({ env: { JUDGE_PROVIDER: "replay" }, store: new MemoryLogStore(), keys: ephemeralKeys, tickMs: null, warmUp: false });
    expect(booth.planner).toMatchObject({ provider: "rule", chosenBy: "default" });
    void booth.close();
  });

  it("the choice is fixed: a planner that goes down later is not swapped for another one", async () => {
    const choice = await selectPlanner(settingsFromEnv({}), probes([QWEN]).probe);
    const booth = composeBooth({ env: { JUDGE_PROVIDER: "replay" }, store: new MemoryLogStore(), keys: ephemeralKeys, tickMs: null, warmUp: false, planner: choice });
    const info = await booth.backend.info();
    expect(info.planner).toMatchObject({ provider: "local" });
    expect(info.planner.note).toContain("Chosen at start (PLANNER_PROVIDER=auto)");
    expect(info.features).toEqual({ ask: true, alternatives: true, compile: "model" });
    expect((await booth.backend.info()).planner.provider).toBe("local");
    await booth.close();
  });
});

describe("probeHealth", () => {
  let server: Server | null = null;
  afterEach(async () => {
    vi.restoreAllMocks();
    await new Promise<void>((resolve) => (server === null ? resolve() : server.close(() => resolve())));
    server = null;
  });

  async function serve(handler: Parameters<typeof createServer>[1]): Promise<string> {
    const s = createServer(handler);
    server = s;
    await new Promise<void>((resolve) => s.listen(0, "127.0.0.1", resolve));
    return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
  }

  it("is true for a 200 on /health and false for an error status, a redirect, a closed port and a hang", async () => {
    const ok = await serve((req, res) => res.writeHead(req.url === "/health" ? 200 : 404).end("{}"));
    expect(await probeHealth(ok, false, 1_500)).toBe(true);
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    expect(await probeHealth(ok, false, 500)).toBe(false); // closed now
    const down = await serve((_req, res) => res.writeHead(503).end());
    expect(await probeHealth(down, false, 1_500)).toBe(false);
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    const redirect = await serve((_req, res) => res.writeHead(307, { location: "http://127.0.0.1:1/health" }).end());
    expect(await probeHealth(redirect, false, 1_500)).toBe(false);
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    const hang = await serve(() => undefined);
    expect(await probeHealth(hang, false, 100)).toBe(false);
    server?.closeAllConnections();
  });

  it("refuses a remote host unless allowed, user info, other schemes and nonsense, without opening a connection", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    expect(await probeHealth("http://example.com:8809", false, 500)).toBe(false);
    expect(await probeHealth("http://user:pw@127.0.0.1:8809", false, 500)).toBe(false);
    expect(await probeHealth("file:///etc/passwd", false, 500)).toBe(false);
    expect(await probeHealth("not a url", false, 500)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});
