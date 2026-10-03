// Service worker policy (pure): same-origin GETs inside the scope only; /api and SSE never; navigations get the shell.
import { describe, expect, it } from "vitest";
import { cacheName, classify, isApiPath, isStaleCache, isVerifierPath, precacheUrls, scopedPath, VERIFIER_URL, type RequestInfo } from "../src/pwa/swPolicy";
import { fillWorker, shellVersion } from "../src/pwa/vitePlugin";

const SCOPE = "https://booth.example/wally/";

function req(url: string, extra: Partial<RequestInfo> = {}): RequestInfo {
  return { method: "GET", url, mode: "cors", accept: "*/*", range: null, ...extra };
}

describe("classify", () => {
  it("never touches /api, at the root or under the app path, for any method", () => {
    for (const url of ["https://booth.example/wally/api/health", "https://booth.example/wally/api/events?x=1", "https://booth.example/wally/api"]) {
      expect(classify(req(url), SCOPE), url).toBe("ignore");
      expect(classify(req(url, { mode: "navigate" }), SCOPE), url).toBe("ignore");
      expect(classify(req(url, { method: "POST" }), SCOPE), url).toBe("ignore");
    }
    expect(classify(req("https://booth.example/api/x"), "https://booth.example/")).toBe("ignore");
  });

  it("never touches an event stream, a range request, a non-GET, another origin or a path outside the scope", () => {
    expect(classify(req(`${SCOPE}stream`, { accept: "text/event-stream" }), SCOPE)).toBe("ignore");
    expect(classify(req(`${SCOPE}assets/a.mp4`, { range: "bytes=0-" }), SCOPE)).toBe("ignore");
    expect(classify(req(`${SCOPE}assets/a.js`, { method: "HEAD" }), SCOPE)).toBe("ignore");
    expect(classify(req("https://cdn.example/wally/assets/a.js"), SCOPE)).toBe("ignore");
    expect(classify(req("https://booth.example/other/index.html"), SCOPE)).toBe("ignore");
  });

  it("leaves the offline verifier page to the network: it is its own page, never the app shell", () => {
    for (const url of [`${SCOPE}verifier/`, `${SCOPE}verifier`, `${SCOPE}verifier/index.html`]) {
      expect(classify(req(url, { mode: "navigate" }), SCOPE), url).toBe("ignore");
      expect(classify(req(url), SCOPE), url).toBe("ignore");
    }
    expect(classify(req("https://booth.example/verifier/", { mode: "navigate" }), "https://booth.example/")).toBe("ignore");
    // Only the path segment: an app file that merely has the word in its name is still the app's.
    expect(classify(req(`${SCOPE}assets/verifier-abc.js`), SCOPE)).toBe("asset");
    expect([isVerifierPath("verifier/"), isVerifierPath("verifier"), isVerifierPath("v1/verifier/x"), isVerifierPath("verifiers/"), isVerifierPath("assets/verifier.js")]).toEqual([true, true, true, false, false]);
  });

  it("leaves the verifier to the network when the worker's build does not hold it, whatever the option says", () => {
    for (const options of [undefined, {}, { verifier: false }]) {
      for (const url of [`${SCOPE}verifier/`, `${SCOPE}verifier`, `${SCOPE}verifier/index.html`]) expect(classify(req(url, { mode: "navigate" }), SCOPE, options), url).toBe("ignore");
    }
  });

  it("serves navigations from the shell and other in-scope GETs cache first", () => {
    expect(classify(req(`${SCOPE}`, { mode: "navigate" }), SCOPE)).toBe("navigate");
    expect(classify(req(`${SCOPE}index.html#/booth`, { mode: "navigate" }), SCOPE)).toBe("navigate");
    expect(classify(req(`${SCOPE}assets/index-abc.js`), SCOPE)).toBe("asset");
    expect(classify(req(`${SCOPE}apiary.css`), SCOPE)).toBe("asset");
  });

  it("works out scoped paths and api segments", () => {
    expect(scopedPath(`${SCOPE}assets/x.js`, SCOPE)).toBe("assets/x.js");
    expect(scopedPath("https://booth.example/x", SCOPE)).toBeNull();
    expect([isApiPath("api/x"), isApiPath("v1/api/x"), isApiPath("api"), isApiPath("apiary"), isApiPath("assets/api.js")]).toEqual([true, true, true, false, false]);
  });
});

describe("classify when the worker's build holds the verifier page (the static site)", () => {
  const WITH = { verifier: true } as const;

  it("answers the page at verifier/ and verifier/index.html, with or without the document being a navigation", () => {
    for (const url of [`${SCOPE}verifier/`, `${SCOPE}verifier/index.html`, `${SCOPE}verifier/?mode=developer`, `${SCOPE}verifier/index.html#top`]) {
      expect(classify(req(url, { mode: "navigate" }), SCOPE, WITH), url).toBe("verifier");
      expect(classify(req(url), SCOPE, WITH), url).toBe("verifier");
    }
  });

  it("sends verifier without its slash to verifier/ (the page's relative links need the folder)", () => {
    expect(classify(req(`${SCOPE}verifier`, { mode: "navigate" }), SCOPE, WITH)).toBe("verifier-slash");
    expect(classify(req(`${SCOPE}verifier?mode=developer`, { mode: "navigate" }), SCOPE, WITH)).toBe("verifier-slash");
  });

  it("finds the page under any mount: a project site, the origin root, a deeper mount", () => {
    for (const [scope, base] of [["https://pages.example/wally/", "https://pages.example/wally/"], ["https://wally-dev.vercel.app/", "https://wally-dev.vercel.app/"], ["https://host.example/a/b/", "https://host.example/a/b/"]] as const) {
      expect(classify(req(`${base}verifier/`, { mode: "navigate" }), scope, WITH), base).toBe("verifier");
      expect(classify(req(`${base}verifier/index.html`, { mode: "navigate" }), scope, WITH), base).toBe("verifier");
      expect(classify(req(`${base}verifier`, { mode: "navigate" }), scope, WITH), base).toBe("verifier-slash");
    }
  });

  it("answers nothing else under verifier, and nothing outside the scope", () => {
    for (const url of [`${SCOPE}verifier/x.js`, `${SCOPE}verifier/sub/`, `${SCOPE}verifier/index.html/more`, `${SCOPE}a/verifier/`, `${SCOPE}a/verifier/index.html`, `${SCOPE}verifiers/`]) {
      expect(classify(req(url, { mode: "navigate" }), SCOPE, WITH), url).not.toMatch(/^verifier/);
    }
    expect(classify(req(`${SCOPE}verifier/x.js`), SCOPE, WITH)).toBe("ignore");
    expect(classify(req(`${SCOPE}a/verifier/`, { mode: "navigate" }), SCOPE, WITH)).toBe("ignore");
    expect(classify(req("https://elsewhere.example/wally/verifier/", { mode: "navigate" }), SCOPE, WITH)).toBe("ignore");
    expect(classify(req("https://booth.example/verifier/", { mode: "navigate" }), SCOPE, WITH)).toBe("ignore");
  });

  it("still never touches a non-GET, a range request, an event stream or /api, for the verifier's addresses too", () => {
    expect(classify(req(`${SCOPE}verifier/`, { method: "POST" }), SCOPE, WITH)).toBe("ignore");
    expect(classify(req(`${SCOPE}verifier/`, { range: "bytes=0-" }), SCOPE, WITH)).toBe("ignore");
    expect(classify(req(`${SCOPE}verifier/`, { accept: "text/event-stream" }), SCOPE, WITH)).toBe("ignore");
    expect(classify(req(`${SCOPE}api/verifier/`), SCOPE, WITH)).toBe("ignore");
  });

  it("does not change the app's own routes", () => {
    expect(classify(req(SCOPE, { mode: "navigate" }), SCOPE, WITH)).toBe("navigate");
    expect(classify(req(`${SCOPE}assets/index-abc.js`), SCOPE, WITH)).toBe("asset");
    expect(classify(req(`${SCOPE}assets/verifier-abc.js`), SCOPE, WITH)).toBe("asset");
    expect(classify(req(`${SCOPE}api/health`), SCOPE, WITH)).toBe("ignore");
  });

  it("names the page the way the precache list does", () => {
    expect(VERIFIER_URL).toBe("./verifier/index.html");
    expect(precacheUrls(["index.html", "verifier/index.html"])).toContain(VERIFIER_URL);
  });
});

describe("caches and the precache list", () => {
  it("deletes only older Wally caches", () => {
    const current = cacheName("abc");
    expect(isStaleCache(cacheName("old"), current)).toBe(true);
    expect(isStaleCache(current, current)).toBe(false);
    expect(isStaleCache("someone-else", current)).toBe(false);
  });

  it("lists the scope root, then each file once, relative, sorted, without maps or the worker", () => {
    expect(precacheUrls(["index.html", "assets/b.js", "assets/a.css", "assets/b.js.map", "sw.js", "/icons/i.png", "assets/b.js"])).toEqual(["./", "./assets/a.css", "./assets/b.js", "./icons/i.png", "./index.html"]);
  });

  it("the version follows what is in a file whose name does not change with its contents (the verifier page, the public files)", () => {
    const urls = ["./", "./index.html", "./verifier/index.html"];
    const a = shellVersion(urls, "<html>", ["<page one>"]);
    expect(shellVersion(urls, "<html>", ["<page two>"])).not.toBe(a);
    expect(shellVersion(urls, "<html>", ["<page one>"])).toBe(a);
    expect(shellVersion(urls, "<html>", [new TextEncoder().encode("<page one>")])).toBe(a); // the same bytes, however they arrive
    expect(shellVersion(urls, "<html>", [])).toBe(shellVersion(urls, "<html>"));
    expect(shellVersion(urls, "<html>", ["ab", "c"])).not.toBe(shellVersion(urls, "<html>", ["a", "bc"])); // two files cannot trade bytes
    expect(a).toMatch(/^[0-9a-f]{12}$/);
  });

  it("fills the worker placeholders so the list survives as JSON, and changes version with any file", () => {
    const code = 'var v="__WALLY_VERSION__",n="wally-shell-__WALLY_VERSION__",l=JSON.parse("__WALLY_PRECACHE_JSON__");';
    const urls = ["./", "./index.html"];
    const filled = fillWorker(code, urls, "abc123");
    const parsed = new Function(`${filled}; return [v, n, l];`)() as [string, string, string[]];
    expect(parsed).toEqual(["abc123", "wally-shell-abc123", urls]);
    expect(() => fillWorker("var x=1", urls, "abc")).toThrow(/placeholders/);
    expect(() => fillWorker(code, urls, "not hex!")).toThrow(/hex/);
    expect(shellVersion(urls, "<html>")).not.toBe(shellVersion([...urls, "./a.js"], "<html>"));
    expect(shellVersion(urls, "<html>")).toMatch(/^[0-9a-f]{12}$/);
  });
});
