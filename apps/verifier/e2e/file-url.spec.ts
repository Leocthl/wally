// T-V1 in a real browser: the ONE built file opened via file:// with the network offline. Load demo log, Verify
// (PASS), Tamper (FAIL at seq 1), Restore (PASS); no request leaves the page, no script error, no CSP violation.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const FILE = join(import.meta.dirname, "..", "dist", "index.html");
const PAGE_URL = pathToFileURL(FILE).href;

interface Watch {
  readonly requests: string[];
  readonly errors: string[];
}

async function open(page: Page): Promise<Watch> {
  if (!existsSync(FILE)) throw new Error("dist/index.html is missing: run `pnpm --filter @laisee/verifier e2e` (it builds first)");
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
  await page.goto(PAGE_URL);
  return watch;
}

const button = (page: Page, name: RegExp) => page.getByRole("button", { name });

test("file://, offline: Load demo log, Verify PASS, Tamper FAIL at seq 1, Restore PASS", async ({ page }) => {
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
  expect(bg).toBe("rgb(14, 20, 26)");
  await button(page, /^Load demo log/).click();
  await button(page, /^Verify/).click();
  const duration = await page.locator(".verdict").evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(duration).toBe("0s");
});
