// Keeping the on-device session across a reload, in a real browser on a phone (the build runs on-device, VITE_API=local).
// The tester's story: skip the first run, seal HK$300, buy socks, reload (a phone does this all the time), and everything
// is still there: the budget, the used card, the receipts, with no second "Budget sealed". Then Start the demo over
// forgets it, for good. A damaged stored session starts a new page with one calm line, once. axe finds nothing serious on
// the new line, in light and dark. Runs on the phone project only (the widths are set inside the tests).
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const KEY = "wally:session:v1";
const REMEMBERS = "This demo remembers your session on this phone until you start it over.";
const ENDED = "Your last demo session ended, so Wally started a new one";
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

// A visitor who has never been here: the first run shows (the config switches it off for every other spec).
test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 } });

test.beforeEach(() => {
  test.skip(test.info().project.name !== "phone", "the widths are set inside the tests");
});

const meter = (page: Page) => page.getByRole("meter");
const stored = (page: Page) => page.evaluate((key) => window.localStorage.getItem(key), KEY);
const about = (page: Page) => page.getByRole("dialog", { name: "About Wally" });

async function blocking(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return result.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.impact} ${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
}

async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => !document.querySelector("[data-route-loading]"));
  await page.waitForTimeout(500);
}

async function skipFirstRun(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Hi, I'm Wally." })).toBeVisible();
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await page.getByRole("button", { name: "Skip tour" }).click();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
}

async function seal300(page: Page): Promise<void> {
  await page.goto("/#/seal?mode=topup");
  await expect(page.getByRole("heading", { level: 1, name: "Top up your budget" })).toBeVisible();
  await page.getByRole("textbox", { name: /^Amount/ }).fill("300");
  await page.getByRole("button", { name: /^Next/ }).click();
  await page.getByRole("button", { name: /Seal budget/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your budget is sealed" })).toBeVisible();
  await page.getByRole("link", { name: /Go to your budget/ }).click();
  await expect(meter(page)).toHaveAttribute("aria-valuetext", "HK$300 left of HK$300, SIMULATED");
}

test("HK$300 sealed, socks bought, reload: the budget, the used card and the receipts are all still there", async ({ page }) => {
  await skipFirstRun(page);
  await seal300(page);
  await page.locator('main [data-idea="socks"]').click();
  await expect(page).toHaveURL(/#\/wally$/);
  await expect(page.locator('[data-screen="wally"] [data-kind="exact"]')).toContainText("Charged the exact HK$120.");

  // Straight away, without waiting for the short pause before a save: the page going away writes the session.
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await expect(page.locator('[data-api-mode="local"]')).toContainText("On-device mode");
  await expect(page.locator('[data-api-mode="local"]')).not.toContainText("session ended");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Budget", exact: true }).click();
  await expect(meter(page)).toHaveAttribute("aria-valuetext", "HK$180 left of HK$300, SIMULATED");
  await expect(page.locator('[data-card-state="USED"]')).toHaveCount(1);

  await page.goto("/#/receipts");
  await expect(page.getByText("Paid at Demo Apparel")).toHaveCount(1);
  await expect(page.getByText("Budget sealed")).toHaveCount(1); // not a second one
  expect(await stored(page)).not.toBeNull();

  // A second reload, and the next purchase goes on from there: one more card, the budget down again.
  await page.reload();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Budget", exact: true }).click();
  await expect(meter(page)).toHaveAttribute("aria-valuetext", "HK$180 left of HK$300, SIMULATED");
  await page.locator('main [data-scenario="small"]').click(); // the booth card buys the socks again on purpose
  await expect(page).toHaveURL(/#\/wally$/);
  await expect(page.locator('[data-screen="wally"] [data-kind="exact"]')).toContainText("Charged the exact HK$120.");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Budget", exact: true }).click();
  await expect(meter(page)).toHaveAttribute("aria-valuetext", "HK$60 left of HK$300, SIMULATED");
});

test("Start the demo over forgets the session: nothing is stored, and a reload shows a fresh HK$800 budget with no cards", async ({ page }) => {
  await skipFirstRun(page);
  await seal300(page);
  await page.locator('main [data-idea="socks"]').click();
  await expect(page.locator('[data-screen="wally"] [data-kind="exact"]')).toContainText("Charged the exact HK$120.");
  await page.reload();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Budget", exact: true }).click();
  await expect(meter(page)).toHaveAttribute("aria-valuetext", "HK$180 left of HK$300, SIMULATED");
  expect(await stored(page)).not.toBeNull();

  await page.getByRole("button", { name: "About and settings" }).click();
  await expect(about(page)).toContainText(REMEMBERS);
  await about(page).getByRole("button", { name: /Start the demo over/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Start over" }).click();
  await expect(page.getByText("Started over with a fresh budget.")).toBeVisible();
  await expect(meter(page)).toHaveAttribute("aria-valuetext", "HK$800 left of HK$800, SIMULATED");
  await expect(page.locator("[data-card-state]")).toHaveCount(0);
  expect(await stored(page)).toBeNull();

  await page.reload();
  await expect(meter(page)).toHaveAttribute("aria-valuetext", "HK$800 left of HK$800, SIMULATED");
  await expect(page.locator("[data-card-state]")).toHaveCount(0);
  await expect(page.locator('[data-api-mode="local"]')).not.toContainText("session ended");
});

test("a damaged stored session starts a new page and says so once, calmly; the next load is quiet", async ({ page }) => {
  await page.addInitScript((key) => {
    if (window.sessionStorage.getItem("seeded") !== null) return;
    window.sessionStorage.setItem("seeded", "1");
    window.localStorage.setItem("wally:onboarded", "1");
    window.localStorage.setItem(key, '{"v":1,"savedAt":"2026-10-03T02:00:00.000Z","log":"not a log\\n"}');
  }, KEY);
  await page.goto("/#/budget");
  const note = page.locator('[data-api-mode="local"]');
  await expect(note).toContainText(ENDED);
  await expect(meter(page)).toHaveAttribute("aria-valuetext", "HK$800 left of HK$800, SIMULATED");
  expect(await stored(page)).toBeNull();
  await page.reload();
  await expect(meter(page)).toBeVisible();
  await expect(note).not.toContainText(ENDED);
});

for (const scheme of ["light", "dark"] as const) {
  test.describe(`axe, ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test("the About line and the session-ended note have nothing serious", async ({ page }) => {
      await page.addInitScript((key) => {
        if (window.sessionStorage.getItem("seeded") !== null) return;
        window.sessionStorage.setItem("seeded", "1");
        window.localStorage.setItem("wally:onboarded", "1");
        window.localStorage.setItem(key, "{broken");
      }, KEY);
      await page.goto("/#/budget");
      await expect(page.locator('[data-api-mode="local"]')).toContainText(ENDED);
      await expect(meter(page)).toBeVisible();
      await settled(page);
      expect(await blocking(page), "budget with the session-ended note").toEqual([]);
      await page.getByRole("button", { name: "About and settings" }).click();
      await expect(about(page)).toContainText(REMEMBERS);
      await settled(page);
      expect(await blocking(page), "about sheet with the remembers line").toEqual([]);
    });
  });
}
