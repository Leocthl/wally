// Receipts (#/receipts) and Proof (#/proof) in a real browser on the offline client: rows grouped by day, a receipt's
// sheet, the ?d= deep link, and Verify, Try to tamper (fails at the changed receipt), Restore (passes again).
import { expect, test, type Page } from "@playwright/test";

async function open(page: Page, hash: string, screen: "receipts" | "proof"): Promise<void> {
  await page.goto(`/?api=mock${hash}`);
  await expect(page.locator(`[data-screen="${screen}"]`)).toBeVisible();
}

async function noSidewaysScroll(page: Page): Promise<void> {
  const w = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(w.scroll).toBeLessThanOrEqual(w.client);
}

test("Receipts: rows by day, filters, a sheet, and the deep link", async ({ page }, info) => {
  // One purchase first, from Try asking (a hash change keeps the on-device state).
  await page.goto("/?api=mock#/budget");
  await page.locator('main [data-scenario="normal"]').click();
  await expect(page).toHaveURL(/#\/wally/);
  await open(page, "#/receipts", "receipts");
  await expect(page.locator(".rc-row").first()).toBeVisible();
  await expect(page.locator(".rc-day__title").first()).toBeVisible();
  await noSidewaysScroll(page);
  await page.getByRole("radio", { name: /Approved/ }).click();
  const approved = page.locator('.rc-row__meta[data-state="approved"]').first();
  await expect(approved).toBeVisible();
  await approved.click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await page.screenshot({ path: info.outputPath("receipt-sheet.png") });
  const open_in_wally = sheet.getByRole("link", { name: /Open in Wally/ });
  const href = (await open_in_wally.getAttribute("href")) ?? "";
  expect(href).toMatch(/^#\/wally\?d=dec_/);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  // The deep link opens that receipt's sheet.
  await page.goto(`/?api=mock#/receipts?d=${href.split("d=")[1] ?? ""}`);
  await expect(page.getByRole("dialog")).toBeVisible();
  // The old ?decision= name still works and is rewritten.
  await page.goto(`/?api=mock#/receipts?decision=${href.split("d=")[1] ?? ""}`);
  await expect(page).toHaveURL(/#\/receipts\?d=dec_/);
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
