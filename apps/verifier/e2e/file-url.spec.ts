// T-V1 in a real browser: the ONE built file opened via file:// with the network offline. Load demo log, Verify
// (PASS), Tamper (FAIL at seq 1), Restore (PASS); no request leaves the page, no script error, no CSP violation.
// The page opens in plain mode (everyday words) unless told otherwise. The flows that pin the technical wording open it
// with `?dev=1` (developer mode); the plain flows open the bare file URL, with nothing remembered (each test is a new context).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const FILE = join(import.meta.dirname, "..", "dist", "index.html");
const PLAIN_URL = pathToFileURL(FILE).href;
const PAGE_URL = `${PLAIN_URL}?dev=1`;

interface Watch {
  readonly requests: string[];
  readonly errors: string[];
}

async function open(page: Page, url: string = PAGE_URL): Promise<Watch> {
  if (!existsSync(FILE)) throw new Error("dist/index.html is missing: run `pnpm --filter @wally/verifier e2e` (it builds first)");
  const watch: Watch = { requests: [], errors: [] };
  page.on("request", (r) => watch.requests.push(r.url()));
  page.on("pageerror", (e) => watch.errors.push(e.message));
  page.on("console", (m) => (m.type() === "error" ? watch.errors.push(m.text()) : undefined));
  await page.addInitScript(() => {
    const seen: string[] = [];
    Object.defineProperty(window, "__cspViolations", { value: seen });
    document.addEventListener("securitypolicyviolation", (e) => seen.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  await page.context().setOffline(true);
  await page.goto(url);
  return watch;
}

const button = (page: Page, name: RegExp) => page.getByRole("button", { name });

test("file://, offline, developer mode (?dev=1): Load demo log, Verify PASS, Tamper FAIL at seq 1, Restore PASS", async ({ page }) => {
  const watch = await open(page);
  await expect(page.locator('[data-outcome="idle"]')).toBeVisible();
  await button(page, /^Load demo log/).click();
  await button(page, /^Verify/).click();
  const status = page.locator("#result");
  await expect(status).toHaveAttribute("role", "status");
  await expect(status.locator('[data-outcome="pass"]')).toContainText("PASS");
  await expect(status).toContainText("10 (seq 0 to 9)");
  await button(page, /^Tamper/).click();
  const fail = status.locator('[data-outcome="fail"]');
  await expect(fail).toHaveAttribute("data-failed-seq", "1");
  await expect(fail).toHaveAttribute("data-reason", "PAYLOAD_HASH");
  await expect(fail).toContainText("Chain broken at entry 1");
  await expect(page.locator(".tamper-note")).toContainText("payload.approved_limit_minor");
  await expect(page.locator('.row[data-index="1"]')).toHaveAttribute("data-status", "broken");
  await button(page, /^Restore/).click();
  await expect(status.locator('[data-outcome="pass"]')).toBeVisible();
  expect(watch.requests.filter((url) => url !== PAGE_URL)).toEqual([]);
  expect(watch.errors).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations)).toEqual([]);
});

test("controls are at least 44px and the page never scrolls sideways", async ({ page }) => {
  await open(page);
  await button(page, /^Load demo log/).click();
  await button(page, /^Verify/).click();
  for (const control of await page.locator("button, input[type=file]").all()) {
    const box = await control.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("dark scheme and reduced motion come from the tokens", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await open(page);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(11, 18, 32)");
  await button(page, /^Load demo log/).click();
  await button(page, /^Verify/).click();
  const verdict = page.locator(".verdict");
  expect(await verdict.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0s");
  expect(await verdict.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});

test("EN | 繁 switches the whole page to one language, is remembered, and needs no network", async ({ page }) => {
  const watch = await open(page);
  const group = page.getByRole("radiogroup", { name: "Language" });
  await expect(group.getByRole("radio", { name: "English" })).toHaveAttribute("aria-checked", "true");
  await expect(button(page, /^Verify/)).toBeVisible();
  await expect(button(page, /^驗證/)).toHaveCount(0); // the zh-HK text is in the page but hidden, so it has no role or name
  await group.getByRole("radio", { name: "繁體中文" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-HK");
  await expect(page.locator("html")).toHaveAttribute("data-lang", "zh-HK");
  await expect(button(page, /^驗證/)).toBeVisible();
  await expect(button(page, /^Verify/)).toHaveCount(0);
  // useInnerText: only the text that is on screen counts (both languages are in the DOM; CSS hides one).
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("收據驗證", { useInnerText: true });
  expect(await page.evaluate(() => window.localStorage.getItem("wally:lang"))).toBe("zh-HK");
  await button(page, /^載入示範紀錄/).click();
  await button(page, /^驗證/).click();
  await expect(page.locator("#result")).toContainText("驗證通過", { useInnerText: true });
  await expect(page.locator("#result")).not.toContainText("PASS", { useInnerText: true });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-HK");
  await group.getByRole("radio", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(watch.requests.filter((url) => url !== PAGE_URL)).toEqual([]);
  expect(watch.errors).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations)).toEqual([]);
});

test("a zh-HK browser starts in 繁 with nothing remembered", async ({ browser }) => {
  const context = await browser.newContext({ locale: "zh-HK" });
  const page = await context.newPage();
  await open(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-HK");
  await expect(page.getByRole("radio", { name: "繁體中文" })).toHaveAttribute("aria-checked", "true");
  await context.close();
});

test("each file pill opens the chooser on a real mouse click and loads what it is given", async ({ page }) => {
  const watch = await open(page);
  const cases = [
    { field: "log", name: "my-receipts.jsonl", text: '{"a":1}\n' },
    { field: "keys", name: "my-keys.json", text: '{"b":2}' },
    { field: "checkpoint", name: "my-checkpoint.json", text: '{"c":3}' },
  ];
  for (const { field, name, text } of cases) {
    // The invisible input sits on its label. A press must keep reaching the input (the label is pressed down with
    // :active, and a transformed label must not steal the mouse-up): the chooser opens only if click lands on it.
    const chooser = page.waitForEvent("filechooser");
    await page.locator(`#${field}-file`).click();
    await (await chooser).setFiles({ name, mimeType: "text/plain", buffer: Buffer.from(text) });
    await expect(page.locator(`#${field}-source`)).toContainText(name);
    await expect(page.locator(`#${field}-text`)).toHaveValue(text);
  }
  expect(watch.requests.filter((url) => url !== PAGE_URL)).toEqual([]);
  expect(watch.errors).toEqual([]);
});

test("motion: nothing moves on the empty page; PASS and FAIL move only transform and opacity, from CSS, with no CSP violation", async ({ page }) => {
  const watch = await open(page);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await button(page, /^Load demo log/).click();
  await button(page, /^Verify/).click();
  const pass = page.locator(".verdict--pass");
  expect(await pass.evaluate((el) => getComputedStyle(el).animationName)).toBe("rise");
  expect(await pass.evaluate((el) => getComputedStyle(el).animationDuration)).toBe("0.26s");
  const moved = await page.evaluate(() => {
    const props = new Set<string>();
    for (const animation of document.getAnimations()) {
      for (const frame of (animation.effect as KeyframeEffect).getKeyframes()) for (const key of Object.keys(frame)) props.add(key);
    }
    return { count: document.getAnimations().length, props: [...props].sort() };
  });
  expect(moved.count).toBeGreaterThan(10); // the verdict, its disc, ten rows and their discs
  expect(moved.props.filter((p) => !["offset", "computedOffset", "easing", "composite", "opacity", "transform"].includes(p))).toEqual([]);
  await expect(page.locator(".timeline .row--ok")).toHaveCount(10);
  await button(page, /^Tamper/).click();
  const broken = page.locator(".row--broken");
  await expect(broken).toHaveCount(1);
  expect(await broken.evaluate((el) => getComputedStyle(el).animationName)).toBe("row-land");
  expect(await page.locator(".row--unchecked").first().evaluate((el) => getComputedStyle(el).animationName)).toBe("row-fade");
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState === "finished"));
  expect(watch.errors).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations)).toEqual([]);
});

// ---------- Plain mode: the page's default ----------

const toggle = (page: Page) => page.getByRole("switch", { name: "Show technical details" });

test("plain is the default: sample, check, change one receipt, put it back; the switch shows the technical page", async ({ page }) => {
  const watch = await open(page, PLAIN_URL);
  await expect(page.locator("html")).toHaveAttribute("data-mode", "plain");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Receipt checker", { useInnerText: true });
  await expect(toggle(page)).toHaveAttribute("aria-checked", "false");
  await expect(page.locator('[data-outcome="idle"]')).toContainText("Not checked yet");
  // The three boxes are folded away until asked for.
  await expect(page.locator("details.inputs__more")).not.toHaveAttribute("open", "");
  await expect(page.locator("#log-text")).toBeHidden();

  await button(page, /^Try the sample receipts/).click();
  await button(page, /^Check the receipts/).click();
  const status = page.locator("#result");
  await expect(status.locator('[data-outcome="pass"]')).toContainText("PASS");
  await expect(status).toContainText("All 10 receipts are untouched");
  await expect(page.locator(".timeline .row")).toHaveCount(10);
  await expect(page.locator(".timeline .row").first()).toContainText("Receipt 1");
  await expect(page.locator(".timeline .row").first()).toContainText("Budget sealed");
  await expect(page.locator(".timeline .row").first()).toContainText("3 Oct 2026, 10:00");

  await button(page, /^Try changing one receipt/).click();
  const fail = status.locator('[data-outcome="fail"]');
  await expect(fail).toContainText("Changed at receipt 2"); // seq 1 in the demo log is the first receipt to break
  await expect(fail).toHaveAttribute("data-failed-seq", "1");
  await expect(fail).toHaveAttribute("data-reason", "PAYLOAD_HASH");
  await expect(page.locator(".tamper-note")).toContainText("HK$259");
  await expect(page.locator(".tamper-note")).toContainText("HK$359");
  await expect(page.locator(".tamper-note code")).toHaveCount(0);
  await expect(page.locator('.row[data-index="1"]')).toHaveAttribute("data-status", "broken");
  // The code and the library's words are in a closed block until "Show the details" is pressed.
  await expect(fail.locator("code")).toBeHidden();
  await fail.locator("summary").click();
  await expect(fail.locator("code")).toHaveText("PAYLOAD_HASH");

  await button(page, /^Put it back/).click();
  await expect(status.locator('[data-outcome="pass"]')).toContainText("All 10 receipts are untouched");

  // The switch: technical page, verdict kept, focus kept, nothing replayed, choice remembered.
  await toggle(page).click();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "developer");
  await expect(toggle(page)).toHaveAttribute("aria-checked", "true");
  await expect(toggle(page)).toBeFocused();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Receipt verifier", { useInnerText: true });
  await expect(status.locator('[data-outcome="pass"]')).toContainText("PASS");
  await expect(status).toContainText("Chain verified");
  await expect(page.locator(".timeline .row").first()).toContainText("MANDATE_SEALED");
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  expect(await page.evaluate(() => window.localStorage.getItem("wally:mode"))).toBe("developer");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "developer");
  await toggle(page).click();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "plain");
  expect(watch.requests.filter((url) => url !== PLAIN_URL)).toEqual([]);
  expect(watch.errors).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations)).toEqual([]);
});

test("the switch works from the keyboard (Space and Enter), and the choice follows the language", async ({ page }) => {
  await open(page, PLAIN_URL);
  await toggle(page).focus();
  await page.keyboard.press("Space");
  await expect(page.locator("html")).toHaveAttribute("data-mode", "developer");
  await expect(toggle(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-mode", "plain");
  await expect(toggle(page)).toBeFocused();
  await page.getByRole("radiogroup", { name: "Language" }).getByRole("radio", { name: "繁體中文" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("收據檢查", { useInnerText: true });
  await expect(page.getByRole("switch", { name: "顯示技術細節" })).toBeVisible();
  await button(page, /^試用示範收據/).click();
  await button(page, /^檢查收據/).click();
  await expect(page.locator("#result")).toContainText("全部 10 張收據都完好無缺", { useInnerText: true });
  await button(page, /^試改動一張收據/).click();
  await expect(page.locator("#result")).toContainText("第 2 張收據被改動", { useInnerText: true });
});

test("plain mode: buttons, the switch and the folded blocks are 44px tall, and the page never scrolls sideways", async ({ page }) => {
  await open(page, PLAIN_URL);
  await button(page, /^Try the sample receipts/).click();
  await button(page, /^Check the receipts/).click();
  await button(page, /^Try changing one receipt/).click();
  for (const control of await page.locator("button, summary").all()) {
    const box = await control.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("plain mode: an empty check opens the folded boxes and says which box is the problem", async ({ page }) => {
  await open(page, PLAIN_URL);
  await button(page, /^Check the receipts/).click();
  await expect(page.locator('[data-outcome="input-error"]')).toContainText("There are no receipts to check yet");
  await expect(page.locator("details.inputs__more")).toHaveAttribute("open", "");
  await expect(page.locator("#log-error")).toBeVisible();
});

test("plain mode still loads a file from the folded boxes", async ({ page }) => {
  const watch = await open(page, PLAIN_URL);
  await page.locator("details.inputs__more > summary").click();
  const chooser = page.waitForEvent("filechooser");
  await page.locator("#log-file").click();
  await (await chooser).setFiles({ name: "my-receipts.jsonl", mimeType: "text/plain", buffer: Buffer.from('{"a":1}\n') });
  await expect(page.locator("#log-source")).toContainText("Loaded from file my-receipts.jsonl");
  await expect(page.locator("#log-text")).toHaveValue('{"a":1}\n');
  expect(watch.requests.filter((url) => url !== PLAIN_URL)).toEqual([]);
  expect(watch.errors).toEqual([]);
});
