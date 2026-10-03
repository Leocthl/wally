// The GitHub Pages build in a real browser, served the way a project site is: under /wally/, with nothing at the origin
// root. One persistent context walks the whole story in order (the service worker and its cache must survive from step to
// step): the app boots on-device with no /api call, the worker registers under /wally/, the manifest and icons resolve
// inside it, a Try asking card runs a purchase and shows the one-off card, every screen's chunk loads, the Proof link opens
// /wally/verifier/, and with the server gone the app still boots from the worker's cache. Run by
// `pnpm --filter @wally/web e2e:pages`, which builds dist-pages first. Not part of the default e2e project list
// (playwright.config.ts ignores this folder). Uses 127.0.0.1:8801.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { devices, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { startPagesServer, type PagesServer } from "./staticServer";

const MOUNT = "/wally/";
const PORT = 8801;
const ROOT = resolve(import.meta.dirname, "../../dist-pages");

interface Manifest {
  readonly id?: string;
  readonly start_url: string;
  readonly scope: string;
  readonly icons: readonly { readonly src: string; readonly sizes: string; readonly type: string }[];
  readonly shortcuts: readonly { readonly url: string }[];
}

test.describe.configure({ mode: "serial", timeout: 60_000 });

let server: PagesServer;
let context: BrowserContext;
let page: Page;
let app: string;
/** Every request the browser or its service worker made, in order. */
const requested: URL[] = [];
const badResponses: string[] = [];
const scriptErrors: string[] = [];

const nav = (p: Page) => p.getByRole("navigation", { name: "Main" });
const onDeviceNote = (p: Page) => p.locator('[data-api-mode="local"]');

test.beforeAll(async ({ browser }) => {
  if (!existsSync(join(ROOT, "index.html"))) throw new Error("apps/web/dist-pages is missing: run `pnpm pages:build` (or `pnpm --filter @wally/web e2e:pages`, which builds first)");
  server = await startPagesServer({ root: ROOT, mount: MOUNT, port: PORT });
  app = `${server.origin}${MOUNT}`;
  // The first run is off for this walk (it has its own spec): the flag is in storage when the page opens.
  const onboarded = { cookies: [], origins: [{ origin: server.origin, localStorage: [{ name: "wally:onboarded", value: "1" }] }] };
  context = await browser.newContext({ ...devices["Pixel 7"], storageState: onboarded });
  context.on("request", (r) => requested.push(new URL(r.url())));
  context.on("response", (r) => (r.status() >= 400 ? badResponses.push(`${r.status()} ${r.url()}`) : undefined));
  page = await context.newPage();
  page.on("pageerror", (e) => scriptErrors.push(e.message));
  page.on("console", (m) => (m.type() === "error" ? scriptErrors.push(`console: ${m.text()}`) : undefined));
});

test.afterAll(async () => {
  await context?.close();
  await server?.close();
});

test("boots on-device from /wally/ with no /api request", async () => {
  await page.goto(app);
  await expect(onDeviceNote(page)).toContainText("On-device mode: recorded answers, nothing leaves your phone");
  await expect(page.getByRole("meter")).toHaveAttribute("aria-valuetext", /HK\$800 left of HK\$800, SIMULATED/);
  expect(requested.filter((u) => u.pathname.includes("/api"))).toEqual([]);
  expect(requested.length).toBeGreaterThan(5);
});

test("registers the service worker with its scope under /wally/ and precaches the shell there", async () => {
  const registration = await page.evaluate(async () => {
    const ready = await navigator.serviceWorker.ready;
    const all = await navigator.serviceWorker.getRegistrations();
    return { scope: ready.scope, script: ready.active?.scriptURL ?? null, all: all.map((r) => r.scope) };
  });
  expect(registration).toEqual({ scope: app, script: `${app}sw.js`, all: [app] });
  // The capture sees the worker's own requests: the script itself, and a precached icon that no page asks for.
  const paths = requested.map((u) => u.pathname);
  expect(paths).toContain(`${MOUNT}sw.js`);
  expect(paths).toContain(`${MOUNT}icons/icon-512.png`);
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null)).toBe(`${app}sw.js`);
  const cached = await page.evaluate(async () => {
    const names = (await caches.keys()).filter((n) => n.startsWith("wally-shell-"));
    const cache = await caches.open(names[0] ?? "");
    return { names, urls: (await cache.keys()).map((r) => r.url) };
  });
  expect(cached.names).toHaveLength(1);
  expect(cached.urls.every((u) => u.startsWith(app))).toBe(true);
  for (const file of ["", "index.html", "manifest.webmanifest", "offline.html", "icons/icon-192.png", "icons/icon-512.png"]) expect(cached.urls, file).toContain(`${app}${file}`);
});

test("the manifest, its icons and shortcuts resolve inside /wally/ and the icons load", async () => {
  const href = await page.locator('link[rel="manifest"]').evaluate((l) => (l as HTMLLinkElement).href);
  expect(href).toBe(`${app}manifest.webmanifest`);
  // What Chromium itself made of the manifest: its URL, any errors, and the scope it computed.
  const cdp = await context.newCDPSession(page);
  const seen = await cdp.send("Page.getAppManifest");
  expect(seen.url).toBe(href);
  expect(seen.errors).toEqual([]);
  expect(seen.parsed?.scope).toBe(app);
  const manifest = JSON.parse(seen.data ?? "{}") as Manifest;
  const start = new URL(manifest.start_url, href);
  expect([start.href, new URL(manifest.scope, href).href]).toEqual([app, app]);
  // The app identity is read against the ORIGIN (W3C Web App Manifest, "process the id member"); no id means start_url.
  const identity = manifest.id === undefined ? start : new URL(manifest.id, start.origin);
  expect(identity.href.startsWith(app)).toBe(true);
  for (const shortcut of manifest.shortcuts) expect(new URL(shortcut.url, href).href.startsWith(app), shortcut.url).toBe(true);
  expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
  for (const icon of manifest.icons) {
    const url = new URL(icon.src, href).href;
    expect(url.startsWith(app), icon.src).toBe(true);
    const loaded = await page.evaluate(async (u) => {
      const res = await fetch(u);
      const blob = await res.blob();
      const size = blob.type === "image/png" ? await createImageBitmap(blob).then((b) => `${b.width}x${b.height}`) : "vector";
      return { status: res.status, type: blob.type, size };
    }, url);
    expect(loaded, icon.src).toEqual({ status: 200, type: icon.type, size: icon.type === "image/png" ? icon.sizes : "vector" });
  }
  // The icons the document names itself (favicon, home screen, mask) load from the mount too.
  const linked = await page.locator('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="mask-icon"]').evaluateAll((ls) => ls.map((l) => (l as HTMLLinkElement).href));
  expect(linked.length).toBeGreaterThanOrEqual(3);
  for (const url of linked) {
    expect(url.startsWith(app), url).toBe(true);
    expect(await page.evaluate(async (u) => (await fetch(u)).status, url), url).toBe(200);
  }
});

test("a Try asking card runs a purchase on-device and shows the one-off card", async () => {
  await page.goto(`${app}#/budget`);
  await expect(onDeviceNote(page)).toBeVisible();
  await page.locator('main [data-scenario="normal"]').click();
  await expect(page).toHaveURL(/#\/wally/);
  const wally = page.locator('[data-screen="wally"]');
  await expect(wally.locator('[data-kind="exact"]')).toContainText("Charged the exact HK$259.");
  const card = wally.getByRole("article", { name: "One-off card" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("HK$259");
  await expect(card).toHaveAttribute("data-card-state", /^(ACTIVE|USED)$/);
  await nav(page).getByRole("link", { name: "Budget", exact: true }).click();
  await expect(page.getByRole("meter")).toHaveAttribute("aria-valuetext", /HK\$541 left of HK\$800/);
  expect(requested.filter((u) => u.pathname.includes("/api"))).toEqual([]);
});

test("every screen opens from the mount: the lazy chunks of Wally, Receipts, Proof, Evidence, Seal and Presenter load", async () => {
  // Hash routes only: the document stays /wally/, so each screen's chunk is the proof that relative dynamic imports resolve.
  for (const route of ["wally", "receipts", "proof", "evidence", "seal", "presenter", "budget"]) {
    await page.goto(`${app}#/${route}`);
    await expect(page.locator("#root h1, #root [data-screen]").first(), route).toBeVisible();
    await expect(page, route).toHaveURL(`${app}#/${route}`);
  }
});

test("Proof links to /wally/verifier/ and that page loads and verifies its demo log", async () => {
  await nav(page).getByRole("link", { name: "Proof", exact: true }).click();
  const link = page.getByRole("link", { name: "Open the offline verifier" });
  await expect(link).toBeVisible();
  expect(await link.evaluate((a) => (a as HTMLAnchorElement).href)).toBe(`${app}verifier/`);
  await link.click();
  await expect(page).toHaveURL(`${app}verifier/`);
  await expect(page.locator('[data-outcome="idle"]')).toBeVisible();
  await page.getByRole("button", { name: /^Load demo log/ }).click();
  await page.getByRole("button", { name: /^Verify/ }).click();
  await expect(page.locator('#result [data-outcome="pass"]')).toContainText("PASS");
});

test("with the server gone, a reload still shows the app, from the service worker, and a purchase still runs", async () => {
  await page.goto(`${app}#/budget`);
  await expect(onDeviceNote(page)).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  // Offline twice over: the browser is told so, and the server drops every connection.
  server.setDown(true);
  await context.setOffline(true);
  try {
    const reloaded = await page.reload();
    expect(reloaded?.fromServiceWorker()).toBe(true);
    await expect(onDeviceNote(page)).toContainText("On-device mode: recorded answers, nothing leaves your phone");
    await expect(page.getByRole("meter")).toBeVisible();
    await page.locator('main [data-scenario="small"]').click();
    await expect(page.locator('[data-screen="wally"] [data-kind="exact"]')).toContainText("Charged the exact HK$120.");
  } finally {
    await context.setOffline(false);
    server.setDown(false);
  }
});

test("the whole run stayed inside /wally/: no /api, nothing at the origin root, no failed response, no script error", () => {
  const outside = requested.filter((u) => u.origin !== server.origin || !u.pathname.startsWith(MOUNT));
  expect(outside.map((u) => u.href)).toEqual([]);
  expect(requested.filter((u) => u.pathname.includes("/api"))).toEqual([]);
  expect(server.seen.filter((p) => !p.startsWith(MOUNT))).toEqual([]);
  expect(badResponses).toEqual([]);
  expect(scriptErrors).toEqual([]);
});
