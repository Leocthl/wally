// One language at a time: the EN | 繁 toggle, its default from navigator.languages, the remembered choice under
// wally:lang, and the rule that both texts stay in the DOM while CSS shows one. Storage may be blocked: nothing breaks.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountVerifier } from "../src/app";
import { applyLang, currentLang, detectLang, initialLang, LANG_KEY, readStoredLang, storeLang } from "../src/lang";
import { nextIndex } from "../src/render/lang-toggle";

const html = document.documentElement;
let root: HTMLElement;

const q = <T extends Element>(selector: string): T => {
  const found = root.querySelector<T>(selector);
  if (found === null) throw new Error(`missing ${selector}`);
  return found;
};
const option = (lang: string): HTMLButtonElement => q<HTMLButtonElement>(`.lang__opt[data-value="${lang}"]`);
const click = (action: string): void => q<HTMLButtonElement>(`[data-action="${action}"]`).click();
const key = (target: Element, name: string): void => void target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));

function setLanguages(languages: readonly string[]): void {
  Object.defineProperty(navigator, "languages", { value: languages, configurable: true });
}

function mount(): void {
  root = document.createElement("div");
  document.body.replaceChildren(root);
  mountVerifier(root);
}

beforeEach(() => {
  window.localStorage.clear();
  html.removeAttribute("data-lang");
  html.setAttribute("lang", "en");
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "languages");
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.body.replaceChildren();
  html.removeAttribute("data-lang");
  html.setAttribute("lang", "en");
});

describe("which language the page starts in", () => {
  it.each([
    [["zh-HK"], "zh-HK"],
    [["zh-Hant-HK"], "zh-HK"],
    [["zh-TW"], "zh-HK"],
    [["zh"], "zh-HK"],
    [["ZH-hk"], "zh-HK"],
    [["en-US", "zh-HK"], "zh-HK"],
    [["en-US", "en"], "en"],
    [["fr-FR"], "en"],
    [[], "en"],
  ] as const)("navigator.languages %j gives %s", (languages, expected) => {
    expect(detectLang(languages)).toBe(expected);
  });

  it("follows the browser when nothing is remembered", () => {
    setLanguages(["zh-HK", "en"]);
    expect(initialLang()).toBe("zh-HK");
    setLanguages(["en-GB"]);
    expect(initialLang()).toBe("en");
  });

  it("lets a remembered choice win over the browser, and ignores a value it does not know", () => {
    setLanguages(["zh-HK"]);
    window.localStorage.setItem(LANG_KEY, "en");
    expect(initialLang()).toBe("en");
    window.localStorage.setItem(LANG_KEY, "fr");
    expect(readStoredLang()).toBeNull();
    expect(initialLang()).toBe("zh-HK");
  });

  it("uses the key the Wally app uses", () => {
    expect(LANG_KEY).toBe("wally:lang");
  });

  it("sets data-lang and lang on the html element", () => {
    applyLang("zh-HK");
    expect([html.dataset["lang"], html.getAttribute("lang"), currentLang()]).toEqual(["zh-HK", "zh-HK", "zh-HK"]);
    applyLang("en");
    expect([html.dataset["lang"], html.getAttribute("lang"), currentLang()]).toEqual(["en", "en", "en"]);
  });
});

describe("blocked storage", () => {
  it("starts from the browser's language when reading throws, and never throws when writing", () => {
    setLanguages(["zh-HK"]);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(readStoredLang()).toBeNull();
    expect(initialLang()).toBe("zh-HK");
    expect(() => storeLang("en")).not.toThrow();
  });

  it("still switches the page when the choice cannot be remembered", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    mount();
    option("zh-HK").click();
    expect(html.dataset["lang"]).toBe("zh-HK");
    expect(option("zh-HK").getAttribute("aria-checked")).toBe("true");
  });
});

describe("the EN | 繁 toggle", () => {
  it("is a labelled radio group of two buttons, EN selected by default", () => {
    setLanguages(["en-US"]);
    mount();
    const group = q(".lang");
    expect(group.getAttribute("role")).toBe("radiogroup");
    expect(group.getAttribute("aria-label")).toBe("Language");
    const options = [...group.querySelectorAll("button")];
    expect(options.map((b) => b.textContent)).toEqual(["EN", "繁"]);
    expect(options.every((b) => b.getAttribute("role") === "radio" && b.getAttribute("type") === "button")).toBe(true);
    expect(options.map((b) => b.getAttribute("aria-checked"))).toEqual(["true", "false"]);
    expect(options.map((b) => b.tabIndex)).toEqual([0, -1]);
    expect(options[1]?.getAttribute("lang")).toBe("zh-HK");
    expect([html.dataset["lang"], html.getAttribute("lang")]).toEqual(["en", "en"]);
  });

  it("starts in 繁 for a zh browser, and in the remembered language when there is one", () => {
    setLanguages(["zh-Hant-HK"]);
    mount();
    expect(html.dataset["lang"]).toBe("zh-HK");
    expect(option("zh-HK").getAttribute("aria-checked")).toBe("true");
    window.localStorage.setItem(LANG_KEY, "en");
    mount();
    expect(html.dataset["lang"]).toBe("en");
    expect(option("en").getAttribute("aria-checked")).toBe("true");
  });

  it("switches the page, marks the choice and remembers it", () => {
    setLanguages(["en-US"]);
    mount();
    option("zh-HK").click();
    expect([html.dataset["lang"], html.getAttribute("lang")]).toEqual(["zh-HK", "zh-HK"]);
    expect(window.localStorage.getItem(LANG_KEY)).toBe("zh-HK");
    expect([option("en").getAttribute("aria-checked"), option("zh-HK").getAttribute("aria-checked")]).toEqual(["false", "true"]);
    expect([option("en").tabIndex, option("zh-HK").tabIndex]).toEqual([-1, 0]);
    option("en").click();
    expect(html.dataset["lang"]).toBe("en");
    expect(window.localStorage.getItem(LANG_KEY)).toBe("en");
  });

  it("moves with the arrow keys, Home and End, and ignores other keys", () => {
    setLanguages(["en-US"]);
    mount();
    key(option("en"), "ArrowRight");
    expect(html.dataset["lang"]).toBe("zh-HK");
    expect(document.activeElement).toBe(option("zh-HK"));
    key(option("zh-HK"), "ArrowRight");
    expect(html.dataset["lang"]).toBe("en");
    key(option("en"), "End");
    expect(html.dataset["lang"]).toBe("zh-HK");
    key(option("zh-HK"), "Home");
    expect(html.dataset["lang"]).toBe("en");
    key(option("en"), "a");
    key(option("en"), "Tab");
    expect(html.dataset["lang"]).toBe("en");
  });

  it("maps keys to indexes", () => {
    expect([nextIndex("ArrowRight", 0, 2), nextIndex("ArrowDown", 1, 2), nextIndex("ArrowLeft", 0, 2), nextIndex("ArrowUp", 1, 2)]).toEqual([1, 0, 1, 0]);
    expect([nextIndex("Home", 1, 2), nextIndex("End", 0, 2), nextIndex("Enter", 0, 2), nextIndex(" ", 0, 2)]).toEqual([0, 1, null, null]);
  });
});

describe("both texts stay in the DOM; CSS shows one", () => {
  it("has an English and a zh-HK span side by side, each marked with its language", () => {
    mount();
    const en = [...root.querySelectorAll(".bi__en")];
    const zh = [...root.querySelectorAll(".bi__zh")];
    expect(en.length).toBeGreaterThan(5);
    expect(en.length).toBe(zh.length);
    expect(en.every((n) => n.getAttribute("lang") === "en")).toBe(true);
    expect(zh.every((n) => n.getAttribute("lang") === "zh-HK")).toBe(true);
  });

  it("gives every entry row an English status word (row__en) and a zh-HK one (row__zh)", () => {
    mount();
    click("demo");
    click("verify");
    const rows = [...root.querySelectorAll(".timeline .row")];
    expect(rows).toHaveLength(10);
    for (const row of rows) {
      expect(row.querySelector(".row__en")?.textContent).toBe("verified");
      expect(row.querySelector(".row__zh")?.textContent).toBe("已驗證");
      expect(row.querySelector(".row__zh")?.getAttribute("lang")).toBe("zh-HK");
    }
  });

  it("changes nothing in the DOM when the language changes: same nodes, same text, no replayed result", () => {
    mount();
    click("demo");
    click("verify");
    const verdict = q(".verdict");
    const rows = [...root.querySelectorAll(".timeline .row")];
    const text = root.textContent;
    option("zh-HK").click();
    expect(q(".verdict")).toBe(verdict);
    expect([...root.querySelectorAll(".timeline .row")]).toEqual(rows);
    expect(root.textContent).toBe(text);
    expect(root.textContent).toContain("PASS");
    expect(root.textContent).toContain("驗證通過");
  });

  it("hides the other language in CSS with the two rules the page relies on", () => {
    const css = readFileSync(join(import.meta.dirname, "..", "src", "styles", "verifier.css"), "utf8");
    expect(css).toMatch(/html\[data-lang="en"\] \.bi__zh,\s*html\[data-lang="en"\] \.row__zh\s*\{\s*display:\s*none;?\s*\}/);
    expect(css).toMatch(/html\[data-lang="zh-HK"\] \.bi__en,\s*html\[data-lang="zh-HK"\] \.row__en\s*\{\s*display:\s*none;?\s*\}/);
  });
});
