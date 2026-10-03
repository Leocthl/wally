// Home as a shopper's screen, in a real browser on a phone: the greeting and budget, "What do you need?", Ideas for you, and the
// booth's scenario cards in a disclosure that is folded for a shopper and open on the booth Mac, with ?booth=1 and in presenter
// mode. The e2e server is on 127.0.0.1, which is the booth Mac, so a shopper's view is set up with the remembered choice.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

/** A shopper who folded the cards away, once: the choice is seeded on the first load only, so a reload shows what the page remembered. */
const folded = (page: Page) =>
  page.addInitScript(() => {
    if (window.sessionStorage.getItem("seeded") !== null) return;
    window.sessionStorage.setItem("seeded", "1");
    window.localStorage.setItem("wally:demo-open", "0");
  });
const composer = (page: Page) => page.getByRole("button", { name: "What do you need?" });
const demo = (page: Page) => page.locator("[data-demo-disclosure]");

async function blocking(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return result.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.impact} ${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
}

test.beforeEach(({ isMobile }) => {
  test.skip(!isMobile, "Home is checked on the phone project");
});

test("a shopper sees the greeting, the budget, the composer, four ideas and Recent, with the scenario cards folded away", async ({ page }) => {
  await folded(page);
  await page.goto("/?api=mock#/budget");
  await expect(page.getByText("Hi, I'm Wally.")).toBeVisible();
  await expect(page.getByRole("meter")).toHaveAttribute("aria-valuetext", "HK$800 left of HK$800, SIMULATED");
  await expect(composer(page)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ideas for you" })).toBeVisible();
  await expect(page.locator("main [data-idea]")).toHaveCount(4);
  await expect(page.locator("main [data-idea]").first()).toContainText("Cotton tee");
  await expect(demo(page)).not.toHaveAttribute("open", "");
  await expect(page.locator('main [data-scenario="normal"]').first()).toBeHidden();
  // The composer sits right under the budget, in the first screen, and the ideas are not far below it.
  const box = await composer(page).boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y + box!.height).toBeLessThan(844);
});

test("the composer opens the Ask sheet", async ({ page }) => {
  await folded(page);
  await page.goto("/?api=mock#/budget");
  await composer(page).click();
  await expect(page.getByRole("dialog", { name: /What should Wally try/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("an idea shops for the item, and the result is on Wally's screen", async ({ page }) => {
  await folded(page);
  await page.goto("/?api=mock#/budget");
  await page.locator('main [data-idea="socks"]').click();
  await expect(page).toHaveURL(/#\/wally$/);
  await expect(page.locator('[data-screen="wally"] [data-kind="exact"]')).toContainText("Charged the exact HK$120.");
});

test("the scenario cards open with one tap and the choice is remembered; ?booth=1 opens them whatever was chosen", async ({ page }) => {
  await folded(page);
  await page.goto("/?api=mock#/budget");
  await demo(page).locator("summary").click();
  await expect(demo(page)).toHaveAttribute("open", "");
  await expect(page.locator('main [data-scenario="normal"]').first()).toBeVisible();
  await expect(page.locator('main [data-scenario]')).toHaveCount(13);
  // The browser reports the change a moment after it happens (the toggle event); the choice is kept from then on.
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("wally:demo-open"))).toBe("1");
  await page.reload();
  await expect(demo(page)).toHaveAttribute("open", "");
  await demo(page).locator("summary").click();
  await expect(demo(page)).not.toHaveAttribute("open", "");
  await page.goto("/?api=mock&booth=1#/budget");
  await expect(demo(page)).toHaveAttribute("open", "");
});

test("the booth Mac (a loopback address) starts with the scenario cards open, and presenter mode opens them", async ({ page }) => {
  await page.goto("/?api=mock#/budget");
  await expect(demo(page)).toHaveAttribute("open", "");
  await page.evaluate(() => {
    window.localStorage.setItem("wally:demo-open", "0");
    window.localStorage.setItem("wally:presenter", "1");
  });
  await page.reload();
  await expect(demo(page)).toHaveAttribute("open", "");
});

test("Home in 繁體 reads the composer, the ideas and the disclosure", async ({ page }) => {
  await folded(page);
  await page.goto("/?api=mock#/budget");
  await page.getByRole("button", { name: "About and settings" }).click();
  await page.getByRole("dialog", { name: "About Wally" }).getByRole("radio", { name: "繁體中文" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "你需要啲咩？" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "為你推介" })).toBeVisible();
  await expect(page.getByText("示範情境（供評審使用）").first()).toBeVisible();
});

test.describe("axe on Home, folded and open", () => {
  for (const scheme of ["light", "dark"] as const) {
    test(`${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await folded(page);
      await page.goto("/?api=mock#/budget");
      await expect(composer(page)).toBeVisible();
      await page.waitForTimeout(500);
      expect(await blocking(page), "folded").toEqual([]);
      await demo(page).locator("summary").click();
      await page.waitForTimeout(300);
      expect(await blocking(page), "open").toEqual([]);
    });
  }
});
