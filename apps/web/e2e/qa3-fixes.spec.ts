// Two small fixes from the hostile QA run, in a real browser on the phone: the Cancel this budget question opens on Keep it (Enter
// keeps the budget, Escape closes the question), and the Try to trick Wally box stops at 4,000 characters with a counter near the
// limit. Both screens pass axe (no serious or critical finding) in light and dark.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
/** Set QA3_SHOTS_DIR to keep a picture of each state for a look. */
const SHOTS = process.env["QA3_SHOTS_DIR"];
const shot = async (page: Page, name: string): Promise<void> => {
  if (SHOTS !== undefined) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

async function blocking(page: Page): Promise<string[]> {
  await page.waitForTimeout(400); // the sheet's entrance has finished before axe reads its colours
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return result.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.impact} ${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
}

async function holdCancel(page: Page): Promise<void> {
  const button = page.getByRole("button", { name: "Hold to cancel this budget" });
  await button.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600); // the Cancel the budget card scrolls to Manage this budget, smoothly: measure once the page has stopped moving
  await button.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const box = await button.boundingBox();
  if (!box) throw new Error("no hold button");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1500);
  await page.mouse.up();
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test.beforeEach(async ({ page }) => {
      await page.goto("/?api=mock#/budget");
      await expect(page.getByRole("meter")).toBeVisible();
    });

    test("the cancel question opens on Keep it: Enter keeps the budget, Escape closes the question, and it has no serious axe finding", async ({ page }) => {
      await page.locator('main [data-scenario="revoke"]').click();
      await expect(page.locator('.oc[data-card-state="ACTIVE"]')).toBeVisible();
      const dialog = page.getByRole("alertdialog", { name: "Cancel this budget?" });

      await holdCancel(page);
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Keep it" })).toBeFocused();
      expect(await blocking(page), "cancel question").toEqual([]);
      await shot(page, `${scheme}-cancel-question`);
      await page.keyboard.press("Enter"); // the key a person presses on a question that just opened
      await expect(dialog).toHaveCount(0);
      await expect(page.getByText("This budget is cancelled")).toHaveCount(0);

      await holdCancel(page);
      await expect(dialog.getByRole("button", { name: "Keep it" })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(page.getByText("This budget is cancelled")).toHaveCount(0);
      await expect(page.locator('.oc[data-card-state="ACTIVE"]')).toBeVisible();
    });

    test("the trick box stops at 4,000 characters, shows a counter from 3,600, and has no serious axe finding", async ({ page }) => {
      await page.getByRole("button", { name: "Ask", exact: true }).click();
      const sheet = page.getByRole("dialog", { name: /What should Wally try/ });
      const box = sheet.getByRole("textbox", { name: /Product description/ });
      const count = sheet.locator("[data-trick-count]");

      await box.fill("x".repeat(3_000));
      await expect(count).toHaveCount(0); // quiet while there is room
      await box.fill("x".repeat(3_700));
      await expect(count).toContainText("3,700 / 4,000 characters");
      expect(await blocking(page), "counter near the limit").toEqual([]);
      await shot(page, `${scheme}-trick-counter-near`);

      await box.fill("x".repeat(3_999));
      await box.pressSequentially("ab"); // typed, so the box's own limit applies: one more character fits
      await expect(box).toHaveJSProperty("value", "x".repeat(3_999) + "a");
      await expect(count).toContainText("4,000 / 4,000 characters");
      await expect(count).toContainText("Limit reached");
      expect(await blocking(page), "counter at the limit").toEqual([]);
      await shot(page, `${scheme}-trick-counter-full`);
    });
  });
}
