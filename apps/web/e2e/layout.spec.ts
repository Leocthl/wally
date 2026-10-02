// Layout and accessibility checks in a real browser: 44 px targets, no horizontal scroll at 360 px, every route renders.
import { expect, test, type Page } from "@playwright/test";

const TARGETS = "button, a[href], select, input, textarea, summary, [role=tab]";

async function undersized(page: Page): Promise<string[]> {
  return page.evaluate((selector) => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      if (el.classList.contains("sr-only")) continue;
      const box = el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio") ? (el.closest("label") ?? el) : el;
      const r = box.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.width < 43.5 || r.height < 43.5) out.push(`${el.tagName} "${(el.textContent ?? "").trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out;
  }, TARGETS);
}

async function showTab(page: Page, name: "Packet" | "Run" | "Log"): Promise<void> {
  const tab = page.getByRole("tab", { name: new RegExp(`^${name}`) });
  if (await tab.isVisible()) await tab.click();
}

test("every control is at least 44 px square on the booth (docs/04 Accessibility)", async ({ page }) => {
  await page.goto("/#/booth");
  await showTab(page, "Run");
  await page.locator('[data-scenario="unverified"]').click();
  await expect(page.getByRole("alert").filter({ hasText: "ESCALATED R9" })).toBeVisible();
  expect(await undersized(page)).toEqual([]);
  await showTab(page, "Packet");
  expect(await undersized(page)).toEqual([]);
  await showTab(page, "Log");
  expect(await undersized(page)).toEqual([]);
});

test("every control is at least 44 px square on the Seal screen", async ({ page }) => {
  await page.goto("/#/seal");
  await expect(page.getByRole("textbox", { name: /Your mandate/ })).toBeVisible();
  expect(await undersized(page)).toEqual([]);
});

test("the screens do not scroll sideways at 360 px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  for (const route of ["booth", "seal", "presenter", "console", "log", "run"]) {
    await page.goto(`/#/${route}`);
    await expect(page.getByRole("note")).toBeVisible();
    if (route === "booth") {
      await showTab(page, "Run");
      await page.locator('[data-scenario="overflow"]').click();
      await expect(page.getByRole("alert").filter({ hasText: "STOPPED R3" })).toBeVisible();
    }
    const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(width.scroll, `${route} scrollWidth`).toBeLessThanOrEqual(width.client);
  }
});

test("the StopBanner is above the fold on a phone after a stop", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone project only");
  await page.goto("/#/booth");
  await page.locator('[data-scenario="flagged"]').click();
  const banner = page.getByRole("alert").filter({ hasText: "STOPPED R9" });
  await expect(banner).toBeInViewport();
});

test("every route renders with the rail badge and footer", async ({ page }) => {
  for (const route of ["booth", "seal", "run", "console", "log", "presenter"]) {
    await page.goto(`/#/${route}`);
    await expect(page.getByRole("note").filter({ hasText: "SIMULATED rail. No money moves." })).toBeVisible();
    await expect(page.getByText("Prototype. Not affiliated with HKT, Tap & Go or Mastercard.")).toBeVisible();
  }
});

test("respects reduced motion: the stop banner and ticket animations run for zero time", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#/booth");
  const durations = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    // The build minifier may write 0ms as 0s and 1200ms as 1.2s; compare in milliseconds.
    const ms = (v: string): number => (v.endsWith("ms") ? Number.parseFloat(v) : Number.parseFloat(v) * 1000);
    return ["--dur-seal", "--dur-mint", "--dur-stop", "--dur-expire", "--dur-hold"].map((v) => Math.round(ms(cs.getPropertyValue(v).trim())));
  });
  expect(durations).toEqual([0, 0, 0, 0, 1200]);
});
