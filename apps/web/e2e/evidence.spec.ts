// Evidence screen in a real browser (production build, offline): renders from the bundled result files, keeps every
// control at 44 px, never scrolls sideways at 360 px, and the presenter's DM8 and DM9 beats render. Screenshots go to
// the test output folder for a human look, never into the repo.
import { expect, test } from "@playwright/test";

const TARGETS = "button, a[href], select, input, textarea, summary";

test("the evidence screen renders offline with the run picker and charts", async ({ page }, info) => {
  await page.goto("/#/evidence");
  await expect(page.getByRole("heading", { name: /^Evidence/ })).toBeVisible();
  await expect(page.locator("[data-pick-reason]")).toContainText("Showing harness-");
  await expect(page.locator("figure.ev-chart").first()).toBeVisible();
  await page.screenshot({ path: info.outputPath("evidence.png"), fullPage: true });
  const judge = page.locator("[data-judge-panel]");
  await expect(judge.locator("[data-judge-verdict]")).toContainText("target [F38] is");
  await judge.screenshot({ path: info.outputPath("judge-panel.png") });
});

test("no control on the evidence screen is under 44 px", async ({ page }) => {
  await page.goto("/#/evidence");
  await page.locator("details").evaluateAll((all) => all.forEach((d) => ((d as HTMLDetailsElement).open = true)));
  const small = await page.evaluate((selector) => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      if (el.classList.contains("sr-only")) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.height < 43.5) out.push(`${el.tagName} "${(el.textContent ?? "").trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out;
  }, TARGETS);
  expect(small).toEqual([]);
});

test("the evidence screen does not scroll sideways at 360 px, with every panel open", async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/#/evidence");
  await page.locator("details").evaluateAll((all) => all.forEach((d) => ((d as HTMLDetailsElement).open = true)));
  const width = await page.evaluate(() => {
    const client = document.documentElement.clientWidth;
    const wide = [...document.querySelectorAll<HTMLElement>("main *")]
      .filter((el) => el.getBoundingClientRect().right > client + 1)
      .filter((el) => !el.parentElement || el.parentElement.getBoundingClientRect().right <= client + 1)
      .slice(0, 5)
      .map((el) => `${el.tagName}.${el.className} "${(el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(el.getBoundingClientRect().right)}`);
    return { scroll: document.documentElement.scrollWidth, client, wide };
  });
  expect(width.scroll, width.wide.join(" | ")).toBeLessThanOrEqual(width.client);
  await page.screenshot({ path: info.outputPath("evidence-360.png"), fullPage: true });
});

test("the presenter steps to DM8 and DM9", async ({ page }, info) => {
  await page.goto("/#/presenter");
  const step = page.getByRole("button", { name: /^Step/ });
  for (let i = 0; i < 10; i += 1) {
    await expect(step).toBeEnabled();
    await step.click();
  }
  await expect(page.locator('[data-beat="DM8"] [data-big]')).toHaveCount(3);
  await page.screenshot({ path: info.outputPath("dm8.png"), fullPage: false });
  await step.click();
  await expect(page.locator('[data-beat="DM9"] [data-dm9]')).toHaveCount(3);
  await page.screenshot({ path: info.outputPath("dm9.png"), fullPage: false });
});
