// The first run in a real browser, as a visitor who has never been here (the config puts the "onboarded" flag in storage for every
// other spec; this one starts empty). Skip, Skip is the judge's way to the live demo; the full walk ends on a personal Budget; the
// tour can be taken again and the profile forgotten from About; every step passes axe at the phone widths, light and dark.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 360, height: 740 },
  { width: 430, height: 932 },
] as const;

async function blocking(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return result.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.impact} ${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
}

/** The step in front, once its entrance has played. */
async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => !document.querySelector("[data-route-loading]"));
  await page.waitForTimeout(450);
}

const hello = (page: Page) => page.getByRole("heading", { level: 1, name: "Hi, I'm Wally." });
const next = (page: Page) => page.locator("[data-onboarding] [data-next]");
const meter = (page: Page) => page.getByRole("meter");

/** Hello, with a nickname, to the budget step. */
async function toTaste(page: Page, nickname = "Mei"): Promise<void> {
  await page.getByRole("textbox", { name: "What should Wally call you?" }).fill(nickname);
  await next(page).click();
  await expect(page.getByRole("heading", { level: 1, name: "What's your style?" })).toBeVisible();
}

test.describe("Skip, Skip", () => {
  test("is the way to the live demo: Hello, Skip, the tour, Skip tour, then Budget with the ready-made HK$800", async ({ page }) => {
    await page.goto("/?api=mock");
    await expect(hello(page)).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
    await page.getByRole("button", { name: "Skip", exact: true }).click();
    const card = page.getByRole("dialog", { name: "Ask Wally" });
    await expect(card).toBeVisible();
    await expect(meter(page)).toHaveAttribute("aria-valuetext", "HK$800 left of HK$800, SIMULATED");
    await page.getByRole("button", { name: "Skip tour" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    // Shown once: a reload goes to the app.
    await page.reload();
    await expect(meter(page)).toBeVisible();
    await expect(hello(page)).toHaveCount(0);
    expect(await page.evaluate(() => window.localStorage.getItem("wally:onboarded"))).toBe("1");
  });

  test("a link to another screen is not interrupted", async ({ page }) => {
    await page.goto("/?api=mock#/proof");
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    await expect(hello(page)).toHaveCount(0);
  });

  test("the Seal screen stays reachable for the video: #/seal?mode=welcome shows Meet Wally", async ({ page }) => {
    await page.goto("/?api=mock#/seal?mode=welcome");
    await expect(page.getByRole("heading", { name: "Meet Wally" })).toBeVisible();
  });
});

test.describe("the four steps", () => {
  test("walk Hello, taste, budget, Check and seal, sealed and the tour, and land on a personal Budget (on-device engine)", async ({ page }) => {
    await page.goto("/");
    await expect(hello(page)).toBeVisible();
    await toTaste(page);
    await page.locator('[data-chip-id="streetwear"]').click();
    await page.locator('[data-swatch-id="black"]').click();
    await page.locator('[data-size="M"]').first().click();
    await page.locator('[data-chip-id="footwear"]').click();
    await next(page).click();
    await expect(page.getByRole("heading", { level: 1, name: "Your first budget" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "HK$500" })).toBeChecked();
    await page.getByRole("radio", { name: "Two weeks" }).click();
    await page.getByRole("button", { name: "Review budget" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Check and seal" })).toBeVisible();
    await page.getByRole("button", { name: /Seal budget/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Your budget is sealed" })).toBeVisible();
    await page.getByRole("button", { name: /^Continue/ }).click();
    await expect(page.getByRole("dialog", { name: "Ask Wally" })).toBeVisible();
    await page.getByRole("button", { name: /^Next/ }).click();
    await expect(page.getByRole("dialog", { name: "Ideas for you" })).toBeVisible();
    await page.getByRole("button", { name: /^Next/ }).click();
    await expect(page.getByRole("dialog", { name: "Find your way" })).toBeVisible();
    await page.getByRole("button", { name: /^Done/ }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("Hi Mei, I'm Wally.")).toBeVisible();
    await expect(meter(page)).toHaveAttribute("aria-valuetext", "HK$500 left of HK$500, SIMULATED");
    // The same real purchase works from a card that was put first for this person.
    const stops = page.locator("main .home-try__group").nth(1).locator("[data-scenario]");
    await expect(stops.first()).toHaveAttribute("data-scenario", "overflow");
    await expect(page.locator("main [data-for-you]").first()).toBeVisible();
  });

  test("Back keeps what was typed, and a size can be cleared", async ({ page }) => {
    await page.goto("/?api=mock");
    await toTaste(page, "Jo");
    await page.locator('[data-size="L"]').first().click();
    await expect(page.locator('[data-size="L"]').first()).toHaveAttribute("aria-pressed", "true");
    await page.locator('[data-size="L"]').first().click();
    await expect(page.locator('[data-size="L"]').first()).toHaveAttribute("aria-pressed", "false");
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByRole("textbox", { name: "What should Wally call you?" })).toHaveValue("Jo");
  });

  test("a typed amount is checked in the Seal screen's words", async ({ page }) => {
    await page.goto("/?api=mock");
    await toTaste(page);
    await next(page).click();
    await page.getByRole("radio", { name: "Custom" }).click();
    await page.getByRole("button", { name: "Review budget" }).click();
    await expect(page.getByText("Enter an amount above zero.")).toBeVisible();
    await page.getByRole("textbox", { name: /^Amount/ }).fill("650");
    await page.getByRole("button", { name: "Review budget" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Check and seal" })).toBeVisible();
    await expect(page.locator(".seal-summary")).toContainText("HK$650");
  });

  test("a tap on the dimmed page keeps focus on the card, and Escape still ends the tour", async ({ page }) => {
    await page.goto("/?api=mock");
    await page.getByRole("button", { name: "Skip", exact: true }).click();
    const card = page.getByRole("dialog", { name: "Ask Wally" });
    await expect(card).toBeFocused();
    await page.mouse.click(20, 120);
    await expect(card).toBeFocused();
    expect(await page.evaluate(() => document.querySelectorAll("body > [inert]").length)).toBeGreaterThan(0);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await page.evaluate(() => document.querySelectorAll("[inert]").length)).toBe(0);
  });

  test("the tour's Escape ends it, and the page behind did not take the tap", async ({ page }) => {
    await page.goto("/?api=mock");
    await page.getByRole("button", { name: "Skip", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Ask Wally" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Ask Wally" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

/** How much of the Seal button a thumb can reach: the share of points over the button whose top element is the button itself. */
async function sealButtonReach(page: Page): Promise<{ readonly reach: number; readonly inside: boolean; readonly bottom: number; readonly viewport: number }> {
  return page.evaluate(() => {
    const button = document.querySelector<HTMLElement>("[data-seal-button]");
    if (!button) return { reach: 0, inside: false, bottom: 0, viewport: window.innerHeight };
    const r = button.getBoundingClientRect();
    // Points well inside the button, away from the rounded ends: a cover sitting over any part of it shows here.
    const xs = [0.2, 0.35, 0.5, 0.65, 0.8].map((f) => r.left + r.width * f);
    const ys = [0.25, 0.5, 0.75].map((f) => r.top + r.height * f);
    const hits = xs.flatMap((x) => ys.map((y) => document.elementFromPoint(x, y))).filter((el) => el !== null && button.contains(el));
    return { reach: hits.length / (xs.length * ys.length), inside: r.top >= 0 && r.bottom <= window.innerHeight, bottom: r.bottom, viewport: window.innerHeight };
  });
}

test.describe("Check and seal on a short phone", () => {
  // The Seal button is the one pinned control: the skip note under it is plain text, not a second bar stacked over it.
  for (const viewport of [{ width: 360, height: 740 }, { width: 390, height: 664 }, { width: 390, height: 844 }, { width: 430, height: 932 }] as const) {
    test(`Seal budget is fully tappable at ${viewport.width}x${viewport.height}, at the top of the page and at the bottom`, async ({ page }) => {
      test.skip(test.info().project.name !== "phone", "the sizes are set inside the test");
      await page.setViewportSize(viewport);
      // The page as the public link serves it: on the phone itself, with the strip about that on top (it takes room too).
      await page.goto("/");
      await toTaste(page);
      await next(page).click();
      await expect(page.getByRole("heading", { level: 1, name: "Your first budget" })).toBeVisible();
      await page.getByRole("button", { name: "Review budget" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Check and seal" })).toBeVisible();
      await settled(page);
      const button = page.getByRole("button", { name: /Seal budget/ });
      await expect(button).toBeVisible();
      const top = await sealButtonReach(page);
      expect(top, "before any scrolling").toMatchObject({ reach: 1, inside: true });
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(250);
      const end = await sealButtonReach(page);
      expect(end, "scrolled to the end").toMatchObject({ reach: 1, inside: true });
      // The note under the button is still there, reached by scrolling.
      await expect(page.getByText(/^Or skip/)).toBeVisible();
      // And the tap goes through: the budget is sealed.
      await button.click();
      await expect(page.getByRole("heading", { level: 1, name: "Your budget is sealed" })).toBeVisible();
    });
  }
});

test.describe("About: the tour again, and forget my profile", () => {
  test("the tour again replays the flow with what was told; forgetting removes it and leaves the budget", async ({ page }) => {
    await page.goto("/?api=mock");
    await toTaste(page, "Mei");
    await page.locator('[data-chip-id="cozy"]').click();
    await page.getByRole("button", { name: "Skip", exact: true }).click();
    await page.getByRole("button", { name: "Skip tour" }).click();
    await expect(page.getByText("Hi Mei, I'm Wally.")).toBeVisible();

    await page.getByRole("button", { name: "About and settings" }).click();
    const sheet = page.getByRole("dialog", { name: "About Wally" });
    await expect(sheet.getByText("Your profile")).toBeVisible();
    await sheet.getByRole("button", { name: /Take the tour again/ }).click();
    await expect(hello(page)).toBeVisible();
    await expect(page.getByRole("textbox", { name: "What should Wally call you?" })).toHaveValue("Mei");
    await page.getByRole("button", { name: "Skip", exact: true }).click();
    await page.getByRole("button", { name: "Skip tour" }).click();
    await expect(meter(page)).toHaveAttribute("aria-valuetext", "HK$800 left of HK$800, SIMULATED");

    await page.getByRole("button", { name: "About and settings" }).click();
    await page.getByRole("dialog", { name: "About Wally" }).getByRole("button", { name: /Forget my profile/ }).click();
    await page.getByRole("alertdialog", { name: "Forget your profile?" }).getByRole("button", { name: "Forget" }).click();
    await expect(page.getByText("Profile forgotten.")).toBeVisible();
    expect(await page.evaluate(() => window.localStorage.getItem("wally:profile:v1"))).toBeNull();
    expect(await page.evaluate(() => window.localStorage.getItem("wally:onboarded"))).toBe("1");
    await page.keyboard.press("Escape");
    await expect(page.getByText("Hi, I'm Wally.")).toBeVisible();
  });
});

test.describe("繁體中文", () => {
  test.use({ locale: "zh-HK" });

  test("the whole first run reads in Chinese, down to the tour", async ({ page }) => {
    await page.goto("/?api=mock");
    await expect(page.getByRole("heading", { level: 1, name: "你好，我係 Wally。" })).toBeVisible();
    await expect(page.locator("[data-onboarding]")).toHaveAttribute("lang", "zh-HK");
    await page.getByRole("textbox", { name: "Wally 應該點稱呼你？" }).fill("美");
    await page.locator("[data-onboarding] [data-next]").click();
    await expect(page.getByRole("heading", { level: 1, name: "你鍾意咩風格？" })).toBeVisible();
    await page.getByRole("button", { name: "略過", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "問 Wally" })).toBeVisible();
    await page.getByRole("button", { name: "略過導覽" }).click();
    await expect(page.getByText("美，你好，我係 Wally。")).toBeVisible();
  });
});

test.describe("axe and touch targets on every step", () => {
  for (const viewport of VIEWPORTS) {
    for (const scheme of ["light", "dark"] as const) {
      test.describe(`${viewport.width}x${viewport.height} ${scheme}`, () => {
        test.use({ viewport, colorScheme: scheme });

        test("Hello, taste, budget, Check and seal, sealed and the three tour marks", async ({ page }) => {
          test.skip(test.info().project.name !== "phone", "the widths are set inside the tests");
          await page.goto("/?api=mock");
          await expect(hello(page)).toBeVisible();
          await settled(page);
          expect(await blocking(page), "hello").toEqual([]);
          await toTaste(page);
          await page.locator('[data-chip-id="streetwear"]').click();
          await page.locator('[data-swatch-id="black"]').click();
          await page.locator('[data-size="M"]').first().click();
          await settled(page);
          expect(await blocking(page), "taste").toEqual([]);
          await next(page).click();
          await expect(page.getByRole("heading", { level: 1, name: "Your first budget" })).toBeVisible();
          await settled(page);
          expect(await blocking(page), "budget").toEqual([]);
          // No sideways scroll, and every control is a 44 px target.
          const layout = await page.evaluate(() => ({
            wide: document.documentElement.scrollWidth > window.innerWidth,
            small: [...document.querySelectorAll<HTMLElement>("[data-onboarding] button, [data-onboarding] input, [data-onboarding] select")]
              .filter((el) => el.getClientRects().length > 0)
              .map((el) => ({ name: (el.getAttribute("aria-label") ?? el.textContent ?? el.tagName).trim().slice(0, 24), w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) }))
              .filter((b) => b.h < 43.5 || b.w < 43.5),
          }));
          expect(layout.wide, "sideways scroll").toBe(false);
          expect(layout.small, "targets under 44 px").toEqual([]);
          await page.getByRole("button", { name: "Review budget" }).click();
          await expect(page.getByRole("heading", { level: 1, name: "Check and seal" })).toBeVisible();
          await settled(page);
          expect(await blocking(page), "review").toEqual([]);
          await page.getByRole("button", { name: /Seal budget/ }).click();
          await expect(page.getByRole("heading", { level: 1, name: "Your budget is sealed" })).toBeVisible();
          await settled(page);
          expect(await blocking(page), "sealed").toEqual([]);
          await page.getByRole("button", { name: /^Continue/ }).click();
          for (const [mark, name] of [["ask", "Ask Wally"], ["ideas", "Ideas for you"], ["tabs", "Find your way"]] as const) {
            await expect(page.getByRole("dialog", { name })).toBeVisible();
            await settled(page);
            expect(await blocking(page), `tour ${mark}`).toEqual([]);
            if (mark !== "tabs") await page.getByRole("button", { name: /^Next/ }).click();
          }
          await page.getByRole("button", { name: /^Done/ }).click();
          await expect(page.getByRole("dialog")).toHaveCount(0);
          await settled(page);
          expect(await blocking(page), "home after the tour").toEqual([]);
        });
      });
    }
  }
});
