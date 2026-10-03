// The awkward inputs a real person gives: a nickname of 24 wide letters, text at 200%, an amount of 16 digits, and Tab.
// None of them may push the page sideways, hide the language switch or About, drop the visitor out of the first run, or hide Skip.
import { expect, test, type Page } from "@playwright/test";

const WIDE = "W".repeat(24);
const PROFILE = JSON.stringify({ v: 1, nickname: WIDE, styles: [], colours: [], sizes: { top: null, bottom: null, shoe: null }, shopFor: [] });

const sideways = (page: Page): Promise<number> => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe("on Budget, with the profile already made", () => {
  test.beforeEach(async ({ page, isMobile }) => {
    test.skip(!isMobile, "checked on the phone project");
    await page.addInitScript((profile) => window.localStorage.setItem("wally:profile:v1", profile), PROFILE);
  });

  test("a 24-letter nickname wraps in Wally's greeting and in About, at 320 and 360 px", async ({ page }) => {
    for (const width of [320, 360]) {
      await page.setViewportSize({ width, height: 740 });
      await page.goto("/?api=mock#/budget");
      await expect(page.getByRole("meter")).toBeVisible();
      await expect(page.locator(".home-hero__hi")).toContainText(WIDE);
      expect(await sideways(page), `Budget at ${width}`).toBeLessThanOrEqual(0);
      const bubble = await page.locator(".home-hero__bubble").boundingBox();
      expect((bubble?.x ?? 0) + (bubble?.width ?? 0), `the greeting stays on the screen at ${width}`).toBeLessThanOrEqual(width);
      await page.getByRole("button", { name: "About and settings" }).click();
      const about = page.getByRole("dialog", { name: "About Wally" });
      await expect(about.getByText(WIDE)).toBeVisible();
      expect(await sideways(page), `About at ${width}`).toBeLessThanOrEqual(0);
      const row = await about.getByText(WIDE).boundingBox();
      expect((row?.x ?? 0) + (row?.width ?? 0), `the profile row stays inside the sheet at ${width}`).toBeLessThanOrEqual(width);
      await page.keyboard.press("Escape");
    }
  });

  test("at 200% text the language switch and About are still on the screen", async ({ page }) => {
    for (const [width, height] of [[360, 740], [390, 844]] as const) {
      await page.setViewportSize({ width, height });
      await page.goto("/?api=mock#/budget");
      await expect(page.getByRole("meter")).toBeVisible();
      await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      await page.waitForTimeout(300);
      for (const target of [page.getByRole("radiogroup", { name: "Language" }), page.getByRole("button", { name: "About and settings" }), page.getByRole("button", { name: /what does SIMULATED mean|SIMULATED/i }).first()]) {
        const box = await target.boundingBox();
        expect(box, "found").not.toBeNull();
        expect((box?.x ?? -1) >= 0 && (box?.x ?? 0) + (box?.width ?? 0) <= width, `on screen at ${width}`).toBe(true);
      }
      // The budget number stays inside its card, the hero is not wider than the phone.
      const stat = await page.locator(".home-hero__stat").boundingBox();
      expect((stat?.x ?? 0) + (stat?.width ?? 0), "the big number fits").toBeLessThanOrEqual(width);
    }
  });
});

test.describe("on the first run", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a 16-digit amount is cut to HK$2,000 with a note, and the visitor stays in the first run", async ({ page }) => {
    await page.goto("/?api=mock");
    await page.getByRole("button", { name: /^Next/ }).click();
    await page.getByRole("button", { name: /^Next/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Your first budget" })).toBeVisible();
    await page.getByRole("radio", { name: "Custom" }).click();
    await page.getByRole("textbox", { name: /^Amount/ }).fill("9007199254740993");
    await expect(page.locator("[data-amount-cut]")).toContainText("A budget can be HK$2,000 at most");
    await page.getByRole("button", { name: "Review budget" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Check and lock in" })).toBeVisible();
    await expect(page.locator(".seal-summary")).toContainText("HK$2,000");
    await page.getByRole("button", { name: /Lock in budget/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Your budget is locked in" })).toBeVisible();
  });

  test("Tab from the title goes through the step, then Skip, then Next", async ({ page }) => {
    await page.goto("/?api=mock");
    await expect(page.getByRole("heading", { level: 1, name: "Hi, I'm Wally." })).toBeFocused();
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      seen.push(await page.evaluate(() => (document.activeElement?.hasAttribute("data-skip") ? "skip" : document.activeElement?.hasAttribute("data-next") ? "next" : (document.activeElement?.getAttribute("role") ?? document.activeElement?.tagName ?? "").toLowerCase())));
      if (seen.at(-1) === "next") break;
    }
    expect(seen.at(-1)).toBe("next");
    expect(seen.indexOf("skip")).toBeGreaterThan(0);
    expect(seen.indexOf("skip")).toBeLessThan(seen.indexOf("next"));
  });
});
