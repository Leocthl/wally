// @vitest-environment node
// The stand-ins the routes talk to (server/sessionScope.ts): they stand for the wallet of the request that is running, and
// for nothing else. Outside a request they fail instead of quietly using the booth's wallet. Fake wallets, a real Hono app.
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import type { BoothBackend } from "../../server/backend";
import { BoothError } from "../../server/http/errors";
import { SseHub } from "../../server/http/sse";
import { createSessionLayer } from "../../server/sessionScope";
import { SessionRegistry, type SessionScope, type VisitorSession } from "../../server/sessions";

const hubs: SseHub[] = [];
const tick = (ms = 1): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** A wallet that keeps its name in a #private field, as the real backend keeps its state: a lost `this` would show. */
class FakeBackend {
  readonly #name: string;
  constructor(name: string) {
    this.#name = name;
  }
  async snapshot(): Promise<string> {
    await tick();
    return this.#name;
  }
  async info(): Promise<Record<string, unknown>> {
    return { kind: "http", keys: "KEY_DIR", name: this.#name };
  }
}

function scopeOf(name: string): SessionScope {
  const hub = new SseHub({ keepAliveMs: 60_000, maxQueuedChunks: 4 });
  hubs.push(hub);
  return { backend: new FakeBackend(name) as unknown as BoothBackend, hub };
}

function build() {
  let made = 0;
  const registry = new SessionRegistry({
    booth: scopeOf("booth"),
    create: async (): Promise<VisitorSession> => {
      made += 1;
      return { ...scopeOf(`visitor ${made}`), tick: async () => undefined, close: () => undefined };
    },
    tickMs: null,
  });
  const layer = createSessionLayer({ registry, isBooth: (c) => c.req.header("x-booth") === "1" });
  const app = new Hono();
  app.use("/api/*", layer.around);
  app.get("/api/who", async (c) => c.json({ name: await layer.backend.snapshot(), info: await layer.backend.info() }));
  app.get("/api/inside", (c) =>
    c.json({
      has: "snapshot" in layer.backend && "connect" in layer.hub,
      notThere: "nope" in layer.backend || "connect" in layer.backend || "snapshot" in layer.hub, // each stand-in answers for its own object only
      write: (() => {
        try {
          (layer.backend as unknown as Record<string, unknown>)["x"] = 1;
          return "allowed";
        } catch (err) {
          return err instanceof TypeError ? "refused" : "other";
        }
      })(),
      keys: (() => {
        try {
          return Object.keys(layer.backend);
        } catch {
          return "refused";
        }
      })(),
    }),
  );
  app.get("/api/health", (c) => c.json({ ok: true }));
  return { app, layer, registry };
}

afterEach(() => {
  for (const hub of hubs.splice(0)) hub.close();
});

describe("outside a request", () => {
  it("fails instead of using any wallet: reading the backend or the hub, asking `in`, listing or writing", () => {
    const { layer } = build();
    const lost = (run: () => unknown): void => {
      const err = (() => {
        try {
          run();
          return null;
        } catch (e) {
          return e;
        }
      })();
      expect(err).toBeInstanceOf(BoothError);
      expect(err).toMatchObject({ code: "NO_WALLET_SCOPE", status: 500 });
    };
    lost(() => layer.backend.snapshot);
    lost(() => layer.backend.info);
    lost(() => layer.hub.seq);
    lost(() => layer.hub.connect);
    lost(() => "snapshot" in layer.backend);
    lost(() => "seq" in layer.hub);
  });

  it("refuses to be listed or written to, with or without a request", () => {
    const { layer } = build();
    expect(() => Object.keys(layer.backend)).toThrow();
    expect(() => {
      (layer.backend as unknown as Record<string, unknown>)["x"] = 1;
    }).toThrow(TypeError);
    expect(() => delete (layer.backend as unknown as Record<string, unknown>)["snapshot"]).toThrow(TypeError);
  });
});

describe("inside a request", () => {
  it("is the wallet of the request that is running, across awaits, for requests that overlap", async () => {
    const { app } = build();
    const call = async (headers: Record<string, string>): Promise<{ name: string; cookie: string | null }> => {
      const res = await app.request("http://127.0.0.1:8817/api/who", { headers });
      return { name: ((await res.json()) as { name: string }).name, cookie: res.headers.getSetCookie()[0]?.split(";")[0] ?? null };
    };
    const first = await Promise.all([call({}), call({}), call({ "x-booth": "1" })]);
    expect(first.map((r) => r.name).sort()).toEqual(["booth", "visitor 1", "visitor 2"]);
    const [a, b] = first.filter((r) => r.cookie !== null);
    // each visitor's cookie brings it back to its own wallet, with many in flight at once
    const again = await Promise.all(Array.from({ length: 8 }, (_, i) => call({ cookie: (i % 2 === 0 ? a : b)?.cookie ?? "" })));
    expect(again.map((r) => r.name)).toEqual(Array.from({ length: 8 }, (_, i) => (i % 2 === 0 ? a : b)?.name));
  });

  it("answers `in`, refuses writes and listing, and keeps its methods bound to the wallet", async () => {
    const { app } = build();
    const res = await app.request("http://127.0.0.1:8817/api/inside");
    expect(await res.json()).toEqual({ has: true, notThere: false, write: "refused", keys: "refused" });
  });

  it("says in /api/info whose wallet it is: the booth's is shared, a visitor's is private and has its own keys note", async () => {
    const { app } = build();
    const mac = (await (await app.request("http://127.0.0.1:8817/api/who", { headers: { "x-booth": "1" } })).json()) as { info: Record<string, unknown> };
    expect(mac.info).toMatchObject({ sessions: "shared", keys: "KEY_DIR" });
    const phone = (await (await app.request("http://127.0.0.1:8817/api/who")).json()) as { info: Record<string, unknown> };
    expect(phone.info["sessions"]).toBe("private");
    expect(String(phone.info["keys"])).not.toContain("KEY_DIR");
  });

  it("leaves /api/health outside every wallet, so a handler there that asked for one would fail", async () => {
    const { app, registry } = build();
    expect((await app.request("http://127.0.0.1:8817/api/health")).status).toBe(200);
    expect(registry.size).toBe(0);
  });
});
