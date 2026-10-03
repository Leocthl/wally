// Show Wally a photo in a real browser, in on-device mode (the colour plates and the item-type chips do the work, no model):
// a picture chosen in the Ask sheet becomes a few typed words, four similar simulated items, a pick, and a purchase through
// the normal pipeline. Also the empty and error states, both languages, dark mode, reduced motion, the keyboard, and axe at
// phone widths. The pictures are made here (flat colours); no photo of a real product is in the repository.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { NAVY_PICTURE } from "./support/pictures";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const SHOTS = process.env["PHOTO_SHOTS_DIR"];

const NOT_A_PICTURE = Buffer.from("these are notes, not a picture");

async function blocking(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return result.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.impact} ${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
}

/**
 * Why the open sheet scrolls sideways, or null when it does not. The camera button once made the composer wider than the
 * sheet and the grid widened every block with it, so the send button and the cards were clipped at the sheet's edge.
 */
async function sidewaysScroll(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const body = document.querySelector('[role="dialog"] .w-sheet__body');
    if (body === null) return "no sheet body is open";
    return body.scrollWidth > body.clientWidth ? `the sheet body is ${body.scrollWidth}px wide in ${body.clientWidth}px` : null;
  });
}

/** Buttons, radios and fields in the open sheet whose hit area is under 44 px either way (the file input is hidden on purpose). */
async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (dialog === null) return ["no dialog is open"];
    return [...dialog.querySelectorAll('button, [role="radio"], a[href], input:not([type="file"]):not([type="hidden"]), select, textarea, summary')]
      .map((el) => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && box.height > 0 && (box.width < 43.5 || box.height < 43.5))
      .map(({ el, box }) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 30)} ${Math.round(box.width)}x${Math.round(box.height)}`);
  });
}

async function settled(page: Page): Promise<void> {
  await page.waitForTimeout(450);
}

/** Opens the Ask sheet, chooses a picture with the camera button, and waits for the photo sheet. */
async function choose(page: Page, file: { readonly name: string; readonly mimeType: string; readonly buffer: Buffer }): Promise<void> {
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  const ask = page.getByRole("dialog");
  await expect(ask.getByRole("button", { name: "Show Wally a photo" }).first()).toBeVisible();
  await ask.locator('input[data-slot="photo-file"]').first().setInputFiles(file);
}

function phoneOnly(): void {
  test.skip(test.info().project.name !== "phone", "the sizes are set inside the tests");
}

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS !== undefined) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

test.describe("390x844 phone, light", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "light" });

  test.beforeEach(async ({ page }) => {
    await page.goto("/?api=local#/budget");
    await expect(page.getByRole("meter")).toBeVisible();
  });

  test("a picture becomes similar items, a pick and a purchase", async ({ page }) => {
    phoneOnly();
    await shot(page, "01-budget");
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await settled(page);
    await shot(page, "02-ask-sheet");
    expect(await sidewaysScroll(page), "Ask sheet").toBeNull();
    expect(await smallTargets(page), "Ask sheet").toEqual([]);
    await page.keyboard.press("Escape");
    await choose(page, { name: "look.png", mimeType: "image/png", buffer: NAVY_PICTURE });
    const sheet = page.getByRole("dialog", { name: "Show Wally a photo" });
    await expect(sheet).toBeVisible();
    // Wally sees the colours of the picture, and asks what it is (no model reads pictures on the device).
    await expect(sheet.locator('[data-slot="photo-sees"]')).toHaveText("Wally sees the colours. What is it?");
    await expect(sheet.locator('[data-slot="photo-plates"] [data-color="navy"]')).toBeVisible();
    await expect(sheet.locator('[data-slot="photo-privacy"]')).toContainText("Your picture stays on this device and is not saved.");
    await expect(sheet.getByText("Pick the type above to see similar items.")).toBeVisible();
    await settled(page);
    await shot(page, "03-photo-ready-no-kind");
    expect(await blocking(page), "photo sheet, before a type is picked").toEqual([]);
    expect(await smallTargets(page), "photo sheet, before a type is picked").toEqual([]);

    await sheet.getByRole("radio", { name: "hoodie" }).click();
    const cards = sheet.getByRole("radiogroup", { name: "Similar in the shop" }).getByRole("radio");
    await expect(cards).toHaveCount(4);
    await expect(sheet.locator('[data-slot="photo-sees"]')).toContainText("hoodie");
    await expect(cards.first()).toContainText("Navy relaxed hoodie");
    await expect(cards.first()).toContainText("Same type");
    await expect(cards.first()).toContainText("SIMULATED");
    await settled(page);
    await shot(page, "04-photo-matches");
    expect(await blocking(page), "photo sheet, with matches").toEqual([]);
    expect(await sidewaysScroll(page), "photo sheet, with matches").toBeNull();
    expect(await smallTargets(page), "photo sheet, with matches").toEqual([]);

    await cards.first().click();
    await expect(cards.first()).toHaveAttribute("aria-checked", "true");
    const buy = sheet.getByRole("button", { name: "Ask Wally to buy this" });
    await expect(buy).toBeVisible();
    await expect(sheet.locator('[data-slot="photo-buy"]')).toContainText("Navy relaxed hoodie");
    await settled(page);
    await shot(page, "05-photo-picked");
    expect(await blocking(page), "photo sheet, with a pick").toEqual([]);
    expect(await sidewaysScroll(page), "photo sheet, with a pick").toBeNull();
    expect(await smallTargets(page), "photo sheet, with a pick").toEqual([]);

    await buy.click();
    await expect(page).toHaveURL(/#\/wally$/);
    // The normal pipeline decided: the pick is the cart, and an approved cart ends in a one-off card for the exact total.
    const wally = page.locator('[data-screen="wally"]');
    await expect(wally).toContainText("Navy relaxed hoodie", { timeout: 15_000 });
    await expect(wally).toContainText("one-off card");
    await expect(wally).toContainText("SIMULATED");
    await settled(page);
    await shot(page, "06-wally-approved");
  });

  test("a file that is not a picture says so and offers another", async ({ page }) => {
    phoneOnly();
    await choose(page, { name: "notes.png", mimeType: "image/png", buffer: NOT_A_PICTURE });
    const sheet = page.getByRole("dialog", { name: "Show Wally a photo" });
    await expect(sheet.locator('[data-slot="photo-problem"]')).toContainText("That file could not be read as a picture.");
    await expect(sheet.getByRole("button", { name: "Choose another picture" })).toBeVisible();
    await settled(page);
    await shot(page, "07-unreadable");
    expect(await blocking(page), "photo sheet, unreadable").toEqual([]);
  });

  test("a type the shop has nothing in says so; more details change the list", async ({ page }) => {
    phoneOnly();
    await choose(page, { name: "look.png", mimeType: "image/png", buffer: NAVY_PICTURE });
    const sheet = page.getByRole("dialog", { name: "Show Wally a photo" });
    await sheet.getByRole("radio", { name: "dress" }).click();
    const cards = sheet.getByRole("radiogroup", { name: "Similar in the shop" }).getByRole("radio");
    await expect(cards.first()).toContainText("dress");
    await sheet.getByText("More details").click();
    await sheet.getByRole("button", { name: "relaxed" }).click();
    await expect(sheet.getByRole("button", { name: "relaxed" })).toHaveAttribute("aria-pressed", "true");
    await settled(page);
    await shot(page, "08-more-details");
    expect(await blocking(page), "photo sheet, more details open").toEqual([]);
  });

  test("the type chips work from the keyboard: arrows move and choose", async ({ page }) => {
    phoneOnly();
    await choose(page, { name: "look.png", mimeType: "image/png", buffer: NAVY_PICTURE });
    const sheet = page.getByRole("dialog", { name: "Show Wally a photo" });
    const first = sheet.getByRole("radio", { name: "tee" });
    await first.focus();
    await page.keyboard.press("ArrowRight");
    await expect(sheet.getByRole("radio", { name: "shirt" })).toBeFocused();
    await expect(sheet.getByRole("radio", { name: "shirt" })).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("ArrowLeft");
    await expect(first).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });

  test("Wally is looking while the picture is read, and the person can cancel", async ({ page }) => {
    phoneOnly();
    await page.addInitScript(() => {
      const original = window.createImageBitmap.bind(window);
      window.createImageBitmap = (async (...args: Parameters<typeof createImageBitmap>) => {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return original(...args);
      }) as typeof createImageBitmap;
    });
    await page.reload();
    await expect(page.getByRole("meter")).toBeVisible();
    await choose(page, { name: "look.png", mimeType: "image/png", buffer: NAVY_PICTURE });
    const sheet = page.getByRole("dialog", { name: "Show Wally a photo" });
    await expect(sheet.locator('[data-slot="photo-looking"]')).toContainText("Wally is looking");
    await shot(page, "09-looking");
    expect(await blocking(page), "photo sheet, looking").toEqual([]);
    await sheet.getByRole("button", { name: "Cancel" }).click();
    await expect(sheet).toBeHidden();
    await page.waitForTimeout(1800);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

for (const scheme of ["dark", "light"] as const) {
  test.describe(`390x844 phone, ${scheme}, 繁體`, () => {
    test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme });

    test(`the same flow in Chinese, ${scheme}`, async ({ page }) => {
      phoneOnly();
      await page.addInitScript(() => window.localStorage.setItem("wally:lang", "zh-HK"));
      await page.goto("/?api=local#/budget");
      await expect(page.getByRole("meter")).toBeVisible();
      await page.getByRole("button", { name: "問 Wally", exact: true }).click();
      const ask = page.getByRole("dialog");
      await ask.locator('input[data-slot="photo-file"]').first().setInputFiles({ name: "look.png", mimeType: "image/png", buffer: NAVY_PICTURE });
      const sheet = page.getByRole("dialog", { name: "俾 Wally 睇相" });
      await expect(sheet).toBeVisible();
      await expect(sheet.locator('[data-slot="photo-sees"]')).toHaveText("Wally 見到顏色。係乜嘢款式？");
      await sheet.getByRole("radio", { name: "衛衣" }).click();
      const cards = sheet.getByRole("radiogroup", { name: "商店入面相似的款式" }).getByRole("radio");
      await expect(cards).toHaveCount(4);
      await expect(cards.first()).toContainText("海軍藍寬鬆衛衣");
      await cards.first().click();
      await expect(sheet.getByRole("button", { name: "叫 Wally 買呢件" })).toBeVisible();
      await settled(page);
      await shot(page, `10-zh-${scheme}-picked`);
      expect(await blocking(page), `photo sheet, zh-HK ${scheme}`).toEqual([]);
      expect(await smallTargets(page), `photo sheet, zh-HK ${scheme}`).toEqual([]);
      expect(await sidewaysScroll(page), `photo sheet, zh-HK ${scheme}`).toBeNull();
    });
  });
}

test.describe("reduced motion", () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });

  test("the looking animation does not run", async ({ page }) => {
    phoneOnly();
    await page.addInitScript(() => {
      const original = window.createImageBitmap.bind(window);
      window.createImageBitmap = (async (...args: Parameters<typeof createImageBitmap>) => {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        return original(...args);
      }) as typeof createImageBitmap;
    });
    await page.goto("/?api=local#/budget");
    await expect(page.getByRole("meter")).toBeVisible();
    await choose(page, { name: "look.png", mimeType: "image/png", buffer: NAVY_PICTURE });
    const scan = page.locator(".photo-looking__scan");
    await expect(scan).toBeVisible();
    expect(await scan.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  });
});

test.describe("widths and dark, axe", () => {
  for (const viewport of [{ width: 360, height: 740 }, { width: 430, height: 932 }]) {
    for (const scheme of ["light", "dark"] as const) {
      test.describe(`${viewport.width}x${viewport.height} ${scheme}`, () => {
        test.use({ viewport, colorScheme: scheme });

        test("Ask sheet with the photo entry, and the photo sheet with a pick", async ({ page }) => {
          phoneOnly();
          await page.goto("/?api=local#/budget");
          await expect(page.getByRole("meter")).toBeVisible();
          await page.getByRole("button", { name: "Ask", exact: true }).click();
          await settled(page);
          expect(await blocking(page), "ask sheet with the photo entry").toEqual([]);
          expect(await sidewaysScroll(page), "ask sheet with the photo entry").toBeNull();
          expect(await smallTargets(page), "ask sheet with the photo entry").toEqual([]);
          await shot(page, `w${viewport.width}-${scheme}-ask`);
          const ask = page.getByRole("dialog");
          await ask.locator('input[data-slot="photo-file"]').first().setInputFiles({ name: "look.png", mimeType: "image/png", buffer: NAVY_PICTURE });
          const sheet = page.getByRole("dialog", { name: "Show Wally a photo" });
          await sheet.getByRole("radio", { name: "jacket" }).click();
          const cards = sheet.getByRole("radiogroup", { name: "Similar in the shop" }).getByRole("radio");
          await expect(cards).toHaveCount(4);
          await cards.nth(1).click();
          await settled(page);
          expect(await blocking(page), "photo sheet with a pick").toEqual([]);
          expect(await sidewaysScroll(page), "photo sheet with a pick").toBeNull();
          expect(await smallTargets(page), "photo sheet with a pick").toEqual([]);
          await shot(page, `w${viewport.width}-${scheme}-picked`);
        });
      });
    }
  }
});

test.describe("the Budget screen card", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  test("Show Wally a photo is in Try asking and opens the same sheet", async ({ page }) => {
    phoneOnly();
    await page.goto("/?api=local#/budget");
    await expect(page.getByRole("meter")).toBeVisible();
    const card = page.locator('main [data-slot="photo-card"]');
    await card.scrollIntoViewIfNeeded();
    await expect(card).toContainText("Show Wally a photo");
    await settled(page);
    await shot(page, "11-budget-try-asking");
    expect(await blocking(page), "budget with the photo card").toEqual([]);
    await page.locator('main input[data-slot="photo-file"]').setInputFiles({ name: "look.png", mimeType: "image/png", buffer: NAVY_PICTURE });
    await expect(page.getByRole("dialog", { name: "Show Wally a photo" })).toBeVisible();
  });
});
