// Wally screen smoke test (lane b-run) on the offline mock client, phone and desktop projects. Scenarios start from the
// shell's Try asking cards ([data-scenario], in the Ask sheet or on the Budget home). The app shell from lane b-shell
// routes #/wally; on a build without it, each test skips and says why.
import { expect, test, type Locator, type Page } from "@playwright/test";

const SHELL = "needs the app shell from lane b-shell: #/wally and the Try asking cards";

async function wallyScreen(page: Page): Promise<Locator | null> {
  await page.goto("/?api=mock#/wally");
  const screen = page.locator('[data-screen="wally"]');
  return (await screen.waitFor({ timeout: 5_000 }).then(() => true, () => false)) ? screen : null;
}

/** Presses the Try asking card for a scenario, opening the Ask sheet first when the card lives there. */
async function tryAsking(page: Page, scenario: string): Promise<boolean> {
  const card = page.locator(`[data-scenario="${scenario}"]`).first();
  if (!(await card.isVisible())) await page.getByRole("button", { name: /^(Ask|問 Wally)$/ }).first().click({ timeout: 2_000 }).catch(() => undefined);
  if (!(await card.isVisible())) {
    await page.goto("/?api=mock#/budget");
    await card.waitFor({ timeout: 3_000 }).catch(() => undefined);
  }
  if (!(await card.isVisible())) return false;
  await card.click();
  if (!page.url().includes("#/wally")) await page.goto("/?api=mock#/wally");
  return true;
}

test.beforeEach(async ({ page }) => {
  test.skip((await wallyScreen(page)) === null, SHELL);
});

test("idle: Wally is ready and offers to help", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Ask Wally" }).first()).toBeVisible();
});

test("normal purchase: a one-off card for the exact amount, no rule ids on screen", async ({ page }) => {
  test.skip(!(await tryAsking(page, "normal")), SHELL);
  const card = page.getByRole("article", { name: "One-off card" });
  await expect(card).toContainText("Works once, for HK$259 only");
  await expect(card).toContainText("SIMULATED");
  await expect(page.locator('[data-screen="wally"]')).not.toContainText(/\bR\d{1,2}\b/);
});

test("flagged seller: stopped before paying, plain reason, then the Why sheet and its details", async ({ page }) => {
  test.skip(!(await tryAsking(page, "flagged")), SHELL);
  const alert = page.getByRole("alert").filter({ hasText: "Stopped before paying" });
  await expect(alert).toContainText("This seller is flagged as a possible scam.");
  await expect(page.getByText("No card was made. Nothing can be charged.")).toBeVisible();
  await page.getByRole("button", { name: "Why?" }).click();
  const sheet = page.getByRole("dialog", { name: "Why Wally stopped" });
  await expect(sheet).toContainText("Seller");
  await sheet.getByText("Details for nerds").click();
  await expect(sheet).toContainText("Stopped by R9.");
});

test("needs your OK: Approve continues to the one-off card", async ({ page }) => {
  test.skip(!(await tryAsking(page, "unverified")), SHELL);
  await expect(page.getByRole("heading", { name: "Needs your OK" })).toBeVisible();
  await expect(page.getByRole("timer")).toContainText("s left");
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("You said yes, so Wally went ahead.")).toBeVisible();
});

test("no horizontal scroll at 320 px on a result", async ({ page }) => {
  test.skip(!(await tryAsking(page, "overflow")), SHELL);
  await page.setViewportSize({ width: 320, height: 640 });
  await expect(page.getByRole("alert").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
