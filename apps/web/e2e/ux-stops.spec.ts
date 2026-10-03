// The dead ends after a no, in a real browser: the stop on the budget's categories names the rules and offers Edit rules, a question
// still open when the budget is cancelled is closed in the view (no Approve), a cancelled budget leads to a new one, and the OK
// countdown is a promise. Axe at the three phone widths, light and dark, on the screens these changed.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const SIZES = [{ width: 360, height: 740 }, { width: 390, height: 844 }, { width: 430, height: 932 }] as const;

async function blocking(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return result.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.impact} ${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
}

async function holdCancel(page: Page): Promise<void> {
  const button = page.getByRole("button", { name: "Hold to cancel this budget" });
  await button.scrollIntoViewIfNeeded();
  await button.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const box = await button.boundingBox();
  if (!box) throw new Error("no hold button");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1500);
  await page.mouse.up();
}

test.beforeEach(({ isMobile }) => {
  test.skip(!isMobile, "checked on the phone project");
});

for (const scheme of ["light", "dark"] as const) {
  for (const size of SIZES) {
    test(`${scheme} at ${size.width}: the category stop names the rules, the OK sheet promises what happens, both pass axe`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await page.setViewportSize(size);
      await page.goto("/?api=mock#/budget");
      await page.locator('main [data-scenario="off_category"]').click();
      const stop = page.locator('[data-screen="wally"]').getByRole("alert").filter({ hasText: "Stopped before paying" });
      await expect(stop).toContainText("Your budget is for Clothes only.");
      await expect(page.getByRole("button", { name: "Edit rules" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Pick something else" })).toBeVisible();
      expect(await blocking(page), "the category stop").toEqual([]);

      await page.goto("/?api=mock#/budget");
      await page.locator('main [data-scenario="unverified"]').click();
      const sheet = page.getByRole("dialog", { name: "Needs your OK" });
      await expect(sheet).toContainText("Wally waits 60 seconds, then cancels this for you.");
      expect(await blocking(page), "Needs your OK").toEqual([]);
    });
  }
}

test("Edit rules opens the Seal screen, and says that locking in starts a new budget", async ({ page }) => {
  await page.goto("/?api=mock#/budget");
  await page.locator('main [data-scenario="off_category"]').click();
  await page.getByRole("button", { name: "Edit rules" }).click();
  await expect(page).toHaveURL(/#\/seal\?mode=edit$/);
  await expect(page.getByText("Locking in starts a new budget and new receipts.")).toBeVisible();
});

for (const scheme of ["light", "dark"] as const) {
  test(`${scheme}: a question left open when the budget is cancelled is closed, and the stop leads to a new budget`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/?api=mock#/budget");
    await page.locator('main [data-scenario="unverified"]').click();
    await expect(page.getByRole("dialog", { name: "Needs your OK" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("link", { name: "Budget", exact: true }).click();
    await holdCancel(page);
    await page.getByRole("alertdialog", { name: "Cancel this budget?" }).getByRole("button", { name: "Cancel budget" }).click();
    await expect(page.getByText("This budget is cancelled")).toBeVisible();
    expect(await blocking(page), "Budget after the cancel").toEqual([]);

    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Wally", exact: true }).click();
    await expect(page.locator('[data-screen="wally"]')).toContainText("You cancelled this budget, so this question is closed");
    await expect(page.getByRole("button", { name: /^Approve/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Start a new budget" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ask Wally" })).toHaveCount(0);
    expect(await blocking(page), "Wally after the cancel").toEqual([]);
  });
}
