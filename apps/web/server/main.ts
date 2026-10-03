// Starts the booth server on 127.0.0.1 only (PORT, default 8787): the API, the SSE trace, the built UI at / and the
// offline verifier page at /verifier/. Run: pnpm --filter @wally/web api (or pnpm demo from the repo root).
// LAN mode (opt-in, pnpm demo:lan, `--lan` or HOST): binds the network and asks every API call for a pairing token, so
// phones on the same Wi-Fi can open the live app (server/lanMode.ts, server/http/lan.ts).
// This file is the startup logger: the only place the server writes to the console.
import { resolve } from "node:path";
import { serve } from "@hono/node-server";
import { BRAND } from "../src/brand";
import { composeBooth } from "./compose";
import { selectPlanner } from "./booth/plannerSelect";
import { REPO_ROOT, settingsFromEnv } from "./booth/settings";
import type { LanOptions } from "./http/lan";
import type { Logger } from "./http/routes";
import { createLanOptions, launchFromEnv, publicUrlFromEnv } from "./lanMode";
import { MAX_VISITOR_SESSIONS, SESSION_IDLE_TTL_MS } from "./sessions";
import { registerStaticRoutes } from "./static";

const logger: Logger = {
  info: (message) => process.stdout.write(`${message}\n`),
  error: (message) => process.stderr.write(`${message}\n`),
};

const roots = { ui: resolve(REPO_ROOT, "apps/web/dist"), verifier: resolve(REPO_ROOT, "apps/verifier/dist") };

function logLan(lan: LanOptions, host: string, port: number): void {
  logger.info(`LAN mode ON, bound to ${host}:${port}. Every API call needs the pairing token (new on every start).`);
  const urls = lan.urls();
  if (urls.length === 0) logger.info("LAN mode: this Mac has no network address yet. Join a Wi-Fi network or start a hotspot, then reload the booth page.");
  else logger.info(`Phones on the same Wi-Fi open one of these (or scan the QR in About or Presenter):\n${urls.map((u) => `  ${u}`).join("\n")}`);
}

function logWallets(on: boolean, lan: boolean): void {
  if (on && lan) logger.info(`Every phone gets its own practice wallet (up to ${MAX_VISITOR_SESSIONS}, dropped after ${SESSION_IDLE_TTL_MS / 60_000} idle minutes). The Mac keeps the shared booth wallet.`);
  else if (lan) logger.info("Practice wallets are OFF (WALLY_SESSIONS): every phone shares the booth wallet.");
}

async function main(): Promise<void> {
  const settings = settingsFromEnv(process.env);
  const launch = launchFromEnv(process.env, process.argv.slice(2));
  const publicUrl = publicUrlFromEnv(process.env);
  if (publicUrl.note !== null) logger.error(publicUrl.note);
  const lan = launch.lan ? createLanOptions({ port: settings.port, ...(publicUrl.url === undefined ? {} : { publicUrl: publicUrl.url }) }) : undefined;
  const planner = await selectPlanner(settings); // once, here: nothing switches planner during a run
  logger.info(`planner ${planner.provider} (${planner.chosenBy}): ${planner.detail}`);
  const booth = composeBooth({ env: process.env, logger, planner, ...(lan === undefined ? {} : { lan }), extraRoutes: (app) => registerStaticRoutes(app, roots) });
  await booth.start();
  const info = await booth.backend.info();
  const server = serve({ fetch: booth.app.fetch, hostname: launch.host, port: booth.settings.port }, (addr) => {
    logger.info(`${BRAND.name} booth on http://127.0.0.1:${addr.port}/#/booth (rail SIMULATED; verifier at /verifier/)`);
    if (lan !== undefined) logLan(lan, launch.host, addr.port);
    logWallets(booth.sessions !== null, lan !== undefined);
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
