// Accessibility basics in both modes and in every state a person can reach: every control has a name, every svg is
// decorative, both languages are marked, every id is unique and every reference lands, details open from their summary.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { domTools, KEYS, mountDeveloper, mountPlain, resetMode } from "./helpers";

const css = (name: string): string => readFileSync(join(import.meta.dirname, "..", "src", "styles", name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

let root: HTMLElement;
const { q, qa, click, typeInto } = domTools(() => root);

beforeEach(() => {
  resetMode();
  root = document.createElement("div");
  document.body.replaceChildren(root);
});

afterEach(() => {
  document.body.replaceChildren();
  resetMode();
});

const STATES: readonly (readonly [string, () => void])[] = [
  ["empty", () => undefined],
  ["sample loaded", () => click("demo")],
  ["PASS", () => (click("demo"), click("verify"))],
  ["FAIL after a change", () => (click("demo"), click("verify"), click("tamper"))],
  ["NOT VERIFIED", () => click("verify")],
  ["a notice", () => (typeInto("log", "garbage\n"), click("tamper"))],
  ["a list that cannot be read", () => (typeInto("log", "hello\n"), typeInto("keys", KEYS), click("verify"))],
];

const MODES = [
  ["plain", mountPlain],
  ["developer", mountDeveloper],
] as const;

describe.each(MODES)("%s mode", (_mode, mount) => {
  beforeEach(() => {
    mount(root);
  });

  describe.each(STATES)("%s", (_name, reach) => {
    beforeEach(reach);

    it("names every control: a button by its text, a box by its label, a summary by its text", () => {
      for (const button of qa<HTMLButtonElement>("button")) {
        expect(button.getAttribute("type"), button.outerHTML).toBe("button");
        const name = button.getAttribute("aria-label") ?? button.textContent ?? "";
        expect(name.trim().length, button.outerHTML).toBeGreaterThan(0);
      }
      for (const control of qa("textarea, input")) expect(root.querySelector(`label[for="${control.id}"]`), control.id).not.toBeNull();
      for (const summary of qa("summary")) expect((summary.textContent ?? "").trim().length).toBeGreaterThan(0);
    });

    it("hides every decorative svg from a screen reader", () => {
      expect(qa("svg").length).toBeGreaterThan(0);
      for (const svg of qa("svg")) expect(svg.getAttribute("aria-hidden")).toBe("true");
    });

    it("marks both languages, side by side, with equal counts", () => {
      const english = qa(".bi__en");
      const chinese = qa(".bi__zh");
      expect(english.length).toBe(chinese.length);
      expect(english.every((n) => n.getAttribute("lang") === "en")).toBe(true);
      expect(chinese.every((n) => n.getAttribute("lang") === "zh-HK")).toBe(true);
      expect(qa(".row__en").length).toBe(qa(".row__zh").length);
    });

    it("has unique ids, and every reference lands on an element", () => {
      const ids = qa("[id]").map((node) => node.id);
      expect(new Set(ids).size, ids.join(",")).toBe(ids.length);
      for (const node of qa("[aria-labelledby], [aria-describedby]")) {
        const refs = `${node.getAttribute("aria-labelledby") ?? ""} ${node.getAttribute("aria-describedby") ?? ""}`.split(/\s+/).filter(Boolean);
        for (const ref of refs) expect(root.querySelector(`#${ref}`), `${ref} from ${node.tagName}`).not.toBeNull();
      }
    });

    it("keeps one h1, a header, a main and a footer, and opens each details from its summary", () => {
      expect(qa("h1")).toHaveLength(1);
      expect(qa("header")).toHaveLength(1);
      expect(qa("main")).toHaveLength(1);
      expect(qa("footer")).toHaveLength(1);
      for (const details of qa("details")) expect(details.firstElementChild?.tagName).toBe("SUMMARY");
    });
  });
});

describe("the result region", () => {
  it("is announced as a whole in developer mode, as it always was", () => {
    mountDeveloper(root);
    expect(q("#result").getAttribute("aria-atomic")).toBe("true");
    expect([q("#result").getAttribute("role"), q("#result").getAttribute("aria-live")]).toEqual(["status", "polite"]);
  });

  it("announces only what was added in plain mode, so opening 'Show the details' does not read the whole card again", () => {
    mountPlain(root);
    expect(q("#result").getAttribute("aria-atomic")).toBe("false");
    expect([q("#result").getAttribute("role"), q("#result").getAttribute("aria-live")]).toEqual(["status", "polite"]);
  });

  it("follows the mode through a flip", () => {
    mountPlain(root);
    q<HTMLButtonElement>('[role="switch"]').click();
    expect(q("#result").getAttribute("aria-atomic")).toBe("true");
    q<HTMLButtonElement>('[role="switch"]').click();
    expect(q("#result").getAttribute("aria-atomic")).toBe("false");
  });
});

describe("what only plain mode adds", () => {
  beforeEach(() => {
    mountPlain(root);
  });

  it("gives a receipt its own line each where the run column is narrow, and one line where it is wide", () => {
    const plain = css("plain.css");
    const stacked = /\.timeline \.row\.row--plain\s*\{([^}]*)\}/.exec(plain)?.[1] ?? "";
    expect(stacked).toMatch(/grid-template-areas:\s*"disc seq word" "disc kind kind" "disc ts ts" "disc tag tag"/);
    const wide = /@media ([^{]*)\{\s*\.timeline \.row\.row--plain:not\(\.row--checkpoint\)\s*\{([^}]*)\}/.exec(plain);
    expect(wide?.[1]?.trim()).toBe("(min-width: 600px) and (max-width: 959px), (min-width: 1200px)");
    expect(wide?.[2]).toMatch(/grid-template-areas:\s*"disc seq kind ts word" "disc \. tag tag tag"/);
    // The page is one column below 960px and two from there (verifier.css): the two-column band 960 to 1199px keeps the stacked row.
    expect(css("verifier.css")).toMatch(/@media \(min-width: 960px\)\s*\{\s*\.layout\s*\{/);
  });

  it("makes every summary a 44px target with a ring, in the style sheet", () => {
    const plain = css("plain.css");
    expect(plain).toMatch(/summary\s*\{[^}]*min-height:\s*var\(--tap\)/);
    expect(plain).toMatch(/summary\s*\{[^}]*cursor:\s*pointer/);
    expect(plain).not.toMatch(/outline\s*:\s*(none|0)\b/);
  });

  it("keeps the list items, with a changed receipt marked by icon and word, not colour alone", () => {
    click("demo");
    click("verify");
    click("tamper");
    for (const row of qa(".timeline .row")) {
      expect(row.getAttribute("role")).toBe("listitem");
      expect(row.querySelector(".row__word")?.textContent?.trim().length).toBeGreaterThan(0);
      expect(row.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("reads the receipts in the order a person would say them: number, what, when, status", () => {
    click("demo");
    click("verify");
    const row = q(".timeline .row");
    expect([...row.children].map((c) => [...c.classList].find((name) => name.startsWith("row__")))).toEqual(["row__disc", "row__seq", "row__kind", "row__ts", "row__word"]);
  });

  it("never gives a plain row a monospace class for what is no longer a code", () => {
    click("demo");
    click("verify");
    expect(root.querySelector(".timeline .mono")).toBeNull();
  });
});

describe("after a flip", () => {
  it.each([
    ["plain to developer", mountPlain],
    ["developer to plain", mountDeveloper],
  ] as const)("%s: one switch, unique ids, every reference lands, and the focus is on the new switch", (_name, mount) => {
    mount(root);
    click("demo");
    click("verify");
    click("tamper");
    const button = q<HTMLButtonElement>('[role="switch"]');
    button.focus();
    button.click();
    expect(qa('[role="switch"]')).toHaveLength(1);
    expect(document.activeElement).toBe(q('[role="switch"]'));
    const ids = qa("[id]").map((node) => node.id);
    expect(new Set(ids).size, ids.join(",")).toBe(ids.length);
    for (const node of qa("[aria-labelledby], [aria-describedby]")) {
      const refs = `${node.getAttribute("aria-labelledby") ?? ""} ${node.getAttribute("aria-describedby") ?? ""}`.split(/\s+/).filter(Boolean);
      for (const ref of refs) expect(root.querySelector(`#${ref}`), ref).not.toBeNull();
    }
    expect(qa("h1")).toHaveLength(1);
    for (const svg of qa("svg")) expect(svg.getAttribute("aria-hidden")).toBe("true");
  });
});
