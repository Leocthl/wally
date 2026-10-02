// Static files for the booth: the built UI (apps/web/dist) at / with its hash routes, and the offline verifier
// page (apps/verifier/dist, built by another lane) at /verifier/ when it exists, 404 otherwise. Paths are
// resolved inside their root only (no traversal), and only GET and HEAD are served.
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import type { Context, Hono } from "hono";
import { errorBody } from "./http/errors";

export interface StaticRoots {
  /** Directory of the built UI (index.html at its root). */
  readonly ui: string;
  /** Directory of the built verifier page; served at /verifier/. */
  readonly verifier: string;
}

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

/** The file under root that a URL path names, or null when it would leave root. */
export function resolveInside(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const base = resolve(root);
  const target = resolve(base, `.${sep}${normalize(decoded).replace(/^([/\\])+/, "")}`);
  return target === base || target.startsWith(`${base}${sep}`) ? target : null;
}

async function fileResponse(c: Context, path: string | null): Promise<Response | null> {
  if (path === null) return null;
  try {
    const info = await stat(path);
    const file = info.isDirectory() ? join(path, "index.html") : path;
    const bytes = await readFile(file);
    const type = TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
    return c.body(bytes, 200, { "content-type": type, "cache-control": "no-cache", "x-content-type-options": "nosniff" });
  } catch {
    return null;
  }
}

const missing = (c: Context, what: string): Response => c.json(errorBody("NOT_FOUND", `${what} is not built`), 404);

export function registerStaticRoutes(app: Hono, roots: StaticRoots): void {
  app.get("/verifier", (c) => c.redirect("/verifier/", 301));
  app.get("/verifier/*", async (c) => {
    const rest = c.req.path.slice("/verifier".length) || "/";
    return (await fileResponse(c, resolveInside(roots.verifier, rest))) ?? missing(c, "the verifier page");
  });
  app.get("*", async (c) => {
    if (c.req.path.startsWith("/api/")) return c.json(errorBody("NOT_FOUND", "no such API route"), 404);
    const exact = await fileResponse(c, resolveInside(roots.ui, c.req.path));
    if (exact !== null) return exact;
    // Hash routes never reach the server; any other unknown path gets the app shell.
    return (await fileResponse(c, join(resolve(roots.ui), "index.html"))) ?? missing(c, "the booth UI (run pnpm --filter @laisee/web build)");
  });
}
