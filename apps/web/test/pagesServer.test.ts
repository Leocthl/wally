// @vitest-environment node
// The static server behind e2e:pages (e2e/pages/staticServer.ts) has to behave like a GitHub Pages project site, or the
// e2e proves nothing: a mount path, directory indexes and slash redirects, a 404 for the origin root and /api, file
// names that are case sensitive (Pages runs on Linux, this Mac does not), no way out of the folder, and a "network gone" switch.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request as rawRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startPagesServer, type PagesServer } from "../e2e/pages/staticServer";

let parent = "";
let server: PagesServer;

beforeAll(async () => {
  parent = mkdtempSync(join(tmpdir(), "wally-pages-server-"));
  const site = join(parent, "site");
  mkdirSync(join(site, "icons"), { recursive: true });
  mkdirSync(join(site, "verifier"));
  writeFileSync(join(site, "index.html"), "<title>app</title>");
  writeFileSync(join(site, "verifier", "index.html"), "<title>verifier</title>");
  writeFileSync(join(site, "icons", "icon-192.png"), "png");
  writeFileSync(join(site, "manifest.webmanifest"), "{}");
  writeFileSync(join(parent, "secret.txt"), "outside the site");
  server = await startPagesServer({ root: site, mount: "/wally/", port: 0 });
});

afterAll(async () => {
  await server?.close();
  if (parent) rmSync(parent, { recursive: true, force: true });
});

const get = (path: string, init?: RequestInit) => fetch(`${server.origin}${path}`, { redirect: "manual", ...init });

/** Sends the path exactly as given: fetch would fold ".." away before it left the client. */
function raw(path: string): Promise<{ status: number; body: string }> {
  const url = new URL(server.origin);
  return new Promise((done, fail) => {
    const req = rawRequest({ host: url.hostname, port: url.port, path, method: "GET" }, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => (body += chunk.toString()));
      res.on("end", () => done({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", fail);
    req.end();
  });
}

describe("startPagesServer", () => {
  it("serves the folder under the mount: files, directory indexes, content types, nothing cacheable", async () => {
    const app = await get("/wally/");
    expect([app.status, await app.text()]).toEqual([200, "<title>app</title>"]);
    expect(app.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(app.headers.get("cache-control")).toBe("no-store");
    expect(await (await get("/wally/index.html")).text()).toBe("<title>app</title>");
    expect(await (await get("/wally/verifier/")).text()).toBe("<title>verifier</title>");
    expect((await get("/wally/icons/icon-192.png")).headers.get("content-type")).toBe("image/png");
    expect((await get("/wally/manifest.webmanifest")).headers.get("content-type")).toBe("application/manifest+json");
  });

  it("redirects the bare mount and a bare directory to the slash form, keeping the query", async () => {
    for (const [from, to] of [["/wally", "/wally/"], ["/wally?api=local", "/wally/?api=local"], ["/wally/verifier", "/wally/verifier/"]] as const) {
      const res = await get(from);
      expect([res.status, res.headers.get("location")], from).toEqual([301, to]);
    }
  });

  it("answers 404 for everything outside the mount: the origin root, /api, a root-absolute /verifier/, a favicon", async () => {
    for (const path of ["/", "/api/info", "/verifier/", "/favicon.ico", "/wallyx/", "/wally-other/index.html"]) expect((await get(path)).status, path).toBe(404);
  });

  it("answers 404 for a missing file and for a name in the wrong case, as Linux hosting does", async () => {
    for (const path of ["/wally/nope.js", "/wally/ICONS/icon-192.png", "/wally/icons/Icon-192.png", "/wally/INDEX.html", "/wally/Verifier/"]) expect((await get(path)).status, path).toBe(404);
  });

  it("cannot be walked out of its folder", async () => {
    for (const path of ["/wally/../secret.txt", "/wally/%2e%2e/secret.txt", "/wally/icons/../../secret.txt", "/wally//..//secret.txt"]) {
      const res = await raw(path);
      expect(res.body, path).not.toContain("outside the site");
      expect([404, 301]).toContain(res.status);
    }
  });

  it("allows only GET and HEAD", async () => {
    expect((await get("/wally/", { method: "POST", body: "x" })).status).toBe(405);
    const head = await get("/wally/", { method: "HEAD" });
    expect([head.status, await head.text()]).toEqual([200, ""]);
  });

  it("records every path it was asked for, refused ones included", async () => {
    const before = server.seen.length;
    await get("/wally/index.html");
    await get("/api/info");
    expect(server.seen.slice(before)).toEqual(["/wally/index.html", "/api/info"]);
  });

  it("drops every connection while down, and answers again when it is back", async () => {
    server.setDown(true);
    await expect(get("/wally/")).rejects.toThrow();
    server.setDown(false);
    expect((await get("/wally/")).status).toBe(200);
  });
});
