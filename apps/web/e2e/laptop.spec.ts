// The laptop layout in a real browser, 1440 x 900 (the project "laptop"): the top navigation with Ask Wally, the whole Budget
// screen on one screen with no scroll, the scenarios as a panel of tabs, a sheet as a drawer from the right, and axe on it in
// both colour schemes. The phone specs (every other project) cover the phone layout; nothing here runs on a phone.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

async function blocking(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return result.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.impact} ${v.id}: ${v.nodes.slice(0, 2).map((n) => `${n.target.join(" ")} (${(n.any[0]?.message ?? "").slice(0, 160)})`).join(" | ")}`);
}

async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => !document.querySelector("[data-route-loading]"));
  await page.waitForTimeout(500);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/?api=mock#/budget");
  await expect(page.getByRole("meter")).toBeVisible();
});

test("shows the four places as words in the top bar, Ask Wally beside them, and no tab bar", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link")).toHaveText(["Budget", "Wally", "Receipts", "Proof"]);
  await expect(nav.getByRole("link", { name: "Budget", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("banner").getByRole("button", { name: "Ask Wally", exact: true })).toBeVisible();
  await expect(page.locator(".w-tabbar")).toHaveCount(0);
  await nav.getByRole("link", { name: "Receipts", exact: true }).click();
  await expect(page).toHaveURL(/#\/receipts$/);
  await expect(nav.getByRole("link", { name: "Receipts", exact: true })).toHaveAttribute("aria-current", "page");
});

test("fits the whole Budget screen on one screen: no scroll, and every part inside the window", async ({ page }) => {
  const size = page.viewportSize();
  if (!size) throw new Error("no viewport");
  const scroll = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, inner: window.innerHeight, width: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  expect(scroll.height, "page height").toBeLessThanOrEqual(scroll.inner);
  expect(scroll.width, "page width").toBeLessThanOrEqual(scroll.innerWidth);
  const parts: Record<string, ReturnType<Page["locator"]>> = {
    greeting: page.locator(".home-hero__greet"),
    ask: page.locator("[data-composer]"),
    budget: page.getByRole("meter"),
    ideas: page.locator("[data-idea]").last(),
    tabs: page.getByRole("tablist"),
    manage: page.getByRole("button", { name: "Hold to cancel this budget" }),
  };
  for (const [name, locator] of Object.entries(parts)) {
    const box = await locator.boundingBox();
    expect(box, name).not.toBeNull();
    expect(box!.y, `${name} top`).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height, `${name} bottom`).toBeLessThanOrEqual(size.height);
  }
});

test("lays the Budget screen out in three columns: now, the shelf, the scenarios", async ({ page }) => {
  const x = async (selector: string): Promise<number> => (await page.locator(selector).first().boundingBox())!.x;
  const now = await x(".home-col--now");
  const shelf = await x(".home-col--shelf");
  const test_ = await x(".home-col--test");
  expect(now).toBeLessThan(shelf);
  expect(shelf).toBeLessThan(test_);
  const manage = await page.locator("#budget-console").boundingBox();
  const card = await page.locator(".home-hero__card").boundingBox();
  expect(manage!.x).toBeCloseTo(card!.x, 0);
  expect(manage!.y).toBeGreaterThan(card!.y + card!.height);
});

test("runs a scenario from the open panel: Stops, then a seller with scam reports", async ({ page }) => {
  await expect(page.getByRole("tab", { name: "Buy" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Stops" }).click();
  await page.locator('main [data-scenario="flagged"]').click();
  await expect(page).toHaveURL(/#\/wally$/);
  await expect(page.locator('[data-screen="wally"]')).toContainText("Stopped before paying");
});

test("opens Ask Wally as a drawer from the right edge, full height, and closes it with Escape", async ({ page }) => {
  await page.getByRole("banner").getByRole("button", { name: "Ask Wally", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "What should Wally try?" });
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(600);
  const box = (await sheet.boundingBox())!;
  const size = page.viewportSize()!;
  expect(box.x + box.width).toBeCloseTo(size.width, 0);
  expect(box.height).toBeGreaterThanOrEqual(size.height - 1);
  expect(box.width).toBeLessThanOrEqual(520);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
});

for (const scheme of ["light", "dark"] as const) {
  test.describe(`axe, ${scheme}`, () => {
    // Reduced motion, like the phone specs: axe reads colours at one instant, and a figure half-faded in is not a finding.
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    });

    test("Budget, the About drawer, the Ask drawer and Wally after a stop have no serious finding", async ({ page }) => {
      await settled(page);
      expect(await blocking(page), "budget").toEqual([]);
      await page.getByRole("tab", { name: "Card" }).click();
      await settled(page);
      expect(await blocking(page), "budget, Card tab").toEqual([]);
      await page.getByRole("button", { name: "About and settings" }).click();
      await expect(page.getByRole("dialog", { name: "About Wally" })).toBeVisible();
      await settled(page);
      expect(await blocking(page), "about drawer").toEqual([]);
      await page.keyboard.press("Escape");
      await page.getByRole("banner").getByRole("button", { name: "Ask Wally", exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await settled(page);
      expect(await blocking(page), "ask drawer").toEqual([]);
      await page.keyboard.press("Escape");
      await page.getByRole("tab", { name: "Stops" }).click();
      await page.locator('main [data-scenario="flagged"]').click();
      await expect(page.getByRole("alert").filter({ hasText: "Stopped before paying" })).toBeVisible();
      await settled(page);
      expect(await blocking(page), "wally after a stop").toEqual([]);
    });
  });
}
