// Plain words on a friend's phone (not the booth): the demo cards are just "Demo scenarios", About shows no Presenter or Style
// guide link, the SIMULATED chip explains itself on a tap, and Why trust Wally opens on a headline and a short list. The page is
// reached under a host that is not a loopback address (the server is rewritten behind it), because the booth Mac is the one place
// the long labels and the crew links belong.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const FRIEND = "http://wally.test";

async function blocking(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return result.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.impact} ${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
}

/** A page served under another host name: the requests go to the test server, the page sees `wally.test`. */
async function onFriendsHost(page: Page, baseURL: string): Promise<void> {
  // The "onboarded" flag the config seeds belongs to the test server's origin, not to this host name.
  await page.addInitScript(() => window.localStorage.setItem("wally:onboarded", "1"));
  await page.route(`${FRIEND}/**`, (route) => route.continue({ url: route.request().url().replace(FRIEND, baseURL.replace(/\/$/, "")) }));
}

test.use({ serviceWorkers: "block" });

test.beforeEach(({ isMobile }) => {
  test.skip(!isMobile, "checked on the phone project");
});

test("off the booth the cards are Demo scenarios, and About leaves the crew's links out", async ({ page, baseURL }) => {
  await onFriendsHost(page, baseURL ?? "");
  await page.goto(`${FRIEND}/?api=local#/budget`);
  const title = page.locator(".home-demo__title");
  await expect(title).toHaveText("Demo scenarios");
  await expect(page.getByText(/for judges/)).toHaveCount(0);
  await page.getByRole("button", { name: "About and settings" }).click();
  const about = page.getByRole("dialog", { name: "About Wally" });
  await expect(about.getByRole("link", { name: /Why trust Wally/ })).toBeVisible();
  await expect(about.getByRole("link", { name: "Presenter mode" })).toHaveCount(0);
  await expect(about.getByRole("link", { name: "Style guide" })).toHaveCount(0);
  // The footer says it in everyday words, and Developer mode brings the crew's links back with the rail line.
  await expect(about).toContainText("The shop and the card are a safe practice version. No real money moves.");
  await about.getByRole("switch", { name: /Show technical details/ }).click();
  await expect(about.getByRole("link", { name: "Presenter mode" })).toBeVisible();
  await expect(about.getByRole("link", { name: "Style guide" })).toBeVisible();
  await expect(about).toContainText("The rail is SIMULATED. No money moves.");
});

test("on the booth Mac the long label and the crew's links stay", async ({ page }) => {
  await page.goto("/?api=local#/budget");
  await expect(page.locator(".home-demo__title")).toHaveText("Demo scenarios (for judges)");
  await page.getByRole("button", { name: "About and settings" }).click();
  await expect(page.getByRole("dialog", { name: "About Wally" }).getByRole("link", { name: "Presenter mode" })).toBeVisible();
});

test("the SIMULATED chip is a 44 px button that explains itself and passes axe open", async ({ page }) => {
  await page.goto("/?api=mock#/budget");
  const chip = page.getByRole("button", { name: /SIMULATED: what does this mean\?/ });
  const box = await chip.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(43.5);
  expect(box!.height).toBeGreaterThanOrEqual(43.5);
  await chip.click();
  const tip = page.locator("[data-sim-tip]");
  await expect(tip).toHaveText("The shop and the card are a safe practice version. No real money moves.");
  const tipBox = await tip.boundingBox();
  const viewport = page.viewportSize()!;
  expect(tipBox!.x).toBeGreaterThanOrEqual(0);
  expect(tipBox!.x + tipBox!.width).toBeLessThanOrEqual(viewport.width);
  expect(await blocking(page)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(tip).toHaveCount(0);
});

test.describe("Why trust Wally opens on a headline and a short list", () => {
  for (const scheme of ["light", "dark"] as const) {
    test(`${scheme}: closed, then every fold open, with axe at 360`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: 360, height: 740 });
      await page.goto("/?api=mock#/evidence");
      const folds = page.locator("details.evp-fold");
      await expect(folds).toHaveCount(6);
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      expect(height, "the closed page is a couple of screens, not eight").toBeLessThan(2400);
      expect(await blocking(page), "closed").toEqual([]);
      for (const summary of await page.locator("details.evp-fold > summary").all()) {
        const box = await summary.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(43.5);
        await summary.click();
      }
      await expect(page.locator("details.evp-fold[open]")).toHaveCount(6);
      await page.waitForTimeout(300);
      expect(await blocking(page), "open").toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    });
  }
});
