// Starts the booth API on 127.0.0.1 only. PORT from env (default 8787). Run: pnpm --filter @laisee/web api
// Startup logger: the only console output of the server.
import { serve } from "@hono/node-server";
import { createHttpApp, NOT_COMPOSED_BACKEND } from "./app";
import { SseHub } from "./http/sse";

const DEFAULT_PORT = 8787;
const port = Number.parseInt(process.env["PORT"] ?? `${DEFAULT_PORT}`, 10);
if (!Number.isInteger(port) || port <= 0 || port > 65_535) throw new Error(`invalid PORT: ${process.env["PORT"] ?? ""}`);

const hub = new SseHub({ keepAliveMs: 15_000, maxQueuedChunks: 1024 });
serve({ fetch: createHttpApp({ backend: () => NOT_COMPOSED_BACKEND, hub }).fetch, hostname: "127.0.0.1", port }, (info) => {
  process.stdout.write(`laisee api on http://127.0.0.1:${info.port} (backend not composed yet)\n`);
});
