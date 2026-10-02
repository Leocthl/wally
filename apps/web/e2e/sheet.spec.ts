// A sheet follows the finger and never restarts: a short drag that is let go of settles back from where it is (the
// bug it guards: the slide-in replayed from the bottom edge), a long one leaves from where it is, and Escape still closes.
import { expect, test, type Page } from "@playwright/test";

/** Records the sheet's top edge on every frame until stopped. */
async function recordTop(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __tops: number[]; __stop: boolean };
    w.__tops = [];
    w.__stop = false;
    const tick = (): void => {
      const el = document.querySelector('[role="dialog"]');
      if (el) w.__tops.push(Math.round(el.getBoundingClientRect().top));
      if (!w.__stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function tops(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __tops: number[]; __stop: boolean };
    w.__stop = true;
    return w.__tops;
  });
}

test("a short drag settles from where it is and never leaves the screen", async ({ page, isMobile }) => {
  test.skip(isMobile, "the pointer drag is driven with the mouse on the desktop project");
  await page.goto("/?api=mock#/budget");
  await page.getByRole("button", { name: "About and settings" }).click();
  const dialog = page.getByRole("dialog", { name: "About Wally" });
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(700);
  const rest = Math.round((await dialog.boundingBox())?.y ?? 0);
  const handle = await page.locator(".w-sheet__top").boundingBox();
  if (!handle) throw new Error("no handle");
  const x = handle.x + handle.width / 2;
  const y = handle.y + 10;
  await recordTop(page);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 25, { steps: 5 });
  await page.mouse.move(x, y + 60, { steps: 5 });
  await page.waitForTimeout(250);
  const held = Math.round((await dialog.boundingBox())?.y ?? 0);
  expect(held).toBeGreaterThan(rest + 40);
  await page.mouse.up();
  await page.waitForTimeout(900);
  const frames = await tops(page);
  // The release never throws the sheet further down than the finger had it, and it ends at rest.
  expect(Math.max(...frames)).toBeLessThanOrEqual(held + 2);
  expect(frames.at(-1)).toBeLessThanOrEqual(rest + 2);
  await expect(dialog).toBeVisible();
});

test("a long drag closes the sheet, and so does Escape", async ({ page, isMobile }) => {
  test.skip(isMobile, "the pointer drag is driven with the mouse on the desktop project");
  await page.goto("/?api=mock#/budget");
  await page.getByRole("button", { name: "About and settings" }).click();
  const dialog = page.getByRole("dialog", { name: "About Wally" });
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(600);
  const handle = await page.locator(".w-sheet__top").boundingBox();
  if (!handle) throw new Error("no handle");
  const x = handle.x + handle.width / 2;
  const y = handle.y + 10;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 140, { steps: 8 });
  await page.mouse.up();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "About and settings" }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
