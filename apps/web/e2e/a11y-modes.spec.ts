// axe-core on the screens that read differently in the two display modes (plain words, the default, and the developer
// view): Evidence (with "How we know" open in plain), Receipts, Proof verified and showing a changed copy, and About with
// its switch, in light and dark. Serious and critical findings fail the test; the rest are listed in the output.
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

async function settled(page: Page): Promise<void> {
  await expect(page.getByRole("note")).toBeVisible();
  await page.waitForFunction(() => !document.querySelector("[data-route-loading]"));
}

for (const scheme of ["light", "dark"] as const) {
  for (const mode of ["plain", "developer"] as const) {
    test.describe(`axe, ${mode} mode, ${scheme}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
        await page.addInitScript((m) => window.localStorage.setItem("wally:mode", m), mode);
      });

      test("Evidence", async ({ page }) => {
        await page.goto("/?api=mock#/evidence");
        await expect(page.locator('[data-screen="evidence"]')).toHaveAttribute("data-mode", mode);
        await settled(page);
        await scan(page, `evidence ${mode} ${scheme}`);
        if (mode === "plain") {
          await page.getByText("How we know").click();
          await expect(page.locator(".ev-harness")).toBeVisible();
          await scan(page, `evidence how we know ${scheme}`);
        }
      });

      test("Receipts, a receipt, and Proof verified and showing a changed copy", async ({ page }) => {
        await page.goto("/?api=mock#/budget");
        const card = page.locator('main [data-scenario="normal"]');
        await expect(card).toBeEnabled();
        await card.click();
        await expect(page).toHaveURL(/#\/wally/);
        await page.goto("/?api=mock#/receipts");
        await expect(page.locator('[data-screen="receipts"]')).toBeVisible();
        await settled(page);
        await scan(page, `receipts ${mode} ${scheme}`);
        await page.locator(".rc-row .w-row__hit").first().click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await scan(page, `receipt sheet ${mode} ${scheme}`);
        await page.keyboard.press("Escape");

        await page.goto("/?api=mock#/proof");
        await expect(page.locator('[data-screen="proof"]')).toBeVisible();
        await settled(page);
        if (mode === "developer") await page.locator(".pf-card .w-btn").click();
        await expect(page.locator('.pf-card[data-status="pass"]')).toBeVisible();
        await scan(page, `proof verified ${mode} ${scheme}`);
        await page.locator(".pf-actions .w-btn").click();
        await expect(page.locator('.pf-card[data-status="fail"]')).toBeVisible();
        await expect(page.getByRole("alert").filter({ hasText: "changed copy of the receipts" })).toBeVisible();
        await scan(page, `proof changed copy ${mode} ${scheme}`);
        await page.goto("/?api=mock#/receipts");
        await expect(page.getByRole("alert").filter({ hasText: "changed copy of the receipts" })).toBeVisible();
        await scan(page, `receipts changed copy ${mode} ${scheme}`);
      });

      test("Presenter: the evidence beats DM8 and DM9", async ({ page }) => {
        await page.goto("/#/presenter");
        await settled(page);
        const step = page.getByRole("button", { name: /^Step/ });
        for (let i = 0; i < 10; i += 1) {
          await expect(step).toBeEnabled();
          await step.click();
        }
        await expect(page.locator('[data-beat="DM8"]')).toBeVisible();
        await scan(page, `presenter DM8 ${mode} ${scheme}`);
        await step.click();
        await expect(page.locator('[data-beat="DM9"]')).toBeVisible();
        await scan(page, `presenter DM9 ${mode} ${scheme}`);
      });

      test("About with the technical-details switch", async ({ page }) => {
        await page.goto("/?api=mock#/budget");
        await settled(page);
        await page.getByRole("button", { name: /About and settings/ }).click();
        const sheet = page.getByRole("dialog");
        await expect(sheet.getByRole("switch", { name: "Show technical details" })).toHaveAttribute("aria-checked", String(mode === "developer"));
        await scan(page, `about ${mode} ${scheme}`);
      });
    });
  }
}
