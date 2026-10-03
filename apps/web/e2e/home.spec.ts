// Home as a shopper's screen, in a real browser on a phone: the greeting and budget, "What do you need?", Ideas for you, and the
// booth's scenario cards in a disclosure that is folded for a shopper and open on the booth Mac, with ?booth=1 and in presenter
// mode. The e2e server is on 127.0.0.1, which is the booth Mac, so a shopper's view is set up with the remembered choice.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

/** A shopper who folded the cards away, once: the choice is seeded on the first load only, so a reload shows what the page remembered. */
const folded = (page: Page) =>
  page.addInitScript(() => {
    if (window.sessionStorage.getItem("seeded") !== null) return;
    window.sessionStorage.setItem("seeded", "1");
    window.localStorage.setItem("wally:demo-open", "0");
  });
const composer = (page: Page) => page.getByRole("button", { name: "What do you need?" });
const demo = (page: Page) => page.locator("[data-demo-disclosure]");

async function blocking(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return result.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.impact} ${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
}

test.beforeEach(({ isMobile }) => {
  test.skip(!isMobile, "Home is checked on the phone project");
});

test("a shopper sees the greeting, the budget, the composer, four ideas and Recent, with the scenario cards folded away", async ({ page }) => {
  await folded(page);
  await page.goto("/?api=mock#/budget");
  await expect(page.getByText("Hi, I'm Wally.")).toBeVisible();
  await expect(page.getByRole("meter")).toHaveAttribute("aria-valuetext", "HK$800 left of HK$800, SIMULATED");
  await expect(composer(page)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ideas for you" })).toBeVisible();
  await expect(page.locator("main [data-idea]")).toHaveCount(4);
  await expect(page.locator("main [data-idea]").first()).toContainText("Cotton tee");
  await expect(demo(page)).not.toHaveAttribute("open", "");
  await expect(page.locator('main [data-scenario="normal"]').first()).toBeHidden();
});

/** Where the parts of Home are, in CSS pixels of the first screen. */
async function firstScreen(page: Page) {
  return page.evaluate(() => {
    const box = (selector: string) => {
      const r = document.querySelector(selector)?.getBoundingClientRect();
      return r ? { top: r.top, bottom: r.bottom } : null;
    };
    return { greet: box(".home-hero__greet"), composer: box("[data-composer]"), meter: box(".home-hero__card .w-progress, .home-hero__card [role=meter]"), card: box(".home-hero__card"), tabs: box(".w-tabbar"), height: window.innerHeight };
  });
}

test("the way in is right under Wally's hello and above the fold on the phones people have, with the budget number and meter still in view", async ({ page }) => {
  await folded(page);
  for (const [width, height] of [[390, 844], [360, 740], [430, 932]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/?api=local#/budget");
    await expect(composer(page)).toBeVisible();
    await page.waitForTimeout(700);
    const at = await firstScreen(page);
    const where = `${width}x${height}`;
    expect(at.greet && at.composer && at.card && at.tabs && at.meter, where).toBeTruthy();
    // The row follows the greeting, then the card; the whole row is above the tab bar, and so is the meter.
    expect(at.composer!.top, `${where}: composer under the greeting`).toBeGreaterThanOrEqual(at.greet!.bottom - 1);
    expect(at.card!.top, `${where}: card under the composer`).toBeGreaterThanOrEqual(at.composer!.bottom - 1);
    expect(at.composer!.bottom, `${where}: composer above the tab bar`).toBeLessThanOrEqual(at.tabs!.top);
    expect(at.meter!.bottom, `${where}: meter above the tab bar`).toBeLessThanOrEqual(at.tabs!.top);
  }
});

test("on iPhone Safari the Add to Home Screen card waits for a first purchase, then sits below Recent", async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL: baseURL ?? "",
    viewport: { width: 390, height: 844 },
    userAgent: IPHONE_SAFARI,
    isMobile: true,
    hasTouch: true,
    storageState: { cookies: [], origins: [{ origin: new URL(baseURL ?? "http://127.0.0.1").origin, localStorage: [{ name: "wally:onboarded", value: "1" }] }] },
  });
  try {
    const page = await context.newPage();
    const card = page.getByRole("complementary", { name: "Add Wally to your Home Screen" });
    await page.goto("/?api=local#/budget");
    await expect(composer(page)).toBeVisible();
    await expect(card).toHaveCount(0);
    await page.locator('main [data-scenario="normal"]').first().click();
    await expect(page.locator('[data-screen="wally"] [data-kind="exact"]')).toBeVisible();
    await page.getByRole("link", { name: "Budget", exact: true }).click();
    await expect(card).toBeVisible();
    const order = await page.evaluate(() => {
      const top = (el: Element | null) => el?.getBoundingClientRect().top ?? Number.NaN;
      return { greet: top(document.querySelector(".home-hero__greet")), recent: top(document.querySelector("#home-recent-title")), hint: top(document.querySelector(".w-ios-hint")), demo: top(document.querySelector("[data-demo-disclosure]")) };
    });
    expect(order.hint).toBeGreaterThan(order.recent);
    expect(order.demo).toBeGreaterThan(order.hint);
    expect(order.hint).toBeGreaterThan(order.greet);
    expect(await blocking(page)).toEqual([]);
  } finally {
    await context.close();
  }
});

test("the composer opens the Ask sheet", async ({ page }) => {
  await folded(page);
  await page.goto("/?api=mock#/budget");
  await composer(page).click();
  await expect(page.getByRole("dialog", { name: /What should Wally try/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("an idea opens a preview first, and only its buy button shops for the item", async ({ page }) => {
  await folded(page);
  await page.goto("/?api=mock#/budget");
  await page.locator('main [data-idea="socks"]').click();
  const sheet = page.getByRole("dialog", { name: "Ankle socks" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("HK$120");
  await expect(sheet).toContainText("From the demo shop");
  await expect(sheet.locator("[data-chip]").first()).toContainText("SIMULATED");
  // Nothing was bought by looking: Not now puts it all back.
  await sheet.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/#\/budget$/);
  await page.locator('main [data-idea="socks"]').click();
  await page.getByRole("dialog", { name: "Ankle socks" }).getByRole("button", { name: "Ask Wally to buy this" }).click();
  await expect(page).toHaveURL(/#\/wally$/);
  await expect(page.locator('[data-screen="wally"] [data-kind="exact"]')).toContainText("Charged the exact HK$120.");
});

test.describe("the preview sheet passes axe, light and dark, at the narrowest phone", () => {
  for (const scheme of ["light", "dark"] as const) {
    test(`${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: 360, height: 740 });
      await folded(page);
      await page.goto("/?api=mock#/budget");
      for (const id of ["tee", "jacket"]) {
        await page.locator(`main [data-idea="${id}"]`).click();
        const sheet = page.locator("[data-idea-sheet]");
        await expect(sheet).toBeVisible();
        await page.waitForTimeout(450);
        expect(await blocking(page), id).toEqual([]);
        const fits = await page.evaluate(() => {
          const panel = document.querySelector(".w-sheet")?.getBoundingClientRect();
          const buy = document.querySelector("[data-idea-buy]")?.getBoundingClientRect();
          return { sideways: document.documentElement.scrollWidth > window.innerWidth, buyBottom: buy?.bottom ?? 0, panelTop: panel?.top ?? 0, height: window.innerHeight, buyHeight: buy?.height ?? 0 };
        });
        expect(fits.sideways, id).toBe(false);
        expect(fits.buyBottom, `${id}: the buy button is on screen`).toBeLessThanOrEqual(fits.height);
        expect(fits.buyHeight, `${id}: 44 px target`).toBeGreaterThanOrEqual(44);
        await page.getByRole("button", { name: "Not now" }).click();
        await expect(sheet).toHaveCount(0);
      }
    });
  }
});

test("the scenario cards open with one tap and the choice is remembered; ?booth=1 opens them whatever was chosen", async ({ page }) => {
  await folded(page);
  await page.goto("/?api=mock#/budget");
  await demo(page).locator("summary").click();
  await expect(demo(page)).toHaveAttribute("open", "");
  await expect(page.locator('main [data-scenario="normal"]').first()).toBeVisible();
  await expect(page.locator('main [data-scenario]')).toHaveCount(13);
  // The browser reports the change a moment after it happens (the toggle event); the choice is kept from then on.
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("wally:demo-open"))).toBe("1");
  await page.reload();
  await expect(demo(page)).toHaveAttribute("open", "");
  await demo(page).locator("summary").click();
  await expect(demo(page)).not.toHaveAttribute("open", "");
  await page.goto("/?api=mock&booth=1#/budget");
  await expect(demo(page)).toHaveAttribute("open", "");
});

test("the booth Mac (a loopback address) starts with the scenario cards open, and presenter mode opens them", async ({ page }) => {
  await page.goto("/?api=mock#/budget");
  await expect(demo(page)).toHaveAttribute("open", "");
  await page.evaluate(() => {
    window.localStorage.setItem("wally:demo-open", "0");
    window.localStorage.setItem("wally:presenter", "1");
  });
  await page.reload();
  await expect(demo(page)).toHaveAttribute("open", "");
});

test("Home in 繁體 reads the composer, the ideas and the disclosure", async ({ page }) => {
  await folded(page);
  await page.goto("/?api=mock#/budget");
  await page.getByRole("button", { name: "About and settings" }).click();
  await page.getByRole("dialog", { name: "About Wally" }).getByRole("radio", { name: "繁體中文" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "你需要啲咩？" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "為你推介" })).toBeVisible();
  await expect(page.getByText("示範情境（供評審使用）").first()).toBeVisible();
});

test.describe("axe on Home, folded and open", () => {
  for (const scheme of ["light", "dark"] as const) {
    test(`${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await folded(page);
      await page.goto("/?api=mock#/budget");
      await expect(composer(page)).toBeVisible();
      await page.waitForTimeout(500);
      expect(await blocking(page), "folded").toEqual([]);
      await demo(page).locator("summary").click();
      await page.waitForTimeout(300);
      expect(await blocking(page), "open").toEqual([]);
    });
  }
});
