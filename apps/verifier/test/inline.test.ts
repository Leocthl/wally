// Unit tests for the single-file build helpers: script escaping, CSP and the forbidden-API scan.
import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, escapeInlineScript, inlinePage, sha256Base64 } from "../build/inline";
import { forbiddenApis } from "../build/scan";

const TEMPLATE = '<html><head><meta charset="UTF-8" /></head><body><script type="module" src="/src/main.ts"></script></body></html>';
const TAG = '<script type="module" src="/src/main.ts"></script>';

describe("escapeInlineScript", () => {
  it("removes </script and <!-- so the HTML parser cannot leave the script early", () => {
    const out = escapeInlineScript('const a = "</script><script>alert(1)</SCRIPT>"; const b = "<!--";');
    expect(out).not.toMatch(/<\/script/i);
    expect(out).not.toContain("<!--");
    expect(new Function(`${out}; return [a, b];`)()).toEqual(["</script><script>alert(1)</SCRIPT>", "<!--"]);
  });

  it("leaves ordinary code alone", () => {
    expect(escapeInlineScript("let x = 1 < 2;")).toBe("let x = 1 < 2;");
  });
});

describe("inlinePage", () => {
  it("replaces the module tag with the classic script and adds CSP and style", () => {
    const page = inlinePage({ template: TEMPLATE, scriptTag: TAG, js: "console.info(1)", css: "body{color:red}" });
    expect(page).not.toContain('type="module"');
    expect(page).toContain("<script>console.info(1)</script>");
    expect(page).toContain("<style>body{color:red}</style>");
    expect(page).toContain(`'sha256-${sha256Base64("console.info(1)")}'`);
  });

  it("refuses a template without exactly one script tag, and CSS that closes its style element", () => {
    expect(() => inlinePage({ template: "<html><head><meta charset=\"UTF-8\" /></head></html>", scriptTag: TAG, js: "", css: "" })).toThrow();
    expect(() => inlinePage({ template: TEMPLATE, scriptTag: TAG, js: "", css: "</style>" })).toThrow();
  });

  it("CSP blocks connections, images, fonts, frames and forms", () => {
    const csp = contentSecurityPolicy("a", "b");
    expect(csp.split("; ")).toEqual(expect.arrayContaining(["default-src 'none'", "connect-src 'none'", "form-action 'none'"]));
  });
});

describe("forbiddenApis", () => {
  it.each([
    ["fetch('/x')", "fetch()"],
    ["new XMLHttpRequest()", "XMLHttpRequest"],
    ["new WebSocket(u)", "WebSocket"],
    ["new EventSource(u)", "EventSource"],
    ["navigator.sendBeacon(u)", "sendBeacon"],
    ["import('./x.js')", "dynamic import()"],
    ['<script type="module">', "module script"],
    ['<link rel="stylesheet" href="x.css">', "<link>"],
    ['<img src="https://example.com/x.png">', "<img>"],
    ["@import url(x.css);", "CSS @import"],
  ])("flags %s", (text, rule) => {
    expect(forbiddenApis(text)).toContain(rule);
  });

  it("does not flag look-alikes", () => {
    expect(forbiddenApis('prefetch(); const fetcher = 1; "https://www.w3.org/ns/credentials/v2"')).toEqual([]);
  });
});
