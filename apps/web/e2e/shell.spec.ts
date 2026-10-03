// Shell flows in a real browser (lane b-shell), on a 390 x 844 phone and on the desktop project: land on Budget, run
// a purchase from Try asking and see it in Recent and the budget card, About (language and theme), the Seal flow from
// the first screen, and Cancel this budget (hold, dialog, cancelled).
import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page, isMobile }) => {
  if (isMobile) await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?api=mock#/budget");
  await expect(page.getByRole("meter")).toBeVisible();
});

async function holdCancel(page: Page): Promise<void> {
  const button = page.getByRole("button", { name: "Hold to cancel this budget" });
  await button.scrollIntoViewIfNeeded();
  await button.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const box = await button.boundingBox();
  if (!box) throw new Error("no hold button");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1500);
  await page.mouse.up();
}

test("lands on Budget with the budget card, the tabs and the SIMULATED note", async ({ page }) => {
  await expect(page.getByRole("meter")).toHaveAttribute("aria-valuetext", "HK$800 left of HK$800, SIMULATED");
  await expect(page.getByRole("heading", { level: 1, name: "Your budget" })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Budget", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("button", { name: "Ask", exact: true })).toBeVisible();
  await expect(page.getByRole("note")).toContainText("SIMULATED");
});

test("runs Normal purchase from Try asking and shows it in Recent and on the budget card", async ({ page }) => {
  await page.locator('main [data-scenario="normal"]').click();
  await expect(page).toHaveURL(/#\/wally$/);
  await expect(page.locator('[data-screen="wally"] [data-kind="exact"]')).toContainText("Charged the exact HK$259.");
  await page.getByRole("link", { name: "Budget", exact: true }).click();
  await expect(page.getByRole("meter")).toHaveAttribute("aria-valuetext", "HK$541 left of HK$800, SIMULATED");
  const first = page.getByRole("list", { name: "Recent" }).getByRole("link").first();
  await expect(first).toContainText("Paid · Receipt 2");
  await expect(first).toContainText("HK$259");
  await first.click();
  await expect(page).toHaveURL(/#\/wally\?d=dec_/);
});

test("About switches the language to 繁 and the theme to dark, and remembers both", async ({ page }) => {
  await page.getByRole("button", { name: "About and settings" }).click();
  const sheet = page.getByRole("dialog", { name: "About Wally" });
  await expect(sheet.getByText("Offline demo in this browser")).toBeVisible();
  await sheet.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await sheet.getByRole("radio", { name: "繁體中文" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-HK");
  await expect(page.getByRole("dialog", { name: "關於 Wally" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("預算剩餘")).toBeVisible();
  await page.reload();
  await expect(page.getByText("預算剩餘")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("seals a budget through the whole flow: Meet Wally, Describe, Check and lock in, Sealed", async ({ page }) => {
  await page.goto("/?api=mock#/seal?mode=welcome");
  await expect(page.getByRole("heading", { name: "Meet Wally" })).toBeVisible();
  await page.getByRole("button", { name: /^Start/ }).click();
  await page.getByRole("button", { name: "Shoes for two weeks" }).click();
  await page.getByRole("textbox", { name: /^Amount/ }).fill("");
  await page.getByRole("button", { name: /^Next/ }).click();
  await expect(page.getByText("Enter an amount above zero.")).toBeVisible();
  await page.getByRole("textbox", { name: /^Amount/ }).fill("650");
  await page.getByRole("button", { name: /^Next/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Check and lock in" })).toBeVisible();
  await page.getByRole("button", { name: /Lock in budget/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your budget is locked in" })).toBeVisible();
  await page.getByRole("link", { name: /Go to your budget/ }).click();
  await expect(page.getByRole("meter")).toHaveAttribute("aria-valuetext", "HK$650 left of HK$650, SIMULATED");
  await expect(page.getByRole("region", { name: "Your budget" })).toContainText("Shoes only");
});

test("cancels the budget: hold, confirm, the card stops working and a new budget is offered", async ({ page }) => {
  await page.locator('main [data-scenario="revoke"]').click();
  await expect(page.locator('.oc[data-card-state="ACTIVE"]')).toBeVisible();
  await holdCancel(page);
  const dialog = page.getByRole("alertdialog", { name: "Cancel this budget?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel budget" }).click();
  await expect(page.getByText("This budget is cancelled")).toBeVisible();
  await expect(page.locator('[data-card-state="VOIDED"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Hold to cancel this budget" })).toHaveCount(0);
  await page.getByRole("link", { name: "Start a new budget" }).first().click();
  await expect(page).toHaveURL(/#\/seal$/);
  await expect(page.getByRole("heading", { level: 1, name: "Describe your budget" })).toBeVisible();
});

test("lifting the finger after a touch hold does not answer the dialog it opened", async ({ page, isMobile }) => {
  test.skip(!isMobile, "real touch events are sent on the phone project");
  await page.locator('main [data-scenario="revoke"]').click();
  await expect(page.locator('.oc[data-card-state="ACTIVE"]')).toBeVisible();
  // The Cancel the budget card scrolls to Manage this budget, smoothly: measure the button once the page has stopped moving.
  await expect(page.locator("#budget-console")).toBeFocused();
  await page.waitForFunction(() => {
    const w = window as unknown as { __y?: number; __still?: number };
    w.__still = w.__y === window.scrollY ? (w.__still ?? 0) + 1 : 0;
    w.__y = window.scrollY;
    return w.__still >= 8;
  });
  const button = page.getByRole("button", { name: "Hold to cancel this budget" });
  await button.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const box = await button.boundingBox();
  if (!box) throw new Error("no hold button");
  // What the page is sent after the finger goes up, in order, and whether the click landed in the dialog's overlay.
  await page.evaluate(() => {
    const seen = ((window as unknown as { __seen: string[] }).__seen = []);
    for (const type of ["pointerup", "click"]) {
      window.addEventListener(type, (e) => seen.push(`${type}:${(e.target as Element).closest(".w-overlay") ? "overlay" : "page"}`), true);
    }
  });
  const cdp = await page.context().newCDPSession(page);
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...at, id: 1 }] });
  const dialog = page.getByRole("alertdialog", { name: "Cancel this budget?" });
  await expect(dialog).toBeVisible(); // the hold completed under the finger
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(800); // the touch screen's click, and then some
  const seen = await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen);
  expect(seen).toContain("click:overlay"); // the release did send a click into the dialog's overlay, which must not count
  await expect(dialog).toBeVisible();
  await expect(page.getByText("This budget is cancelled")).toHaveCount(0);
  // The next tap is the person's own and answers it.
  await dialog.getByRole("button", { name: "Keep it" }).tap();
  await expect(dialog).toHaveCount(0);
});

test("the Ask sheet opens on every tab and closes with Escape", async ({ page }) => {
  for (const tab of ["Budget", "Wally", "Receipts", "Proof"]) {
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: tab }).click();
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: /What should Wally try/ });
    await expect(sheet).toBeVisible();
    // Focus moves into the sheet in the effect that also arms Escape; pressing before that, on a loaded machine, misses the sheet.
    await expect(sheet.getByRole("button", { name: "Close" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
});
