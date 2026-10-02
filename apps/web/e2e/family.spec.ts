// Family budget in a real browser on the on-device stack (?api=local): the "Whose money?" choice, Mum's ceiling as a calm
// card, the capped amount, a budget sealed under Mum's with its tag, the refusal when a budget asks for too much (nothing
// sealed, the budget held stays), and the purchase from the family budget. A budget of my own is unchanged.
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page, isMobile }) => {
  if (isMobile) await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?api=local#/seal?mode=topup");
  await expect(page.getByRole("heading", { level: 1, name: "Top up your budget" })).toBeVisible();
});

const meter = (page: import("@playwright/test").Page) => page.getByRole("meter");
const tags = (page: import("@playwright/test").Page) => page.getByRole("list", { name: "Rules Wally must follow" });

test("Mum's budget: the ceiling, the cap, the sealed budget with its tag, the refusal and the purchase", async ({ page }) => {
  const choice = page.getByRole("radiogroup", { name: "Whose money?" });
  await expect(choice.getByRole("radio", { name: "My own budget" })).toBeChecked();
  await choice.getByRole("radio", { name: "Mum's budget" }).click();
  await expect(page.locator("[data-family-card]")).toContainText(/Mum allows up to HK\$1,000 for clothes until \d{1,2} \w{3}/);

  const amount = page.getByRole("textbox", { name: /^Amount/ });
  await amount.fill("1500");
  await expect(page.getByText("That's more than Mum allows (HK$1,000)")).toBeVisible();
  await page.getByRole("button", { name: /^Next/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Top up your budget" })).toBeVisible();

  await amount.fill("800");
  await page.getByRole("button", { name: /^Next/ }).click();
  await page.getByRole("button", { name: /Seal budget/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your budget is sealed" })).toBeVisible();
  await page.getByRole("link", { name: /Go to your budget/ }).click();
  await expect(tags(page)).toContainText("From Mum's budget");
  await expect(meter(page)).toHaveAttribute("aria-valuetext", "HK$800 left of HK$800, SIMULATED");

  await page.locator('main [data-scenario="family_over"]').click();
  await expect(page.getByText(/That's more than Mum allows \(HK\$1,000\)\. Nothing was sealed/)).toBeVisible();
  await expect(page).toHaveURL(/#\/budget$/);
  await expect(meter(page)).toHaveAttribute("aria-valuetext", "HK$800 left of HK$800, SIMULATED");
  await expect(tags(page)).toContainText("From Mum's budget");

  await page.locator('main [data-scenario="family_ok"]').click();
  await expect(page).toHaveURL(/#\/wally$/);
  await expect(page.getByText("Paid with a one-off card")).toBeVisible();
  await page.getByRole("link", { name: "Budget", exact: true }).click();
  await expect(meter(page)).toHaveAttribute("aria-valuetext", "HK$541 left of HK$800, SIMULATED");
  await expect(tags(page)).toContainText("From Mum's budget");
});

test("my own budget is unchanged: no cap, no tag", async ({ page }) => {
  const amount = page.getByRole("textbox", { name: /^Amount/ });
  await amount.fill("1500");
  await expect(page.getByText(/more than Mum allows/)).toHaveCount(0);
  await page.getByRole("button", { name: /^Next/ }).click();
  await page.getByRole("button", { name: /Seal budget/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your budget is sealed" })).toBeVisible();
  await page.getByRole("link", { name: /Go to your budget/ }).click();
  await expect(meter(page)).toHaveAttribute("aria-valuetext", "HK$1,500 left of HK$1,500, SIMULATED");
  await expect(tags(page)).not.toContainText("From Mum's budget");
});
