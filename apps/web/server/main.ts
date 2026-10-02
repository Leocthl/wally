// Starts the booth server on 127.0.0.1 only (PORT, default 8787): the API, the SSE trace, the built UI at / and the
// offline verifier page at /verifier/. Run: pnpm --filter @laisee/web api (or pnpm demo from the repo root).
// This file is the startup logger: the only place the server writes to the console.
import { resolve } from "node:path";
import { serve } from "@hono/node-server";
import { BRAND } from "../src/brand";
import { composeBooth } from "./compose";
import { selectPlanner } from "./booth/plannerSelect";
import { REPO_ROOT, settingsFromEnv } from "./booth/settings";
import type { Logger } from "./http/routes";
import { registerStaticRoutes } from "./static";

const logger: Logger = {
  info: (message) => process.stdout.write(`${message}\n`),
  error: (message) => process.stderr.write(`${message}\n`),
};

const roots = { ui: resolve(REPO_ROOT, "apps/web/dist"), verifier: resolve(REPO_ROOT, "apps/verifier/dist") };

async function main(): Promise<void> {
  const planner = await selectPlanner(settingsFromEnv(process.env)); // once, here: nothing switches planner during a run
  logger.info(`planner ${planner.provider} (${planner.chosenBy}): ${planner.detail}`);
  const booth = composeBooth({ env: process.env, logger, planner, extraRoutes: (app) => registerStaticRoutes(app, roots) });
  await booth.start();
  const info = await booth.backend.info();
  const server = serve({ fetch: booth.app.fetch, hostname: "127.0.0.1", port: booth.settings.port }, (addr) => {
    logger.info(`${BRAND.name} booth on http://127.0.0.1:${addr.port}/#/booth (rail SIMULATED; verifier at /verifier/)`);
    logger.info(`judge ${info.judge.provider}, planner ${info.planner.provider}${info.replayed ? " (REPLAYED: recorded outputs)" : ""}, sentence reader ${info.features.compile}`);
  });
  const stop = (): void => {
    void booth.close().finally(() => server.close(() => process.exit(0)));
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

main().catch((err: unknown) => {
  logger.error(`${BRAND.name} booth failed to start: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
