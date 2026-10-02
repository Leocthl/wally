// The production build is ONE self-contained index.html: one classic inline script, one inline style, a CSP
// that forbids network access (hashes match the inline code), no forbidden API anywhere, and the inlined script
// alone runs the judge flow (Load demo log, Verify PASS, Tamper FAIL, Restore PASS) with no network call.
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { forbiddenApis } from "../build/scan";

// join on import.meta.dirname: Vite rewrites `new URL(path, import.meta.url)` into a served asset URL.
const ROOT = join(import.meta.dirname, "..");
let outDir = "";
let html = "";
let page: Document;

const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("base64");
const cspOf = (doc: Document): string => doc.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content") ?? "";

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), "laisee-verifier-build-"));
  await build({ root: ROOT, configFile: join(ROOT, "vite.config.ts"), logLevel: "silent", build: { outDir, emptyOutDir: true } });
  html = readFileSync(join(outDir, "index.html"), "utf8");
  page = new DOMParser().parseFromString(html, "text/html");
});

afterAll(() => {
  rmSync(outDir, { recursive: true, force: true });
});

describe("built page: one self-contained file", () => {
  it("writes only index.html", () => {
    expect(readdirSync(outDir)).toEqual(["index.html"]);
  });

  it("has one classic inline script and one inline style, nothing loaded from elsewhere", () => {
    const scripts = [...page.querySelectorAll("script")];
    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.hasAttribute("src")).toBe(false);
    expect(scripts[0]?.hasAttribute("type")).toBe(false);
    expect(page.querySelectorAll("style")).toHaveLength(1);
    expect(page.querySelectorAll("link, img, iframe, base, form")).toHaveLength(0);
    expect(page.querySelector("style")?.textContent).toContain("--ledger-bg");
  });

  it("contains no network or external-load API (fetch, XHR, WebSocket, EventSource, sendBeacon, ...)", () => {
    expect(forbiddenApis(html)).toEqual([]);
    expect(html).not.toMatch(/process\.env/);
  });

  it("forbids network access in its CSP and allows only the hashed inline code", () => {
    const csp = cspOf(page);
    for (const directive of ["default-src 'none'", "connect-src 'none'", "img-src 'none'", "font-src 'none'", "form-action 'none'", "base-uri 'none'"]) {
      expect(csp).toContain(directive);
    }
    expect(csp).not.toMatch(/unsafe-inline|https?:|\*/);
    expect(csp).toContain(`'sha256-${sha256(page.querySelector("script")?.textContent ?? "")}'`);
    expect(csp).toContain(`style-src 'sha256-${sha256(page.querySelector("style")?.textContent ?? "")}'`);
  });

  it("puts the CSP before any script or style", () => {
    expect(html.indexOf("Content-Security-Policy")).toBeLessThan(html.indexOf("<style>"));
    expect(html.indexOf("Content-Security-Policy")).toBeLessThan(html.indexOf("<script>"));
  });
});

describe("built page: the inlined script runs the judge flow with no network", () => {
  it("Load demo log, Verify PASS, Tamper FAIL at seq 1, Restore PASS", () => {
    const spies = [vi.fn(), vi.fn(), vi.fn(), vi.fn()];
    vi.stubGlobal("fetch", spies[0]);
    vi.stubGlobal("XMLHttpRequest", spies[1]);
    vi.stubGlobal("WebSocket", spies[2]);
    vi.stubGlobal("EventSource", spies[3]);
    document.body.replaceChildren(...[...page.body.children].filter((n) => n.tagName !== "SCRIPT").map((n) => document.importNode(n, true)));
    new Function(page.querySelector("script")?.textContent ?? "")();
    const click = (action: string): void => document.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)?.click();
    const outcome = (): string | null | undefined => document.querySelector("[data-outcome]")?.getAttribute("data-outcome");
    click("demo");
    click("verify");
    expect(outcome()).toBe("pass");
    click("tamper");
    expect(outcome()).toBe("fail");
    expect(document.querySelector("[data-failed-seq]")?.getAttribute("data-failed-seq")).toBe("1");
    click("restore");
    expect(outcome()).toBe("pass");
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });
});
