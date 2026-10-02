// Starts the API on 127.0.0.1 only. PORT from env (default 8787). Run: pnpm --filter @laisee/web api
import { serve } from "@hono/node-server";
import { createApp } from "./app";

const DEFAULT_PORT = 8787;
const port = Number.parseInt(process.env["PORT"] ?? `${DEFAULT_PORT}`, 10);
if (!Number.isInteger(port) || port <= 0) throw new Error(`invalid PORT: ${process.env["PORT"] ?? ""}`);

serve({ fetch: createApp().fetch, hostname: "127.0.0.1", port }, (info) => {
  console.log(`laisee api on http://127.0.0.1:${info.port}`);
});
