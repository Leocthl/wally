// Wally screen smoke test (lane b-run) on the offline mock client, phone and desktop projects. Scenarios start from the
// Try asking cards on Budget; a press moves to #/wally, where the result shows. Every URL carries ?api=mock.
import { expect, test, type Page } from "@playwright/test";

/** Wally's screen on a fresh mock. */
async function openWally(page: Page): Promise<void> {
  await page.goto("/?api=mock#/wally");
  await expect(page.locator('[data-screen="wally"]')).toBeVisible();
}

/** Presses the Try asking card for a scenario on Budget (a hash change, so the mock keeps its state); the result shows on Wally. */
async function tryAsking(page: Page, scenario: string): Promise<void> {
  await page.goto("/?api=mock#/budget");
  const card = page.locator(`main [data-scenario="${scenario}"]`);
  await expect(card).toBeEnabled();
  await card.click();
  await expect(page).toHaveURL(/#\/wally/);
  await expect(page.locator('[data-screen="wally"]')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await openWally(page);
});

test("idle: Wally is ready and offers to help", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Ask Wally" }).first()).toBeVisible();
});

test("normal purchase: a one-off card for the exact amount, no rule ids on screen", async ({ page }) => {
  await tryAsking(page, "normal");
  const card = page.getByRole("article", { name: "One-off card" });
  await expect(card).toContainText("HK$259");
  await expect(card).toContainText("Works once, for this amount only");
  await expect(card).toContainText("SIMULATED");
  await expect(page.locator('[data-screen="wally"]')).not.toContainText(/\bR\d{1,2}\b/);
});

test("flagged seller: stopped before paying, plain reason, then the Why sheet and its details", async ({ page }) => {
  await tryAsking(page, "flagged");
  const alert = page.getByRole("alert").filter({ hasText: "Stopped before paying" });
  await expect(alert).toContainText("This seller is flagged as a possible scam.");
  await expect(page.getByText("No card was made. Nothing can be charged.")).toBeVisible();
  await page.getByRole("button", { name: "Why?" }).click();
  const sheet = page.getByRole("dialog", { name: "Why Wally stopped" });
  await expect(sheet).toContainText("Seller");
  await sheet.getByText("Details for nerds").click();
  await expect(sheet).toContainText("Stopped by R9.");
});

test("needs your OK: Approve continues to the one-off card", async ({ page }) => {
  await tryAsking(page, "unverified");
  const sheet = page.getByRole("dialog", { name: "Needs your OK" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("timer")).toContainText("s left");
  await expect(sheet).toContainText("Wally makes a one-off card for exactly HK$259.");
  await sheet.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("You said yes, so Wally went ahead.")).toBeVisible();
});

test("no horizontal scroll at 320 px on a result", async ({ page }) => {
  await tryAsking(page, "overflow");
  await page.setViewportSize({ width: 320, height: 640 });
  await expect(page.getByRole("alert").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
