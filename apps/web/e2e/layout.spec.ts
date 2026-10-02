// Layout and accessibility checks in a real browser: 44 px targets, no horizontal scroll at 320 and 360 px, every route
// renders with the SIMULATED note, the stop is above the fold on a phone, and reduced motion zeroes the durations.
import { expect, test, type Page } from "@playwright/test";

const TARGETS = "button, a[href], select, input, textarea, summary, [role=tab], [role=radio], [role=switch]";

async function undersized(page: Page, scope = "body"): Promise<string[]> {
  return page.evaluate(({ selector, scope }) => {
    const out: string[] = [];
    for (const el of document.querySelector(scope)?.querySelectorAll<HTMLElement>(selector) ?? []) {
      if (el.classList.contains("sr-only")) continue;
      const box = el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio") ? (el.closest("label") ?? el) : el;
      const r = box.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.width < 43.5 || r.height < 43.5) out.push(`${el.tagName} "${(el.textContent ?? "").trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out;
  }, { selector: TARGETS, scope });
}

async function sideways(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test("every control is at least 44 px on Budget, in the Ask sheet, on Wally and on Proof (docs/04 Accessibility)", async ({ page }) => {
  await page.goto("/?api=mock#/budget");
  await expect(page.getByRole("meter")).toBeVisible();
  expect(await undersized(page)).toEqual([]);
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await undersized(page, ".w-sheet")).toEqual([]);
  await page.locator('.w-sheet [data-scenario="unverified"]').click();
  await expect(page.getByRole("alert").filter({ hasText: "ESCALATED R9" })).toBeVisible();
  await page.getByRole("link", { name: "Budget", exact: true }).click();
  await expect(page.getByRole("region", { name: "Wally needs your OK" })).toBeVisible();
  expect(await undersized(page)).toEqual([]);
});

test("every control is at least 44 px on the Seal screen", async ({ page }) => {
  await page.goto("/?api=mock#/seal?mode=welcome");
  await page.getByRole("button", { name: /^Start/ }).click();
  await expect(page.getByRole("textbox", { name: /Your budget in a sentence/ })).toBeVisible();
  expect(await undersized(page)).toEqual([]);
});

test("the screens do not scroll sideways at 320 and 360 px", async ({ page }) => {
  for (const width of [320, 360]) {
    await page.setViewportSize({ width, height: 740 });
    for (const route of ["budget", "wally", "receipts", "proof", "seal?mode=edit", "evidence", "presenter"]) {
      await page.goto(`/?api=mock#/${route}`);
      await expect(page.getByRole("note")).toBeVisible();
      await page.waitForFunction(() => !document.querySelector("[data-route-loading]"));
      expect(await sideways(page), `${route} at ${width}`).toBeLessThanOrEqual(0);
    }
    await page.goto("/?api=mock#/budget");
    await page.locator('main [data-scenario="overflow"]').click();
    await expect(page.getByRole("alert").filter({ hasText: "STOPPED R3" })).toBeVisible();
    expect(await sideways(page), `wally after a stop at ${width}`).toBeLessThanOrEqual(0);
  }
});

test("the stop is above the fold on a phone after a stop", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone project only");
  await page.goto("/?api=mock#/budget");
  await page.locator('main [data-scenario="flagged"]').click();
  await expect(page.getByRole("alert").filter({ hasText: "STOPPED R9" })).toBeInViewport();
});

test("every route renders with the SIMULATED note in the top bar", async ({ page }) => {
  for (const route of ["booth", "budget", "wally", "receipts", "proof", "seal", "evidence", "presenter", "run", "console", "log"]) {
    await page.goto(`/?api=mock#/${route}`);
    await expect(page.getByRole("note")).toContainText("SIMULATED");
  }
});

test("respects reduced motion: the stop, mint and seal animations run for zero time", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?api=mock#/budget");
  const durations = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    // The build minifier may write 0ms as 0s and 1200ms as 1.2s; compare in milliseconds.
    const ms = (v: string): number => (v.endsWith("ms") ? Number.parseFloat(v) : Number.parseFloat(v) * 1000);
    return ["--dur-seal", "--dur-mint", "--dur-stop", "--dur-expire", "--dur-hold"].map((v) => Math.round(ms(cs.getPropertyValue(v).trim())));
  });
  expect(durations).toEqual([0, 0, 0, 0, 1200]);
});
