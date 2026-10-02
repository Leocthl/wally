// @vitest-environment node
// The rules of the GitHub Pages build (build/pagesRules.ts), pure: the one root-absolute link the screens still carry is
// rewritten, the manifest loses its origin-relative id, and a scan names every leftover root-absolute URL.
import { describe, expect, it } from "vitest";
import { findRootAbsolute, relativeManifest, relativeVerifierLinks } from "../build/pagesRules";

describe("relativeVerifierLinks", () => {
  it("makes the quoted /verifier/ literal relative, whatever the quote", () => {
    expect(relativeVerifierLinks('export const VERIFIER_HREF = "/verifier/";')).toBe('export const VERIFIER_HREF = "./verifier/";');
    expect(relativeVerifierLinks("const a = '/verifier/';")).toBe("const a = './verifier/';");
    expect(relativeVerifierLinks("const a = `/verifier/`;")).toBe("const a = `./verifier/`;");
    expect(relativeVerifierLinks('<a href="/verifier/">x</a>')).toBe('<a href="./verifier/">x</a>');
  });

  it("rewrites every occurrence and nothing else", () => {
    expect(relativeVerifierLinks('["/verifier/", "/verifier/"]')).toBe('["./verifier/", "./verifier/"]');
    for (const same of ['"./verifier/"', '"/verifier/x"', '"/api/verifier/"', '"/verifiers/"', '"verifier"', "// see /verifier/ for the page"]) {
      expect(relativeVerifierLinks(same), same).toBe(same);
    }
  });
});

describe("findRootAbsolute", () => {
  const at = (file: string, text: string) => findRootAbsolute(file, text).map((f) => f.text);

  it("flags root-absolute links in html and svg, not relative, protocol-relative or fragment ones", () => {
    expect(at("index.html", '<link rel="manifest" href="/manifest.webmanifest"><img src="/icons/a.png">')).toEqual(['href="/manifest.webmanifest"', 'src="/icons/a.png"']);
    expect(at("offline.html", "<a href='/'>again</a>")).toEqual(["href='/'"]);
    expect(at("icons/x.svg", '<use href="/sprite.svg#a"/>')).toEqual(['href="/sprite.svg#a"']);
    expect(at("index.html", '<a href="./">a</a><a href="#/proof">b</a><a href="//cdn.example/x.js">c</a><a href="https://example.com/">d</a>')).toEqual([]);
  });

  it("flags root-absolute url() in css", () => {
    expect(at("assets/a.css", "a{background:url(/img/a.png)} b{background:url( '/img/b.png' )}")).toEqual(["url(/", "url( '/"]);
    expect(at("assets/a.css", "a{background:url(./a.png)} b{background:url(data:image/png;base64,AAAA)} c{background:url(//cdn.example/a.png)}")).toEqual([]);
  });

  it("flags the url members of a manifest that start at the origin root", () => {
    const bad = '{"id":"/","start_url":"/","scope":"/","icons":[{"src":"/icons/a.png"}],"shortcuts":[{"url":"/#/seal"}]}';
    expect(at("manifest.webmanifest", bad)).toEqual(['"id":"/"', '"start_url":"/"', '"scope":"/"', '"src":"/icons/a.png"', '"url":"/#/seal"']);
    expect(at("manifest.webmanifest", '{"id":"./","start_url":"./","scope":"./","icons":[{"src":"icons/a.png"}],"shortcuts":[{"url":"./#/seal"}]}')).toEqual([]);
  });

  it("flags quoted literals in scripts that point at an app file from the origin root, but not /api or relative ones", () => {
    for (const bad of ['"/verifier/"', "'/icons/icon-192.png'", "`/assets/x.js`", '"/manifest.webmanifest"', '"/sw.js"', '"/offline.html"', '"/index.html"', '"/favicon.svg"', '"/mask-icon.svg"', '"/verifier/index.html?x=1"']) {
      expect(findRootAbsolute("assets/index.js", `const a = ${bad};`), bad).toHaveLength(1);
    }
    for (const ok of ['"/api/info"', '"./verifier/"', '"./sw.js"', '"/verifiers/"', '"a/verifier/"', '"/budget"']) {
      expect(findRootAbsolute("assets/index.js", `const a = ${ok};`), ok).toEqual([]);
    }
  });

  it("reports the file and the line", () => {
    const found = findRootAbsolute("assets/a.js", 'const a = 1;\nconst b = 2;\nconst v = "/verifier/";\n');
    expect(found).toEqual([{ file: "assets/a.js", line: 3, text: '"/verifier/"' }]);
  });

  it("ignores file types it has no rule for", () => {
    expect(findRootAbsolute("icons/icon-192.png", 'href="/x" "/verifier/"')).toEqual([]);
  });
});

describe("relativeManifest", () => {
  it("drops id, so the app identity is its start_url inside the mount instead of the origin root", () => {
    const out = JSON.parse(relativeManifest('{"id":"./","name":"Wally","start_url":"./","scope":"./"}')) as Record<string, unknown>;
    expect(out).toEqual({ name: "Wally", start_url: "./", scope: "./" });
  });

  it("keeps every other member, in order, and ends with a newline", () => {
    const text = relativeManifest('{"name":"Wally","id":"./","icons":[{"src":"icons/a.png","sizes":"192x192"}],"display":"standalone"}');
    expect(Object.keys(JSON.parse(text) as object)).toEqual(["name", "icons", "display"]);
    expect(text.endsWith("\n")).toBe(true);
  });

  it("leaves a manifest without an id as it is", () => {
    expect(JSON.parse(relativeManifest('{"name":"Wally"}'))).toEqual({ name: "Wally" });
  });

  it("refuses anything that is not a JSON object", () => {
    for (const bad of ["", "{", "[]", "null", '"x"', "12"]) expect(() => relativeManifest(bad), bad).toThrow(/manifest/i);
  });
});
