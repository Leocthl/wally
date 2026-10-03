// "Why trust Wally?" (#/evidence) in a real browser (production build, offline). Plain words are the default: a headline,
// a key to the three layers and one card per idea, with the developer view one tap away under "How we know" (and as the
// whole page with `?dev=1` or the About switch). Both views keep every control at 44 px and never scroll sideways at 360 px,
// and the presenter's DM8 and DM9 beats render in both. Screenshots go to the test output folder, never into the repo.
import { expect, test, type Page } from "@playwright/test";

const TARGETS = "button, a[href], select, input, textarea, summary";
const PLAIN = "/#/evidence";
const DEVELOPER = "/?dev=1#/evidence";

/** Opens "How we know" (the developer view in place) and waits until it is mounted. */
async function openHowWeKnow(page: Page): Promise<void> {
  await page.getByText("How we know").click();
  await expect(page.locator(".ev-harness")).toBeVisible();
}

async function openAllDetails(page: Page): Promise<void> {
  await page.locator("details").evaluateAll((all) => all.forEach((d) => ((d as HTMLDetailsElement).open = true)));
}

test("plain by default: the headline, the key to the layers, and one card per idea, with no engineers' words", async ({ page }, info) => {
  await page.goto(PLAIN);
  await expect(page.getByRole("heading", { level: 1, name: "Why trust Wally?" })).toBeVisible();
  await expect(page.locator('[data-screen="evidence"]')).toHaveAttribute("data-mode", "plain");
  const hero = page.locator('[data-plain-card="hero"]');
  await expect(hero.getByRole("heading", { level: 2 })).toContainText("On our own test set, Wally");
  // The page opens on the headline and a short list: each idea sits behind its title (and "Where Wally still gets it wrong" is open).
  await expect(page.locator("details[data-fold]")).toHaveCount(6);
  await expect(page.locator("details[data-fold][open]")).toHaveCount(0);
  await expect(page.locator('[data-plain-card="wrong"]')).toBeVisible();
  await expect(page.locator('[data-plain-card="limit"]')).not.toBeVisible();
  // Open the plain folds only: "How we know" is the developer view, and has the engineers' words on purpose.
  await page.locator("details[data-fold]").evaluateAll((all) => all.forEach((d) => ((d as HTMLDetailsElement).open = true)));
  await expect(page.locator('[data-plain-card="layers"] dt')).toHaveText(["Rules only", "Wally", "Bare AI judge"]);
  for (const id of ["limit", "risky", "tricks", "honest", "speed", "wrong"]) await expect(page.locator(`[data-plain-card="${id}"]`)).toBeAttached();
  const visible = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  expect(visible).not.toMatch(/\b(B0|B1|B2|CI|p50|p95|T-H\d|F38|seed|commit|deterministic|pipeline|JSON)\b|MEASURED\(/);
  expect(visible).toMatch(/up to about \d+ in a hundred/);
  await page.screenshot({ path: info.outputPath("evidence-plain.png"), fullPage: true });
});

test("a chip says where the numbers come from, and opens what that means", async ({ page }) => {
  await page.goto(PLAIN);
  await page.locator('details[data-fold="honest"] summary').click();
  const card = page.locator('[data-plain-card="honest"]');
  const chip = card.getByRole("button", { name: /Measured on \d+ scripted test purchases/ });
  await chip.scrollIntoViewIfNeeded();
  await expect(chip).toHaveAttribute("aria-expanded", "false");
  await chip.click();
  await expect(chip).toHaveAttribute("aria-expanded", "true");
  await expect(card.locator(".evp-chipdetail")).toContainText("we counted the results ourselves");
});

test("How we know opens the developer view in place", async ({ page }, info) => {
  await page.goto(PLAIN);
  await expect(page.locator(".ev-harness")).toHaveCount(0);
  await openHowWeKnow(page);
  await expect(page.locator("[data-headline-card]")).toBeVisible();
  await expect(page.locator("[data-pick-reason]")).toContainText("Showing harness-");
  await page.screenshot({ path: info.outputPath("evidence-how-we-know.png"), fullPage: true });
});

test("the developer view, whole page, with ?dev=1: run picker, charts and the judge panel", async ({ page }, info) => {
  await page.goto(DEVELOPER);
  await expect(page.getByRole("heading", { level: 1, name: "Why trust Wally?" })).toBeVisible();
  await expect(page.locator('[data-screen="evidence"]')).toHaveAttribute("data-mode", "developer");
  await expect(page.locator("[data-headline-card]")).toBeVisible();
  await expect(page.locator("[data-pick-reason]")).toContainText("Showing harness-");
  await expect(page.locator("figure.ev-chart").first()).toBeVisible();
  await page.screenshot({ path: info.outputPath("evidence.png"), fullPage: true });
  const judge = page.locator("[data-judge-panel]");
  await expect(judge.locator("[data-judge-verdict]")).toContainText("target [F38] is");
  await judge.screenshot({ path: info.outputPath("judge-panel.png") });
});

test("the About switch turns technical details on and off, and remembers the choice", async ({ page }) => {
  await page.goto("/#/budget");
  await page.getByRole("button", { name: /About and settings/ }).click();
  const sheet = page.getByRole("dialog");
  const toggle = sheet.getByRole("switch", { name: "Show technical details" });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(sheet.getByText("Technical notes")).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(sheet.getByText("Technical notes")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto(PLAIN);
  await expect(page.locator('[data-screen="evidence"]')).toHaveAttribute("data-mode", "developer");
  await page.reload();
  await expect(page.locator('[data-screen="evidence"]')).toHaveAttribute("data-mode", "developer");
  await page.getByRole("button", { name: /About and settings/ }).click();
  await page.getByRole("dialog").getByRole("switch", { name: "Show technical details" }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-screen="evidence"]')).toHaveAttribute("data-mode", "plain");
  await expect(page.locator('[data-plain-card="hero"]')).toBeVisible();
});

for (const [name, url, open] of [
  ["plain", PLAIN, openHowWeKnow],
  ["developer", DEVELOPER, openAllDetails],
] as const) {
  test(`no control on the ${name} evidence screen is under 44 px`, async ({ page }) => {
    await page.goto(url);
    await expect(page.locator('[data-screen="evidence"]')).toBeVisible();
    await open(page);
    await openAllDetails(page);
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

  test(`the ${name} evidence screen does not scroll sideways at 360 px, with every panel open`, async ({ page }, info) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(url);
    await expect(page.locator('[data-screen="evidence"]')).toBeVisible();
    await open(page);
    await openAllDetails(page);
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
    await page.screenshot({ path: info.outputPath(`evidence-${name}-360.png`), fullPage: true });
  });
}

async function stepToDm8(page: Page): Promise<void> {
  const step = page.getByRole("button", { name: /^Step/ });
  for (let i = 0; i < 10; i += 1) {
    await expect(step).toBeEnabled();
    await step.click();
  }
}

test("the presenter steps to DM8 and DM9 in plain words", async ({ page }, info) => {
  await page.goto("/#/presenter");
  await stepToDm8(page);
  await expect(page.locator('[data-beat="DM8"] [data-plain-card]').first()).toBeVisible();
  expect(await page.locator('[data-beat="DM8"] [data-plain-card]').count()).toBeGreaterThanOrEqual(4);
  await page.screenshot({ path: info.outputPath("dm8-plain.png"), fullPage: false });
  await page.getByRole("button", { name: /^Step/ }).click();
  await expect(page.locator('[data-beat="DM9"] [data-dm9]')).toHaveCount(3);
  await page.screenshot({ path: info.outputPath("dm9.png"), fullPage: false });
});

test("the presenter steps to DM8 and DM9 for engineers with ?dev=1", async ({ page }, info) => {
  await page.goto("/?dev=1#/presenter");
  await stepToDm8(page);
  await expect(page.locator('[data-beat="DM8"] [data-big]')).toHaveCount(3);
  await page.screenshot({ path: info.outputPath("dm8.png"), fullPage: false });
  await page.getByRole("button", { name: /^Step/ }).click();
  await expect(page.locator('[data-beat="DM9"] [data-dm9]')).toHaveCount(3);
});
