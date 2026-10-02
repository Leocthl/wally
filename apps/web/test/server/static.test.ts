// @vitest-environment node
// Static serving: the built UI at / (any unknown path gets the app shell, hash routes never reach the server), the
// verifier page at /verifier/ when built and a JSON 404 when not, and no path ever leaves its root.
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createHttpApp, NOT_COMPOSED_BACKEND } from "../../server/app";
import { SseHub } from "../../server/http/sse";
import { registerStaticRoutes, resolveInside } from "../../server/static";

const BASE = "http://127.0.0.1:8787";

function site(withVerifier: boolean) {
  const root = mkdtempSync(join(tmpdir(), "booth-static-"));
  const ui = join(root, "ui");
  const verifier = join(root, "verifier");
  mkdirSync(join(ui, "assets"), { recursive: true });
  writeFileSync(join(ui, "index.html"), "<!doctype html><title>booth</title>");
  writeFileSync(join(ui, "assets", "app.js"), "console.info('x')");
  writeFileSync(join(root, "secret.txt"), "not served");
  if (withVerifier) {
    mkdirSync(verifier);
    writeFileSync(join(verifier, "index.html"), "<!doctype html><title>verifier</title>");
  }
  const hub = new SseHub({ keepAliveMs: 60_000, maxQueuedChunks: 4 });
  return createHttpApp({ backend: () => NOT_COMPOSED_BACKEND, hub, extraRoutes: (app) => registerStaticRoutes(app, { ui, verifier }) });
}

describe("static files", () => {
  it("serves the UI shell, its assets with a type, and the shell for unknown paths", async () => {
    const app = site(true);
    const index = await app.request(`${BASE}/`);
    expect(index.headers.get("content-type")).toContain("text/html");
    expect(await index.text()).toContain("booth");
    const js = await app.request(`${BASE}/assets/app.js`);
    expect(js.headers.get("content-type")).toContain("text/javascript");
    expect(await (await app.request(`${BASE}/booth`)).text()).toContain("booth");
  });

  it("serves the verifier page when built, a JSON 404 when not", async () => {
    expect(await (await site(true).request(`${BASE}/verifier/`)).text()).toContain("verifier");
    const missing = await site(false).request(`${BASE}/verifier/`);
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { error: { code: string } }).error.code).toBe("NOT_FOUND");
  });

  it("never leaves its root", async () => {
    expect(resolveInside("/srv/ui", "/../secret.txt")).toBe("/srv/ui/secret.txt");
    expect(resolveInside("/srv/ui", "/%2e%2e/%2e%2e/etc/passwd")).toBe("/srv/ui/etc/passwd");
    expect(resolveInside("/srv/ui", "/a%00b")).toBeNull();
    const res = await site(true).request(`${BASE}/%2e%2e/secret.txt`);
    expect(await res.text()).not.toContain("not served");
  });

  it("keeps API 404s as JSON even with static routes", async () => {
    const res = await site(true).request(`${BASE}/api/nope`);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});
