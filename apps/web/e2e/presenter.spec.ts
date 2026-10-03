// Presenter (#/presenter) on the big screens it is made for (1366x768, 1920x1080) and on a phone: steps DM1 to DM9 with
// the keyboard, shows the stops and the proof beat, never scrolls sideways, keeps the bar's controls at 44 px.
// Screenshots go to the test output folder for a human look, never into the repo.
import { expect, test, type Page } from "@playwright/test";

const SIZES = [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
] as const;

async function noSidewaysScroll(page: Page): Promise<void> {
  const w = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(w.scroll).toBeLessThanOrEqual(w.client);
}

async function smallBarControls(page: Page): Promise<string[]> {
  return page.locator("nav.pr-bar").evaluate((bar) =>
    [...bar.querySelectorAll<HTMLElement>("button")]
      .map((b) => ({ b, r: b.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && (r.width < 43.5 || r.height < 43.5))
      .map(({ b, r }) => `${(b.textContent ?? "").trim().slice(0, 16)} ${Math.round(r.width)}x${Math.round(r.height)}`),
  );
}

for (const size of SIZES) {
  test(`presenter at ${size.width}x${size.height}: keyboard walk, stops, proof, evidence`, async ({ page, isMobile }, info) => {
    test.skip(isMobile, "big-screen sizes run in the desktop project");
    await page.addInitScript(() => window.localStorage.setItem("wally:mode", "developer")); // the technical beats: codes, hashes and B0/B2 numbers
    await page.setViewportSize(size);
    await page.goto("/#/presenter");
    await expect(page.locator(".pr-rail")).toContainText("SIMULATED rail. No money moves.");
    await expect(page.locator(".pr-bar__moment")).toHaveText("DM1");
    expect(await smallBarControls(page)).toEqual([]);
    const step = page.getByRole("button", { name: /^Step/ });
    const press = async (): Promise<void> => {
      await expect(step).toBeEnabled();
      await page.locator(".pr-top").click();
      await page.keyboard.press("Space");
    };
    await press();
    await expect(page.getByRole("region", { name: "Budget sealed" })).toBeVisible();
    for (let i = 0; i < 4; i += 1) await press();
    await expect(page.locator('[role="alert"][data-template="R9.flagged"]')).toBeVisible();
    await page.screenshot({ path: info.outputPath(`dm3-${size.width}.png`) });
    await press();
    await expect(page.locator('[role="alert"][data-template="R3.over_remaining"]')).toContainText("HK$550");
    await noSidewaysScroll(page);
    for (let i = 0; i < 3; i += 1) await press();
    await expect(page.locator(".pr-bar__moment")).toHaveText("DM8");
    await page.getByRole("button", { name: "Try to tamper" }).click();
    await expect(page.locator('.pf-card[data-status="fail"]')).toContainText("Broken at receipt");
    await page.screenshot({ path: info.outputPath(`dm7-${size.width}.png`) });
    await page.getByRole("button", { name: "Restore", exact: true }).click();
    await expect(page.locator('.pf-card[data-status="pass"]')).toContainText("Receipts verified.");
    await press();
    await expect(page.locator('[data-beat="DM8"] [data-big]')).toHaveCount(3);
    await press();
    await expect(page.locator('[data-beat="DM9"] [data-dm9]')).toHaveCount(3);
    await page.screenshot({ path: info.outputPath(`dm9-${size.width}.png`) });
    await page.keyboard.press("r");
    await expect(page.locator(".pr-bar__moment")).toHaveText("DM1");
  });
}

test("presenter on a phone: one column, no sideways scroll, both languages on request", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/#/presenter");
  await page.getByRole("radio", { name: /Both/ }).click();
  await page.getByRole("button", { name: /^Step/ }).click();
  await expect(page.locator('section[data-view="seal"] [lang="zh-HK"]').first()).toBeVisible();
  await noSidewaysScroll(page);
});
