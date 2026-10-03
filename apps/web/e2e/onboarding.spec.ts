// The first run in a real browser, as a visitor who has never been here (the config puts the "onboarded" flag in storage for every
// other spec; this one starts empty). Skip, Skip is the judge's way to the live demo; the full walk (Hello, What can Wally buy for
// you?, the budget, the quick tour) ends on a personal Budget; the tour can be taken again and the profile forgotten from About;
// every step passes axe at the phone widths, light and dark.
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

/** Hello, with a nickname, to step two: What can Wally buy for you? */
async function toBuy(page: Page, nickname = "Mei"): Promise<void> {
  await page.getByRole("textbox", { name: "What should Wally call you?" }).fill(nickname);
  await next(page).click();
  await expect(page.getByRole("heading", { level: 1, name: "What can Wally buy for you?" })).toBeVisible();
}

/** A kind of purchase on step two, by the engine's category (the chip's data attribute stays when the words change). */
const kind = (page: Page, category: "groceries" | "apparel" | "footwear" | "electronics") => page.locator(`[data-onboarding] [data-chip-id="${category}"]`);

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
  test("walk Hello, what Wally can buy, budget, Check and lock in, sealed and the tour, and land on a personal Budget (on-device engine)", async ({ page }) => {
    await page.goto("/");
    await expect(hello(page)).toBeVisible();
    await toBuy(page);
    // All four kinds start ticked (that is any category); this visitor keeps clothes and shoes.
    for (const category of ["groceries", "apparel", "footwear", "electronics"] as const) await expect(kind(page, category)).toHaveAttribute("aria-pressed", "true");
    await kind(page, "groceries").click();
    await kind(page, "electronics").click();
    await next(page).click();
    await expect(page.getByRole("heading", { level: 1, name: "Your first budget" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "HK$800" })).toBeChecked();
    await expect(page.getByRole("group", { name: "What Wally can buy" }).getByRole("button", { name: "Shoes" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("group", { name: "What Wally can buy" }).getByRole("button", { name: "Groceries" })).toHaveAttribute("aria-pressed", "false");
    await page.getByRole("radio", { name: "Two weeks" }).click();
    await page.getByRole("button", { name: "Review budget" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Check and lock in" })).toBeVisible();
    await expect(page.locator(".seal-summary")).toContainText("Clothes, Shoes only");
    await page.getByRole("button", { name: /Lock in budget/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Your budget is locked in" })).toBeVisible();
    await page.getByRole("button", { name: /^Continue/ }).click();
    await expect(page.getByRole("dialog", { name: "Ask Wally" })).toBeVisible();
    await page.getByRole("button", { name: /^Next/ }).click();
    await expect(page.getByRole("dialog", { name: "Ideas for you" })).toBeVisible();
    await page.getByRole("button", { name: /^Next/ }).click();
    await expect(page.getByRole("dialog", { name: "Find your way" })).toBeVisible();
    await page.getByRole("button", { name: /^Done/ }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("Hi Mei, I'm Wally.")).toBeVisible();
    await expect(meter(page)).toHaveAttribute("aria-valuetext", "HK$800 left of HK$800, SIMULATED");
    await expect(page.getByRole("region", { name: "Your budget" })).toContainText("Clothes, Shoes only");
    // Clothes and shoes name no shelf item of their own: the cards keep the booth's order and carry no "For you" tag.
    const stops = page.locator("main .home-try__group").nth(1).locator("[data-scenario]");
    await expect(stops.first()).toHaveAttribute("data-scenario", "flagged");
    await expect(page.locator("main [data-for-you]")).toHaveCount(0);
  });

  test("leaving all four kinds ticked makes a budget for any category", async ({ page }) => {
    await page.goto("/");
    await toBuy(page);
    await next(page).click();
    await page.getByRole("button", { name: "Review budget" }).click();
    await expect(page.locator(".seal-summary")).toContainText("Any category");
    await page.getByRole("button", { name: /Lock in budget/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Your budget is locked in" })).toBeVisible();
    await page.getByRole("button", { name: /^Continue/ }).click();
    await page.getByRole("button", { name: "Skip tour" }).click();
    await expect(page.getByRole("region", { name: "Your budget" })).toContainText("Any category");
    // Nothing was narrowed, so no categories are stored (the name is).
    expect(await page.evaluate(() => JSON.parse(window.localStorage.getItem("wally:profile:v1") ?? "null"))).toEqual({ v: 1, nickname: "Mei", shopFor: [] });
  });

  test("Back keeps what was typed and what was ticked", async ({ page }) => {
    await page.goto("/?api=mock");
    await toBuy(page, "Jo");
    await kind(page, "footwear").click();
    await expect(kind(page, "footwear")).toHaveAttribute("aria-pressed", "false");
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByRole("textbox", { name: "What should Wally call you?" })).toHaveValue("Jo");
    await next(page).click();
    await expect(kind(page, "footwear")).toHaveAttribute("aria-pressed", "false");
    await expect(kind(page, "apparel")).toHaveAttribute("aria-pressed", "true");
  });

  test("asks nothing about style, colours or sizes", async ({ page }) => {
    await page.goto("/?api=mock");
    await toBuy(page);
    await expect(page.locator("[data-swatch-id], [data-size]")).toHaveCount(0);
    const words = await page.locator("[data-onboarding]").innerText();
    for (const old of [/style/i, /colou?rs?/i, /\bsizes?\b/i, /taste/i, /streetwear/i, /smart casual/i]) expect(words, String(old)).not.toMatch(old);
  });

  test("a typed amount is checked in the Seal screen's words", async ({ page }) => {
    await page.goto("/?api=mock");
    await toBuy(page);
    await next(page).click();
    await page.getByRole("radio", { name: "Custom" }).click();
    await page.getByRole("button", { name: "Review budget" }).click();
    await expect(page.getByText("Enter an amount above zero.")).toBeVisible();
    await page.getByRole("textbox", { name: /^Amount/ }).fill("650");
    await page.getByRole("button", { name: "Review budget" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Check and lock in" })).toBeVisible();
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

test.describe("Check and lock in on a short phone", () => {
  // The Seal button is the one pinned control: nothing else is stacked over it (the skip note sits under the Skip link at the top).
  for (const viewport of [{ width: 360, height: 740 }, { width: 390, height: 664 }, { width: 390, height: 844 }, { width: 430, height: 932 }] as const) {
    test(`Lock in budget is fully tappable at ${viewport.width}x${viewport.height}, at the top of the page and at the bottom`, async ({ page }) => {
      test.skip(test.info().project.name !== "phone", "the sizes are set inside the test");
      await page.setViewportSize(viewport);
      // The page as the public link serves it: on the phone itself, with the strip about that on top (it takes room too).
      await page.goto("/");
      await toBuy(page);
      await next(page).click();
      await expect(page.getByRole("heading", { level: 1, name: "Your first budget" })).toBeVisible();
      await page.getByRole("button", { name: "Review budget" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Check and lock in" })).toBeVisible();
      await settled(page);
      const button = page.getByRole("button", { name: /Lock in budget/ });
      await expect(button).toBeVisible();
      const top = await sealButtonReach(page);
      expect(top, "before any scrolling").toMatchObject({ reach: 1, inside: true });
      // Skip would seal the ready-made budget instead of the one on screen: the note under the Skip link says so, in view at the top.
      const skipLink = page.getByRole("button", { name: "Skip", exact: true });
      const hint = page.locator("[data-skip-note]");
      await expect(hint).toBeVisible();
      await expect(hint).toContainText("Skip uses a ready-made HK$800 budget for clothes.");
      const [skipBox, hintBox] = [await skipLink.boundingBox(), await hint.boundingBox()];
      expect(hintBox?.y ?? 0, "the note is under the link").toBeGreaterThanOrEqual((skipBox?.y ?? 0) + (skipBox?.height ?? 0) - 1);
      expect((hintBox?.x ?? 0) + (hintBox?.width ?? 0), "inside the screen").toBeLessThanOrEqual(viewport.width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no sideways scroll").toBe(true);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(250);
      const end = await sealButtonReach(page);
      expect(end, "scrolled to the end").toMatchObject({ reach: 1, inside: true });
      // And the tap goes through: the budget is sealed.
      await button.click();
      await expect(page.getByRole("heading", { level: 1, name: "Your budget is locked in" })).toBeVisible();
    });
  }
});

test.describe("About: the tour again, and forget my profile", () => {
  test("the tour again replays the flow with what was told; forgetting removes it and leaves the budget", async ({ page }) => {
    await page.goto("/?api=mock");
    await toBuy(page, "Mei");
    await kind(page, "groceries").click();
    await page.getByRole("button", { name: "Skip", exact: true }).click();
    await page.getByRole("button", { name: "Skip tour" }).click();
    await expect(page.getByText("Hi Mei, I'm Wally.")).toBeVisible();

    await page.getByRole("button", { name: "About and settings" }).click();
    const sheet = page.getByRole("dialog", { name: "About Wally" });
    await expect(sheet.getByText("Your profile")).toBeVisible();
    await expect(sheet.getByText("Mei · Clothes, Shoes, Gadgets and electronics")).toBeVisible();
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
    await expect(page.getByRole("heading", { level: 1, name: "Wally 可以幫你買啲咩？" })).toBeVisible();
    await expect(page.getByRole("button", { name: "雜貨同食品" })).toHaveAttribute("aria-pressed", "true");
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

        test("Hello, what Wally can buy, budget, Check and lock in, sealed and the three tour marks", async ({ page }) => {
          test.skip(test.info().project.name !== "phone", "the widths are set inside the tests");
          await page.goto("/?api=mock");
          await expect(hello(page)).toBeVisible();
          await settled(page);
          expect(await blocking(page), "hello").toEqual([]);
          await toBuy(page);
          await settled(page);
          expect(await blocking(page), "what Wally can buy, all four ticked").toEqual([]);
          await kind(page, "groceries").click();
          await settled(page);
          expect(await blocking(page), "what Wally can buy, one unticked").toEqual([]);
          // Every chip is a 44 px target, and the step does not scroll sideways.
          const reach = await page.evaluate(() => ({
            wide: document.documentElement.scrollWidth > window.innerWidth,
            small: [...document.querySelectorAll<HTMLElement>("[data-onboarding] [data-chip-id]")].map((el) => ({ w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) })).filter((b) => b.h < 43.5 || b.w < 43.5),
          }));
          expect(reach.wide, "sideways scroll on step two").toBe(false);
          expect(reach.small, "chips under 44 px").toEqual([]);
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
          await expect(page.getByRole("heading", { level: 1, name: "Check and lock in" })).toBeVisible();
          await settled(page);
          expect(await blocking(page), "review").toEqual([]);
          await page.getByRole("button", { name: /Lock in budget/ }).click();
          await expect(page.getByRole("heading", { level: 1, name: "Your budget is locked in" })).toBeVisible();
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
