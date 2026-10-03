// Show Wally a photo at large text on a 390x844 phone, in on-device mode (the colour plates and the item-type chips do the work, no
// model). With its lead sentence and its buy bar around it, the sheet once left a 17 px scroll area at 200% text, and 0 px after a
// pick, so the cards could not be reached and the Buy button was off the screen; the cards also spilled out of their borders. In
// English and 繁體, at 100%, 150% and 200% (and 200% in dark), before a pick (the hint) and after one (the buy bar): the scroll area
// keeps 200 px or more, the last card can be tapped, the Buy button stays on the screen at 44 px or more, the words of the buy bar
// scroll (as a tab stop) only at 200% and reach their last line, nothing scrolls sideways, and axe finds nothing serious or critical.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { NAVY_PICTURE } from "./support/pictures";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const SHOTS = process.env["PHOTO_SHOTS_DIR"];
const VIEW = { width: 390, height: 844 } as const;
/** About a card's picture and name: the least a thumb needs to scroll in. */
const MIN_SCROLL_PX = 200;
const MIN_TAP_PX = 44;
const LANGUAGES = [{ lang: "en", name: "English" }, { lang: "zh-HK", name: "繁體" }] as const;
const CASES = [{ scale: 100, scheme: "light" }, { scale: 150, scheme: "light" }, { scale: 200, scheme: "light" }, { scale: 200, scheme: "dark" }] as const;
/** From this text size the buy bar's words are taller than the room (the bar is capped at a third of the screen). */
const WORDS_SCROLL_FROM = 200;

async function blocking(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return result.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.impact} ${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
}

/** The height of the sheet's scroll area: what is left for the cards once the header, the footer and the lead have their share. */
const scrollArea = (page: Page): Promise<number> => page.evaluate(() => document.querySelector('[role="dialog"] .w-sheet__body')?.clientHeight ?? 0);

/** Parts of the open sheet that are wider than their box (the sheet, its scroll area, its footer and the buy bar). */
const wideParts = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    ['[role="dialog"]', ".w-sheet__body", ".w-sheet__footer", ".photo-buy"].flatMap((selector) => {
      const el = document.querySelector(selector);
      return el !== null && el.scrollWidth > el.clientWidth ? [`${selector} is ${el.scrollWidth}px wide in ${el.clientWidth}px`] : [];
    }),
  );

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS !== undefined) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/** Home, text at `scale` percent, a picture from the "Show Wally a photo" row, and the sheet's answer. */
async function openPhotoSheet(page: Page, lang: string, scale: number): Promise<Locator> {
  await page.addInitScript((value) => window.localStorage.setItem("wally:lang", value), lang);
  await page.goto("/?api=local#/budget");
  await expect(page.getByRole("meter")).toBeVisible();
  if (scale !== 100) await page.addStyleTag({ content: `html { font-size: ${scale}% !important; }` });
  await page.locator('main input[data-slot="photo-file"]').setInputFiles({ name: "look.png", mimeType: "image/png", buffer: NAVY_PICTURE });
  const sheet = page.getByRole("dialog");
  await expect(sheet.locator('[data-slot="photo-ready"]')).toBeVisible();
  return sheet;
}

test.describe("390x844 phone, text size", () => {
  test.use({ viewport: VIEW, deviceScaleFactor: 2 });

  for (const { lang, name } of LANGUAGES) {
    for (const { scale, scheme } of CASES) {
      test(`${name}, text at ${scale}%, ${scheme}: the cards can be reached, the Buy button stays on the screen`, async ({ page }) => {
        test.skip(test.info().project.name !== "phone", "the size is set inside the test");
        await page.emulateMedia({ colorScheme: scheme });
        const tag = `${lang}-${scale}-${scheme}`;
        const sheet = await openPhotoSheet(page, lang, scale);
        await page.waitForTimeout(450);
        await expect.poll(() => scrollArea(page), "scroll area before a type is chosen").toBeGreaterThanOrEqual(MIN_SCROLL_PX);
        await shot(page, `${tag}-1-ready`);

        // Before a pick: four cards and the hint in the footer.
        await sheet.locator('[data-slot="photo-kind"] [data-chip-id="jacket"]').click();
        const cards = sheet.locator("[data-listing]");
        await expect(cards).toHaveCount(4);
        await expect(sheet.locator('[data-slot="photo-hint"]')).toBeVisible();
        await expect(sheet.locator("[data-refreshing]")).toHaveCount(0);
        await expect.poll(() => scrollArea(page), "scroll area with the hint").toBeGreaterThanOrEqual(MIN_SCROLL_PX);
        expect(await wideParts(page), "wide parts with the hint").toEqual([]);
        await shot(page, `${tag}-2-hint`);

        // The last card is the furthest down: tapping it needs a scroll, and nothing may cover it.
        await cards.nth(3).click();
        await expect(cards.nth(3)).toHaveAttribute("aria-checked", "true");

        // After a pick: the buy bar, with the Buy button on the screen.
        const buy = sheet.locator('[data-slot="photo-buy-button"]');
        await expect(buy).toBeVisible();
        await expect.poll(() => scrollArea(page), "scroll area with the buy bar").toBeGreaterThanOrEqual(MIN_SCROLL_PX);
        expect(await wideParts(page), "wide parts with the buy bar").toEqual([]);
        const box = await buy.boundingBox();
        expect(box?.height ?? 0, "the Buy button is at least 44 px tall").toBeGreaterThanOrEqual(MIN_TAP_PX);
        expect(box?.y ?? -1, "the Buy button starts on the screen").toBeGreaterThanOrEqual(0);
        expect((box?.y ?? VIEW.height) + (box?.height ?? 0), "the Buy button ends above the bottom edge").toBeLessThanOrEqual(VIEW.height);
        await buy.click({ trial: true }); // visible, still, enabled and not covered by anything

        // The words of the bar scroll only when they must (then they are a tab stop), and scrolled to the end, the last line is there.
        const words = sheet.locator('[data-slot="photo-buy-text"]');
        const scrolls = await words.evaluate((el) => el.scrollHeight > el.clientHeight + 1);
        expect(scrolls, "the buy bar's words scroll only at large text").toBe(scale >= WORDS_SCROLL_FROM);
        if (scrolls) await expect(words, "scrolling words are a tab stop").toHaveAttribute("tabindex", "0");
        else await expect(words, "words that fit are not a tab stop").not.toHaveAttribute("tabindex");
        const cutOff = await sheet.locator(".photo-buy__note").evaluate((note) => {
          const host = note.parentElement;
          if (host === null) return "the note has no parent";
          host.scrollTop = host.scrollHeight;
          return note.getBoundingClientRect().bottom <= host.getBoundingClientRect().bottom + 1 ? null : "the end of the note is cut off";
        });
        expect(cutOff, "the sentence about the rules").toBeNull();
        await shot(page, `${tag}-3-picked`);
        expect(await blocking(page), `axe, ${name} at ${scale}%, ${scheme}`).toEqual([]);
      });
    }
  }
});
