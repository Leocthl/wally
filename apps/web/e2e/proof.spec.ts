// Receipts (#/receipts) and Proof (#/proof) in a real browser on the offline client. Plain mode is the default: Proof checks
// on its own and says "untouched", "Try changing one receipt" shows a changed copy caught by the check with a banner on
// top, "Put it back" restores, and a receipt's details show a fingerprint. The developer views (?dev=1) keep their flow.
import { expect, test, type Page } from "@playwright/test";

/** dev opens the technical views the way a demo link does (?dev=1). A page that is only moved to another hash keeps its on-device state. */
async function open(page: Page, hash: string, screen: "receipts" | "proof", dev = false): Promise<void> {
  await page.goto(`/?api=mock${dev ? "&dev=1" : ""}${hash}`);
  await expect(page.locator(`[data-screen="${screen}"]`)).toBeVisible();
}

async function noSidewaysScroll(page: Page): Promise<void> {
  const w = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(w.scroll).toBeLessThanOrEqual(w.client);
}

/** One purchase first, from Try asking (a hash change keeps the on-device state), so there are several receipts to list. */
async function buyOnce(page: Page, query = ""): Promise<void> {
  await page.goto(`/?api=mock${query}#/budget`);
  await page.locator('main [data-scenario="normal"]').click();
  await expect(page).toHaveURL(/#\/wally/);
}

test("Receipts: rows by day, filters, a sheet, and the deep link", async ({ page }, info) => {
  await buyOnce(page);
  await open(page, "#/receipts", "receipts");
  await expect(page.locator(".rc-row").first()).toBeVisible();
  await expect(page.locator(".rc-day__title").first()).toBeVisible();
  await noSidewaysScroll(page);
  await page.getByRole("radio", { name: /Approved/ }).click();
  const approved = page.locator('.rc-row__meta[data-state="approved"]').first();
  await expect(approved).toBeVisible();
  await expect(approved).toContainText(/Receipt \d/);
  await approved.click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(sheet.locator("details summary")).toHaveText("Show the details");
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

test("Proof (plain): checks on its own, catches a changed copy and explains it, and Put it back restores", async ({ page }, info) => {
  await buyOnce(page);
  await open(page, "#/proof", "proof");
  const card = page.locator(".pf-card");
  // Nothing was pressed: the verdict is already there.
  await expect(card).toHaveAttribute("data-status", "pass");
  await expect(card).toContainText("untouched");
  await expect(page.locator("[data-tampered-banner]")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("proof-plain-untouched.png"), fullPage: true });

  await page.getByRole("button", { name: "Try changing one receipt" }).click();
  await expect(card).toHaveAttribute("data-status", "fail");
  await expect(card).toContainText("was changed");
  await expect(page.locator("[data-tampered-copy]")).toContainText("the check caught it");
  const banner = page.locator("[data-tampered-banner]");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("You are looking at a changed copy of the receipts. The stored originals are untouched.");
  await expect(page.locator('.pf-tl__item[data-status="changed"]')).toContainText("Changed");
  await page.screenshot({ path: info.outputPath("proof-plain-changed.png"), fullPage: true });

  await page.getByRole("button", { name: "Put it back" }).click();
  await expect(card).toHaveAttribute("data-status", "pass");
  await expect(card).toContainText("untouched");
  await expect(banner).toHaveCount(0);

  // Opening a receipt shows its fingerprint; closed, the rows show no hash.
  const row = page.locator(".pf-tl__item").nth(1);
  await expect(row).not.toContainText(/[0-9a-f]{8}/);
  await row.locator("summary").click();
  await expect(row.locator(".pf-tl__details")).toContainText(/[0-9a-f]{8}/);
  await noSidewaysScroll(page);
});

test("A changed copy follows you to Receipts, flagged, and one tap puts the original back", async ({ page }) => {
  await buyOnce(page);
  await open(page, "#/proof", "proof");
  await page.getByRole("button", { name: "Try changing one receipt" }).click();
  await expect(page.locator(".pf-card")).toHaveAttribute("data-status", "fail");
  await open(page, "#/receipts", "receipts");
  const banner = page.locator("[data-tampered-banner]");
  await expect(banner).toBeVisible();
  await expect(page.locator(".rc-row--flagged")).toHaveCount(1);
  await expect(page.locator(".rc-row--flagged")).toContainText("Changed");
  await noSidewaysScroll(page);
  await banner.getByRole("button", { name: "Restore the original" }).click();
  await expect(banner).toHaveCount(0);
  await expect(page.locator(".rc-row--flagged")).toHaveCount(0);
});

test("Proof (developer): verify, try to tamper, restore", async ({ page }, info) => {
  await open(page, "#/proof", "proof", true);
  const card = page.locator(".pf-card");
  await page.getByRole("button", { name: "Verify receipts" }).click();
  await expect(card).toHaveAttribute("data-status", "pass");
  await expect(card).toContainText("Receipts verified.");
  await page.getByRole("button", { name: "Try to tamper" }).click();
  await expect(card).toHaveAttribute("data-status", "fail");
  await expect(card).toContainText("Broken at receipt");
  await expect(card.locator("[data-reason]")).toBeVisible();
  // The banner also says so, and has its own button: the screen's Restore is matched by its exact name.
  await expect(page.locator("[data-tampered-banner]")).toBeVisible();
  await page.screenshot({ path: info.outputPath("proof-broken.png"), fullPage: true });
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(card).toHaveAttribute("data-status", "pass");
  await expect(page.locator("[data-tampered-banner]")).toHaveCount(0);
  await noSidewaysScroll(page);
});
