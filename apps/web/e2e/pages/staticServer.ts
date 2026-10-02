// A tiny static server that behaves like GitHub Pages for a project site: the build is mounted under /<repo>/, a
// directory answers with its index.html, the bare mount and bare directories redirect to the trailing slash, and
// everything else (the origin root, /api, a root-absolute /verifier/) is a 404. Loopback only. `down` simulates the
// network going away: connections are dropped, so only the service worker's cache can answer.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

export interface PagesServerOptions {
  /** Folder to serve (the pages build). */
  readonly root: string;
  /** Mount path with both slashes, for example "/wally/". */
  readonly mount: string;
  /** Loopback port. Fixed, never "any free": a stranger on the port must fail loudly. */
  readonly port: number;
}

export interface PagesServer {
  readonly origin: string;
  /** Every path asked for, in order, including the ones that were refused. */
  readonly seen: readonly string[];
  /** While true every connection is dropped, as if the network were off. */
  setDown(down: boolean): void;
  close(): Promise<void>;
}

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function contentType(path: string): string {
  return TYPES[extname(path)] ?? "application/octet-stream";
}

/**
 * `rest` (a path under the mount, starting with "/") as an absolute path inside `root`, when it exists spelled exactly so.
 * GitHub Pages runs on Linux, where Icons/ and icons/ differ; this Mac would serve both, so the on-disk spelling is compared.
 */
async function locate(root: string, rest: string): Promise<{ readonly path: string; readonly directory: boolean } | null> {
  const wanted = resolve(root, `.${rest}`);
  if (wanted !== root && !wanted.startsWith(root + sep)) return null;
  try {
    if ((await realpath(wanted)) !== wanted) return null;
    return { path: wanted, directory: (await stat(wanted)).isDirectory() };
  } catch {
    return null;
  }
}

function send(res: ServerResponse, status: number, headers: Record<string, string>, body: Uint8Array | string = ""): void {
  res.writeHead(status, headers);
  res.end(body);
}

export async function startPagesServer(options: PagesServerOptions): Promise<PagesServer> {
  const root = await realpath(resolve(options.root));
  const bare = options.mount.slice(0, -1);
  const seen: string[] = [];
  const sockets = new Set<Socket>();
  let down = false;

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://pages.invalid");
    seen.push(url.pathname);
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { allow: "GET, HEAD" });
    if (url.pathname === bare) return send(res, 301, { location: `${options.mount}${url.search}` });
    if (!url.pathname.startsWith(options.mount)) return send(res, 404, { "content-type": "text/plain" }, "404 not found (outside the mount)");
    const rest = decodeURIComponent(url.pathname.slice(options.mount.length - 1));
    const found = await locate(root, rest.endsWith("/") ? `${rest}index.html` : rest);
    if (found?.directory === true) return send(res, 301, { location: `${url.pathname}/${url.search}` });
    if (found === null) return send(res, 404, { "content-type": "text/plain" }, "404 not found");
    const file = found.path;
    // GitHub Pages sends max-age=600. Here nothing may be cached by the browser: with the server down, only the service
    // worker's own cache can answer, so a missing precache entry fails the offline step instead of hiding in the HTTP cache.
    return send(res, 200, { "content-type": contentType(file), "cache-control": "no-store" }, req.method === "HEAD" ? "" : await readFile(file));
  }

  const server = createServer((req, res) => {
    if (down) {
      req.socket.destroy();
      return;
    }
    handle(req, res).catch(() => send(res, 500, { "content-type": "text/plain" }, "500"));
  });
  server.on("connection", (socket) => {
    if (down) {
      socket.destroy();
      return;
    }
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  await new Promise<void>((done, fail) => {
    server.once("error", fail);
    server.listen(options.port, "127.0.0.1", () => done());
  });
  const { port } = server.address() as AddressInfo;

  return {
    origin: `http://127.0.0.1:${port}`,
    seen,
    setDown(value) {
      down = value;
      if (value) for (const s of sockets) s.destroy();
    },
    close: () =>
      new Promise<void>((done) => {
        for (const s of sockets) s.destroy();
        server.close(() => done());
      }),
  };
}
