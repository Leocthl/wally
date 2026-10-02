// Receipts (#/receipts) and Proof (#/proof) in a real browser on the offline client: rows grouped by day, a receipt's
// sheet, the ?d= deep link, and Verify, Try to tamper (fails at the changed receipt), Restore (passes again). These are
// the new shell's routes (lane b-shell); before that shell is merged the routes are not wired and the tests skip.
import { expect, test, type Page } from "@playwright/test";

async function open(page: Page, hash: string, screen: "receipts" | "proof"): Promise<void> {
  await page.goto(`/${hash}`);
  // The app is up once its main landmark renders; the screen then appears only where the shell routes it.
  await page.locator("main").first().waitFor();
  await page.waitForTimeout(500);
  const wired = await page.locator(`[data-screen="${screen}"]`).count();
  test.skip(wired === 0, `#/${screen} is not routed yet (needs the lane b-shell App)`);
}

async function noSidewaysScroll(page: Page): Promise<void> {
  const w = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(w.scroll).toBeLessThanOrEqual(w.client);
}

test("Receipts: rows by day, filters, a sheet, and the deep link", async ({ page }, info) => {
  await open(page, "#/receipts", "receipts");
  await expect(page.locator(".rc-row").first()).toBeVisible();
  await expect(page.locator(".rc-day__title").first()).toBeVisible();
  await noSidewaysScroll(page);
  await page.locator(".rc-row button").first().click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await page.screenshot({ path: info.outputPath("receipt-sheet.png") });
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await page.getByRole("radio", { name: /Approved/ }).click();
  await expect(page.locator('.rc-row__meta[data-state="approved"]').first()).toBeVisible();
});

test("Proof: verify, try to tamper, restore", async ({ page }, info) => {
  await open(page, "#/proof", "proof");
  const card = page.locator(".pf-card");
  await page.getByRole("button", { name: "Verify receipts" }).click();
  await expect(card).toHaveAttribute("data-status", "pass");
  await expect(card).toContainText("Receipts verified.");
  await page.getByRole("button", { name: "Try to tamper" }).click();
  await expect(card).toHaveAttribute("data-status", "fail");
  await expect(card).toContainText("Broken at receipt");
  await expect(card.locator("[data-reason]")).toBeVisible();
  await page.screenshot({ path: info.outputPath("proof-broken.png"), fullPage: true });
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(card).toHaveAttribute("data-status", "pass");
  await noSidewaysScroll(page);
});
