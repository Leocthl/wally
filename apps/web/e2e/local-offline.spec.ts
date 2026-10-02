// On-device mode in a real browser with the network BLOCKED: every request that is not this origin is aborted, and
// so is any /api call. The page runs the real stack with recorded answers; the presenter storyline gives HK$259
// minted, HK$541 left, HK$550 stopped by R3, R9 and R10 stops, HK$120 minted [F20-F23]; the Log view verifies the real
// signed chain (PASS) and fails the tampered copy at the changed entry, with all checks run (signatures included).
import { expect, test, type Page } from "@playwright/test";

interface Watch {
  readonly outside: string[];
  readonly api: string[];
  readonly errors: string[];
}

async function blockNetwork(page: Page, origin: string): Promise<Watch> {
  const watch: Watch = { outside: [], api: [], errors: [] };
  await page.context().route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      watch.outside.push(url.href);
      return route.abort("internetdisconnected");
    }
    if (url.pathname.startsWith("/api/")) {
      watch.api.push(url.pathname);
      return route.abort("connectionrefused");
    }
    return route.continue();
  });
  page.on("pageerror", (e) => watch.errors.push(e.message));
  return watch;
}

async function openTab(page: Page, name: "Packet" | "Run" | "Log"): Promise<void> {
  const tab = page.getByRole("tab", { name: new RegExp(`^${name}`) });
  if (await tab.isVisible()) await tab.click();
}

async function press(page: Page, scenario: string): Promise<void> {
  await openTab(page, "Run");
  await page.locator(`[data-scenario="${scenario}"]`).click();
}

const meter = (page: Page) => page.getByRole("meter");
const banner = (page: Page, text: string) => page.getByRole("alert").filter({ hasText: text });

test("offline, ?api=local: the storyline on the real stack, then Verify PASS and Tamper FAIL at the changed entry", async ({ page, baseURL }) => {
  const watch = await blockNetwork(page, new URL(baseURL ?? "http://127.0.0.1").origin);
  await page.goto("/?api=local#/booth");
  await expect(page.locator('[data-api-mode="local"]')).toContainText("On-device mode: recorded answers, nothing leaves your phone");
  await expect(meter(page)).toHaveAttribute("aria-valuetext", /HK\$800 left of HK\$800, SIMULATED/);

  await press(page, "normal");
  await expect(page.locator('[data-event="AUTHORISED"]')).toBeVisible();
  await expect(meter(page)).toHaveAttribute("aria-valuetext", /HK\$541 left of HK\$800/);
  await openTab(page, "Packet");
  await expect(page.locator('#panel-packet [data-card-state="USED"]').first()).toContainText("HK$259");

  await press(page, "flagged");
  await expect(banner(page, "STOPPED R9")).toContainText("Seller flagged");
  await press(page, "overflow");
  await expect(banner(page, "STOPPED R3")).toContainText("Total HK$550");
  await expect(banner(page, "STOPPED R3")).toContainText("HK$541");
  await press(page, "injected");
  await expect(banner(page, "STOPPED R10")).toContainText("Injection risk");
  await press(page, "small");
  await expect(page.locator('[data-event="AUTHORISED"]')).toBeVisible();
  await expect(meter(page)).toHaveAttribute("aria-valuetext", /HK\$421 left of HK\$800/);
  await openTab(page, "Packet");
  await expect(page.locator('#panel-packet [data-card-state="USED"]')).toHaveCount(2);
  await expect(page.locator("#panel-packet [data-card-state]").filter({ hasText: "HK$120" })).toHaveCount(1);

  await openTab(page, "Log");
  const status = page.locator(".verify-bar__result");
  await page.getByRole("button", { name: /^Verify/ }).click();
  await expect(status).toContainText("Chain intact");
  await expect(status).not.toContainText("Not checked");
  await page.getByRole("button", { name: /^Tamper/ }).click();
  await page.getByRole("button", { name: /^Verify/ }).click();
  await expect(status).toContainText("Chain broken at entry 1");
  await expect(status).toContainText("PAYLOAD_HASH");
  await expect(page.getByLabel("Decision log").getByText(/CHANGED/)).toHaveCount(1);
  await page.getByRole("button", { name: /^Restore/ }).click();
  await page.getByRole("button", { name: /^Verify/ }).click();
  await expect(status).toContainText("Chain intact");

  expect(watch.outside).toEqual([]);
  expect(watch.api).toEqual([]);
  expect(watch.errors).toEqual([]);
});

test("offline, a VITE_API=local build without ?api: on-device at once, no /api probe, the note shows", async ({ page, baseURL }) => {
  const watch = await blockNetwork(page, new URL(baseURL ?? "http://127.0.0.1").origin);
  await page.goto("/#/booth");
  await expect(page.locator('[data-api-mode="local"]')).toBeVisible();
  await press(page, "flagged");
  await expect(banner(page, "STOPPED R9")).toBeVisible();
  expect(watch.outside).toEqual([]);
  expect(watch.api).toEqual([]);
  expect(watch.errors).toEqual([]);
});
