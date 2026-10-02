// The browser bar follows the in-app theme: choosing Dark in About on a light phone changes the theme-color tags to the
// dark page background, and Auto puts the OS-driven ones back.
import { expect, test, type Page } from "@playwright/test";

const colours = (page: Page): Promise<string[]> =>
  page.evaluate(() => [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map((m) => m.content.toLowerCase()));

test.use({ colorScheme: "light" });

test("Dark in About writes the dark page colour into theme-color, Auto restores the originals", async ({ page }) => {
  await page.goto("/?api=mock#/budget");
  await expect(page.getByRole("meter")).toBeVisible();
  const original = await colours(page);
  expect(original).toEqual(["#f4f7fe", "#0b1220"]);
  await page.getByRole("button", { name: "About and settings" }).click();
  const sheet = page.getByRole("dialog", { name: "About Wally" });
  await sheet.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await colours(page)).toEqual(["#0b1220", "#0b1220"]);
  await sheet.getByRole("radio", { name: "Light" }).click();
  expect(await colours(page)).toEqual(["#f4f7fe", "#f4f7fe"]);
  await sheet.getByRole("radio", { name: "Auto" }).click();
  expect(await colours(page)).toEqual(original);
});
