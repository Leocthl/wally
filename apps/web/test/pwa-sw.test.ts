// Service worker policy (pure): same-origin GETs inside the scope only; /api and SSE never; navigations get the shell.
import { describe, expect, it } from "vitest";
import { cacheName, classify, isApiPath, isStaleCache, precacheUrls, scopedPath, type RequestInfo } from "../src/pwa/swPolicy";
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
