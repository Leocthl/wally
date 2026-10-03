// On-device mode in a real browser with the network BLOCKED: every request that is not this origin is aborted, and
// so is any /api call. The page runs the real stack with recorded answers; the presenter storyline gives HK$259
// minted, HK$541 left, HK$550 stopped by the budget rule, seller and listing stops, HK$120 minted [F20-F23]; Proof verifies the real
// signed chain (PASS) and fails the tampered copy at the changed receipt, with all checks run (signatures included).
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

/** Try asking lives on Budget; a press moves to Wally, where the result shows. */
async function press(page: Page, scenario: string): Promise<void> {
  if ((await page.locator(`main [data-scenario="${scenario}"]:visible`).count()) === 0) await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Budget", exact: true }).click();
  await page.locator(`main [data-scenario="${scenario}"]`).click();
  await expect(page).toHaveURL(/#\/wally/);
}

const meter = (page: Page) => page.getByRole("meter");
const wally = (page: Page) => page.locator('[data-screen="wally"]');
const stop = (page: Page, text: string | RegExp) => wally(page).getByRole("alert").filter({ hasText: text });

test("offline, ?api=local: the storyline on the real stack, then Verify PASS and Try to tamper FAIL at the changed receipt", async ({ page, baseURL }) => {
  await page.addInitScript(() => window.localStorage.setItem("wally:mode", "developer")); // the codes and hashes this test reads
  const watch = await blockNetwork(page, new URL(baseURL ?? "http://127.0.0.1").origin);
  await page.goto("/?api=local#/budget");
  await expect(page.locator('[data-api-mode="local"]')).toContainText("On-device mode: recorded answers, nothing leaves your phone");
  await expect(meter(page)).toHaveAttribute("aria-valuetext", /HK\$800 left of HK\$800, SIMULATED/);

  await press(page, "normal");
  await expect(wally(page).locator('[data-kind="exact"]')).toContainText("Charged the exact HK$259.");
  await page.getByRole("link", { name: "Budget", exact: true }).click();
  await expect(meter(page)).toHaveAttribute("aria-valuetext", /HK\$541 left of HK\$800/);
  await expect(page.locator('.oc, [data-card-state="USED"]').first()).toBeVisible();

  await press(page, "flagged");
  await expect(stop(page, "This seller is flagged as a possible scam.")).toBeVisible();
  await press(page, "overflow");
  await expect(stop(page, "It costs HK$550 with shipping, but only HK$541 is left in your budget.")).toBeVisible();
  await press(page, "injected");
  await expect(stop(page, "The listing tried to give Wally orders.")).toBeVisible();
  await press(page, "small");
  await expect(wally(page).locator('[data-kind="exact"]')).toContainText("Charged the exact HK$120.");
  await page.getByRole("link", { name: "Budget", exact: true }).click();
  await expect(meter(page)).toHaveAttribute("aria-valuetext", /HK\$421 left of HK\$800/);

  await page.getByRole("link", { name: "Proof", exact: true }).click();
  const card = page.locator(".pf-card");
  await page.getByRole("button", { name: "Verify receipts" }).click();
  await expect(card).toHaveAttribute("data-status", "pass");
  await expect(card).toContainText("Checked on this device.");
  await expect(card).not.toContainText("Not checked in this mode");
  await page.getByRole("button", { name: "Try to tamper" }).click();
  await expect(card).toHaveAttribute("data-status", "fail");
  await expect(card).toContainText(/Broken at receipt #\d/);
  await expect(card.locator("[data-reason]")).toContainText("PAYLOAD_HASH");
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(card).toHaveAttribute("data-status", "pass");

  expect(watch.outside).toEqual([]);
  expect(watch.api).toEqual([]);
  expect(watch.errors).toEqual([]);
});

test("offline, a VITE_API=local build without ?api: on-device at once, no /api probe, the note shows", async ({ page, baseURL }) => {
  const watch = await blockNetwork(page, new URL(baseURL ?? "http://127.0.0.1").origin);
  await page.goto("/#/booth");
  await expect(page.locator('[data-api-mode="local"]')).toBeVisible();
  await press(page, "flagged");
  await expect(stop(page, "This seller is flagged as a possible scam.")).toBeVisible();
  expect(watch.outside).toEqual([]);
  expect(watch.api).toEqual([]);
  expect(watch.errors).toEqual([]);
});
