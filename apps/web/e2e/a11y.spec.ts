// axe-core on every screen I own and the sheets over them, at three phone widths, light and dark: no serious or critical
// finding (WCAG 2 A and AA, 2.1, 2.2 AA, best practice). Moderate findings are listed in the failure text but do not fail.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 360, height: 740 },
  { width: 430, height: 932 },
] as const;
const SCHEMES = ["light", "dark"] as const;
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

async function blocking(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return result.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.impact} ${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
}

async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => !document.querySelector("[data-route-loading]"));
  await page.waitForTimeout(500);
}

/** The widths are set inside the tests, so one project is enough. */
function phoneProjectOnly(): void {
  test.skip(test.info().project.name !== "phone", "the widths are set inside the tests");
}

for (const viewport of VIEWPORTS) {
  for (const scheme of SCHEMES) {
    test.describe(`${viewport.width}x${viewport.height} ${scheme}`, () => {
      test.use({ viewport, colorScheme: scheme });

      test("Budget fresh and after a purchase, with the sheets over it", async ({ page }) => {
        phoneProjectOnly();
        await page.goto("/?api=mock#/budget");
        await expect(page.getByRole("meter")).toBeVisible();
        await settled(page);
        expect(await blocking(page), "budget fresh").toEqual([]);
        await page.getByRole("button", { name: "About and settings" }).click();
        await expect(page.getByRole("dialog", { name: "About Wally" })).toBeVisible();
        await settled(page);
        expect(await blocking(page), "about sheet").toEqual([]);
        await page.keyboard.press("Escape");
        await page.getByRole("button", { name: "Ask", exact: true }).click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await settled(page);
        expect(await blocking(page), "ask sheet").toEqual([]);
        await page.locator('.w-sheet [data-scenario="normal"]').click();
        await expect(page.locator('[data-screen="wally"]')).toBeVisible();
        await settled(page);
        expect(await blocking(page), "wally after a purchase").toEqual([]);
        await page.getByRole("link", { name: "Budget", exact: true }).click();
        await expect(page.getByRole("meter")).toHaveAttribute("aria-valuetext", /HK\$541 left of HK\$800/);
        await settled(page);
        expect(await blocking(page), "budget after a purchase").toEqual([]);
      });

      test("Seal from Meet Wally to Sealed", async ({ page }) => {
        phoneProjectOnly();
        await page.goto("/?api=mock#/seal?mode=welcome");
        await settled(page);
        expect(await blocking(page), "seal meet").toEqual([]);
        await page.getByRole("button", { name: /^Start/ }).click();
        await expect(page.getByRole("textbox", { name: /Your budget in a sentence/ })).toBeVisible();
        await settled(page);
        expect(await blocking(page), "seal describe").toEqual([]);
        await page.getByRole("button", { name: /^Next/ }).click();
        await expect(page.getByRole("heading", { level: 1, name: "Check and lock in" })).toBeVisible();
        await settled(page);
        expect(await blocking(page), "seal review").toEqual([]);
        await page.getByRole("button", { name: /Lock in budget/ }).click();
        await expect(page.getByRole("heading", { level: 1, name: "Your budget is locked in" })).toBeVisible();
        await settled(page);
        expect(await blocking(page), "seal sealed").toEqual([]);
      });

      test("Receipts, Proof, Presenter and Evidence", async ({ page }) => {
        phoneProjectOnly();
        for (const route of ["receipts", "proof", "presenter", "evidence"]) {
          await page.goto(`/?api=mock#/${route}`);
          await expect(page.getByRole("note")).toBeVisible();
          await settled(page);
          expect(await blocking(page), route).toEqual([]);
        }
      });
    });
  }
}
