// One purchase, one row, on a real phone: the Receipts list shows a bought item once (its decision, one-off card and charge are the
// "3 steps" under it), the number a purchase row carries is that of the receipt it opens (the same on Home, in Receipts and its
// sheet, and in Proof), the steps are 44 px targets that open their own receipt, and the changed copy of the tamper demo is flagged
// on the row and its step.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

async function blocking(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return result.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.impact} ${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
}

/** Buys a cotton tee from the booth's card (a hash change keeps the on-device state), then lands on Wally's result. */
async function buyTee(page: Page, query = ""): Promise<void> {
  await page.goto(`/?api=mock${query}#/budget`);
  await page.locator('main [data-scenario="normal"]').click();
  await expect(page).toHaveURL(/#\/wally/);
  await expect(page.locator('[data-screen="wally"] [data-run-state="approved"]')).toBeVisible();
}

test.beforeEach(({ isMobile }) => {
  test.skip(!isMobile, "Receipts are checked on the phone project");
});

test("a bought item is one row with its steps behind it, and the steps are 44 px targets that open their own receipt", async ({ page }) => {
  await buyTee(page);
  await page.goto("/?api=mock#/receipts");
  const purchase = page.locator(".rc-purchase");
  await expect(purchase).toHaveCount(1);
  await expect(purchase).toContainText("Demo Apparel · Cotton tee");
  await expect(purchase.locator(".rc-row__amount")).toHaveText("HK$259");
  await expect(page.locator(".rc-row__amount", { hasText: "HK$259" })).toHaveCount(1);
  const toggle = purchase.locator("[data-steps-toggle]");
  await expect(toggle).toHaveText("3 steps");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(purchase.locator(".rc-steps__list")).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const steps = purchase.locator(".rc-step");
  await expect(steps).toHaveCount(3);
  await expect(steps.locator(".rc-step__what")).toHaveText(["Approved", "One-off card made", "Charged"]);
  for (const box of await steps.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(box).toBeGreaterThanOrEqual(43.5);
  expect(await toggle.evaluate((e) => e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(43.5);
  // A step opens its own receipt.
  await steps.nth(1).click();
  const sheet = page.getByRole("dialog", { name: "One-off card" });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator(".rc-hero__meta")).toContainText("Receipt 3");
  await page.keyboard.press("Escape");
  // The row opens the receipt that tells how it ended: the charge.
  await purchase.locator(".w-row__hit").click();
  await expect(page.getByRole("dialog", { name: "Paid" })).toBeVisible();
});

test("a purchase row and the receipt it opens say one number: Home, Receipts, its sheet and Proof", async ({ page }) => {
  await buyTee(page);
  // Wally's details for nerds name the decision's own receipt (2), the one "See receipt" opens.
  await page.getByRole("button", { name: "Why was this approved?" }).click();
  const why = page.getByRole("dialog");
  await why.locator("summary", { hasText: "Details for nerds" }).click();
  await expect(why.locator(".run-nerd-ids")).toContainText("Receipt2");
  await page.keyboard.press("Escape");
  // The purchase ended with the charge, receipt 4: Home's Recent, the Receipts row and the sheet the row opens all say 4.
  await page.goto("/?api=mock#/budget");
  await expect(page.locator(".home-recent").first()).toContainText("Paid · Receipt 4");
  await page.goto("/?api=mock#/receipts");
  const row = page.locator(".rc-purchase .rc-row__meta");
  await expect(row).toContainText("Paid · Receipt 4");
  await row.click();
  await expect(page.getByRole("dialog", { name: "Paid" }).locator(".rc-hero__meta")).toContainText("Receipt 4");
  await page.keyboard.press("Escape");
  // Proof's timeline gives that receipt (the charge) the same number, and the decision its own.
  await page.goto("/?api=mock#/proof");
  const timeline = page.locator(".pf-tl__item");
  await expect(timeline.nth(3)).toContainText("Receipt 4");
  await expect(timeline.nth(3)).toContainText("Charged");
  await expect(timeline.nth(1)).toContainText("Receipt 2");
  await expect(timeline.nth(1)).toContainText("Approved");
});

test("developer mode keeps the flat list: every signed receipt is a row, with #seq and the hash", async ({ page }) => {
  await buyTee(page, "&dev=1");
  await page.goto("/?api=mock&dev=1#/receipts");
  await expect(page.locator('[data-screen="receipts"] .rc-row').first()).toBeVisible();
  await expect(page.locator(".rc-row")).toHaveCount(4);
  await expect(page.locator(".rc-purchase")).toHaveCount(0);
  await expect(page.locator("[data-steps-toggle]")).toHaveCount(0);
  await expect(page.locator(".rc-row").first()).toContainText(/#\d/);
});

test("the tamper demo's changed receipt is flagged on its purchase and on its step", async ({ page }) => {
  await buyTee(page);
  await page.goto("/?api=mock#/proof");
  await page.getByRole("button", { name: "Try changing one receipt" }).click();
  await expect(page.locator(".pf-card")).toHaveAttribute("data-status", "fail");
  await page.goto("/?api=mock#/receipts");
  const flagged = page.locator(".rc-row--flagged");
  await expect(flagged).toHaveCount(1);
  await expect(flagged).toContainText("Changed");
  // The purchase that holds it opens its steps by itself, and the changed step says so.
  await expect(flagged.locator("[data-steps-toggle]")).toHaveAttribute("aria-expanded", "true");
  await expect(flagged.locator(".rc-step--changed")).toContainText("Changed");
});

test.describe("axe, with the steps open", () => {
  for (const scheme of ["light", "dark"] as const) {
    for (const width of [360, 390, 430]) {
      test(`${scheme} ${width}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.setViewportSize({ width, height: 800 });
        await buyTee(page);
        await page.goto("/?api=mock#/receipts");
        await page.locator("[data-steps-toggle]").click();
        await expect(page.locator(".rc-step")).toHaveCount(3);
        await page.waitForTimeout(300);
        expect(await blocking(page)).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
      });
    }
  }
});
