// "See cheaper options" after the Demo button "Shipping tips it over", on the on-device page (recorded planner and judge,
// no network): the shipping stop is followed by the recorded cheaper pick, the ankle socks for HK$120, checked by the same
// rules and paid with a one-off card. The demo script (docs/06) promises exactly this; it used to answer "nothing fits".
import { expect, test, type Page } from "@playwright/test";

/** Try asking lives on Budget; a press moves to Wally, where the result shows. */
async function press(page: Page, scenario: string): Promise<void> {
  if ((await page.locator(`main [data-scenario="${scenario}"]:visible`).count()) === 0) await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Budget", exact: true }).click();
  await page.locator(`main [data-scenario="${scenario}"]`).click();
  await expect(page).toHaveURL(/#\/wally/);
}

const wally = (page: Page) => page.locator('[data-screen="wally"]');

for (const start of ["a fresh budget", "after the tee (HK$541 left)"] as const) {
  test(`Shipping tips it over, then See cheaper options buys the ankle socks: ${start}`, async ({ page }) => {
    await page.goto("/?api=local#/budget");
    await expect(page.getByRole("meter")).toBeVisible();
    if (start !== "a fresh budget") {
      await press(page, "normal");
      await expect(wally(page).locator('[data-kind="exact"]')).toContainText("Charged the exact HK$259.");
    }
    await press(page, "overflow");
    const stopped = wally(page).getByRole("alert").filter({ hasText: "Stopped before paying" });
    await expect(stopped).toBeVisible();

    await wally(page).getByRole("button", { name: "See cheaper options" }).click();
    await expect(wally(page).getByRole("article", { name: "One-off card" })).toContainText("HK$120");
    await expect(wally(page)).not.toContainText("No cheaper option fits");
    await expect(page.locator("[data-route-loading]")).toHaveCount(0);

    await page.getByRole("link", { name: "Budget", exact: true }).click();
    const left = start === "a fresh budget" ? /HK\$680 left of HK\$800/ : /HK\$421 left of HK\$800/;
    await expect(page.getByRole("meter")).toHaveAttribute("aria-valuetext", left);
  });
}
