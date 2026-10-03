#!/usr/bin/env node
// Crowd check for private practice wallets with real pages: the phone-sized Chromium contexts of Playwright open the QR link on
// the booth Wi-Fi address and tap through the real app (cookie, event stream, start-up probe, X-Event-Seq waits) for a while.
// Needs `pnpm demo:lan` running with a built UI (pnpm --filter @wally/web build) and the cached Chromium of Playwright.
// Checks: each phone has its own HttpOnly SameSite=Strict cookie; four taps together on Buy a cotton tee give each phone three
// cards and a stopped fourth; the budget meter on each page equals its own wallet at the end; every wallet's log verifies; the
// Mac's own wallet did not move; no page error. Rail SIMULATED. Exit 1 on any failure.
// Usage: node scripts/sessions-crowd-ui.mjs [--port 8787] [--phones 5] [--seconds 120]
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const { chromium, devices } = createRequire(join(ROOT, "apps/web/package.json"))("@playwright/test");

const args = new Map(process.argv.slice(2).flatMap((a, i, all) => (a.startsWith("--") ? [[a.slice(2), all[i + 1] ?? "true"]] : [])));
const PORT = Number(args.get("port") ?? process.env.PORT ?? 8787);
const PHONES = Number(args.get("phones") ?? 5);
const SECONDS = Number(args.get("seconds") ?? 120);
const HOME = `http://127.0.0.1:${PORT}`;
const failures = [];
const fail = (m) => (failures.push(m), console.error("FAIL", m));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const money = (minor) => `HK$${(minor / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

const lan = await fetch(`${HOME}/api/lan`, { signal: AbortSignal.timeout(5_000) }).then((r) => (r.ok ? r.json() : null), () => null);
if (lan === null || typeof lan.urls?.[0] !== "string") {
  console.error(`no booth in LAN mode with a network address at ${HOME}: start pnpm demo:lan on a Mac that is on Wi-Fi`);
  process.exit(1);
}
const BASE = new URL(lan.urls[0]).origin;
const TOKEN = lan.token;
console.log(`ui crowd: ${PHONES} phone pages at ${BASE} for ${SECONDS} s`);
const boothBefore = await (await fetch(`${HOME}/api/snapshot`)).json();
const browser = await chromium.launch({ headless: true });
const storageState = { cookies: [], origins: [{ origin: BASE, localStorage: [{ name: "wally:onboarded", value: "1" }] }] };

async function open(i) {
  const context = await browser.newContext({ ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, storageState, serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
  await page.goto(`${BASE}/?t=${TOKEN}&booth=1#/budget`);
  await page.getByRole("meter").waitFor({ timeout: 20_000 });
  return { i, context, page, errors, taps: 0 };
}

// Playwright's request client is Node's: it can meet the keep-alive race (the server closed an idle socket as the client reused it). One retry, as a browser does.
async function api(w, method, path, data) {
  const opts = { headers: { "x-wally-token": TOKEN, ...(data === undefined ? {} : { "content-type": "application/json" }) }, ...(data === undefined ? {} : { data }) };
  for (let attempt = 0; ; attempt += 1) {
    try {
      const res = method === "POST" ? await w.context.request.post(`${BASE}${path}`, opts) : await w.context.request.get(`${BASE}${path}`, opts);
      return await res.json();
    } catch (err) {
      if (attempt >= 1 || !/ECONNRESET|socket hang up/.test(String(err))) throw err;
    }
  }
}

async function tap(w, scenario) {
  if ((await w.page.locator("main [data-scenario]:visible").count()) === 0) await w.page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Budget", exact: true }).click();
  await w.page.locator(`main [data-scenario="${scenario}"]`).click({ timeout: 15_000 });
  await w.page.waitForURL(/#\/wally/, { timeout: 30_000 });
  await w.page.locator("[data-route-loading]").waitFor({ state: "detached", timeout: 15_000 });
  w.taps += 1;
}

const wallets = [];
for (let i = 0; i < PHONES; i += 1) wallets.push(await open(i));
const cookies = await Promise.all(wallets.map(async (w) => (await w.context.cookies()).find((c) => c.name === "wally_s")));
cookies.forEach((c, i) => {
  if (!c) fail(`phone ${i + 1}: no wally_s cookie`);
  else if (!c.httpOnly || c.sameSite !== "Strict") fail(`phone ${i + 1}: cookie flags are httpOnly=${c.httpOnly} sameSite=${c.sameSite}`);
});
if (new Set(cookies.map((c) => c?.value)).size !== PHONES) fail("the phones do not have different wallet ids");

for (let round = 1; round <= 4; round += 1) await Promise.all(wallets.map((w) => tap(w, "normal")));
for (const w of wallets) {
  const snap = await api(w, "GET", "/api/snapshot");
  if (snap.cards.length !== 3) fail(`phone ${w.i + 1}: ${snap.cards.length} cards after four taps together (wanted 3, the fourth stopped)`);
  if (snap.packet.remaining_minor !== 80_000 - 3 * 25_900) fail(`phone ${w.i + 1}: remaining ${snap.packet.remaining_minor} after four taps together`);
}
console.log("phase 1: four taps together on real pages: each phone bought 3, the 4th was stopped");

const until = Date.now() + SECONDS * 1000;
const choices = ["normal", "small", "flagged", "overflow", "injected", "unverified", "drift", "off_category"];
await Promise.all(
  wallets.map(async (w) => {
    let n = w.i * 7;
    while (Date.now() < until) {
      try {
        await tap(w, choices[n % choices.length]);
        n += 3;
        if (n % 5 === 0) {
          const snap = await api(w, "GET", "/api/snapshot");
          if (snap.packet.remaining_minor < 0 || snap.packet.remaining_minor > snap.packet.budget_minor) fail(`phone ${w.i + 1}: remaining ${snap.packet.remaining_minor}`);
        }
      } catch (err) {
        w.errors.push(`action: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
        await w.page.goto(`${BASE}/?booth=1#/budget`).catch(() => undefined);
      }
      await sleep(300 + Math.random() * 900);
    }
  }),
);

let metersMatch = 0;
for (const w of wallets) {
  await w.page.goto(`${BASE}/?booth=1#/budget`);
  await w.page.getByRole("meter").waitFor({ timeout: 20_000 });
  await sleep(600);
  const snap = await api(w, "GET", "/api/snapshot");
  const shown = (await w.page.getByRole("meter").getAttribute("aria-valuetext")) ?? "";
  if (shown.startsWith(`${money(snap.packet.remaining_minor)} left of ${money(snap.packet.budget_minor)}`)) metersMatch += 1;
  else fail(`phone ${w.i + 1}: the meter says "${shown}" but its wallet has ${money(snap.packet.remaining_minor)} left`);
  if ((await api(w, "POST", "/api/verify", {})).result?.ok !== true) fail(`phone ${w.i + 1}: its log does not verify`);
  if (w.errors.length > 0) fail(`phone ${w.i + 1}: ${w.errors.slice(0, 3).join(" ; ")}`);
}
console.log(`meters match their own wallets: ${metersMatch}/${PHONES}; taps per phone: ${wallets.map((w) => w.taps).join(", ")}`);

const boothAfter = await (await fetch(`${HOME}/api/snapshot`)).json();
if (JSON.stringify(boothBefore.log.head) !== JSON.stringify(boothAfter.log.head) || boothBefore.cards.length !== boothAfter.cards.length) fail("the Mac's own wallet changed");
await Promise.all(wallets.map((w) => w.context.close()));
await browser.close();
console.log(failures.length === 0 ? "PASS (ui crowd)" : `FAIL: ${failures.length} problem(s)`);
process.exit(failures.length === 0 ? 0 : 1);
