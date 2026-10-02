// axe-core on every screen lane B owns (Wally in each state, its sheets, Receipts, Proof, Evidence, the Ask sheet), in
// light and dark. Serious and critical findings fail the test; moderate ones are listed in the output for the lead.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];
const BLOCKING = new Set(["serious", "critical"]);

async function scan(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const describe = (v: (typeof results.violations)[number]): string => `${label} | ${v.impact} | ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" ; ")}`;
  const blocking = results.violations.filter((v) => BLOCKING.has(v.impact ?? ""));
  const quiet = results.violations.filter((v) => !BLOCKING.has(v.impact ?? ""));
  if (quiet.length > 0) console.log(`axe moderate or minor (${label}):\n${quiet.map(describe).join("\n")}`);
  expect(blocking.map(describe), `${label}: serious or critical axe findings`).toEqual([]);
}

/** Presses the Try asking card for a scenario on Budget; the result shows on Wally. */
async function tryAsking(page: Page, scenario: string): Promise<void> {
  await page.goto("/?api=mock#/budget");
  const card = page.locator(`main [data-scenario="${scenario}"]`);
  await expect(card).toBeEnabled();
  await card.click();
  await expect(page).toHaveURL(/#\/wally/);
  await expect(page.locator('[data-screen="wally"]')).toBeVisible();
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`axe, ${scheme}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    });

    test("Wally: idle, stopped (with the Why sheet), the one-off card, Needs your OK (the consent sheet)", async ({ page }) => {
      await page.goto("/?api=mock#/wally");
      await expect(page.locator('[data-screen="wally"]')).toBeVisible();
      await scan(page, `wally idle ${scheme}`);

      await tryAsking(page, "overflow");
      await expect(page.getByRole("alert").filter({ hasText: "Stopped before paying" })).toBeVisible();
      await scan(page, `wally stopped ${scheme}`);
      await page.getByRole("button", { name: "Why?" }).click();
      await expect(page.getByRole("dialog", { name: "Why Wally stopped" })).toBeVisible();
      await scan(page, `why sheet ${scheme}`);
      await page.keyboard.press("Escape");

      // "normal" pays at once, so the card shows its PAID stamp; the ready card is the presenter-only mint step.
      await tryAsking(page, "normal");
      await expect(page.getByRole("article", { name: "One-off card" })).toBeVisible();
      await scan(page, `wally one-off card ${scheme}`);

      await tryAsking(page, "unverified");
      await expect(page.getByRole("dialog", { name: "Needs your OK" })).toBeVisible();
      await scan(page, `needs your OK sheet ${scheme}`);
    });

    test("Receipts (list and a receipt), Proof (ready, verified, broken), Evidence", async ({ page }) => {
      await tryAsking(page, "normal");
      await page.goto("/?api=mock#/receipts");
      await expect(page.locator('[data-screen="receipts"]')).toBeVisible();
      await scan(page, `receipts ${scheme}`);
      await page.locator(".rc-row .w-row__hit").first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await scan(page, `receipt sheet ${scheme}`);
      await page.keyboard.press("Escape");

      await page.goto("/?api=mock#/proof");
      await expect(page.locator('[data-screen="proof"]')).toBeVisible();
      await scan(page, `proof ready ${scheme}`);
      await page.locator(".pf-card .w-btn").click();
      await expect(page.locator('.pf-card[data-status="pass"]')).toBeVisible();
      await scan(page, `proof verified ${scheme}`);
      await page.locator(".pf-actions .w-btn").click();
      await expect(page.locator('.pf-card[data-status="fail"]')).toBeVisible();
      await scan(page, `proof broken ${scheme}`);

      await page.goto("/?api=mock#/evidence");
      await expect(page.locator('[data-screen="evidence"]')).toBeVisible();
      await scan(page, `evidence ${scheme}`);
    });

    test("the Ask sheet", async ({ page }) => {
      await page.goto("/?api=mock#/budget");
      await page.getByRole("button", { name: "Ask", exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await scan(page, `ask sheet ${scheme}`);
    });
  });
}
