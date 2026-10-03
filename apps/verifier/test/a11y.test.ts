// Keyboard and screen-reader details the markup must keep: focus does not fall to the page when Tamper or Restore
// disable themselves, list items and the scrolling Tamper line are reachable, the file input is described, and the file
// pill never takes the mouse from the real input under it (e2e "each file pill opens the chooser" does the click).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mountDeveloper, resetMode } from "./helpers";

let root: HTMLElement;
const q = <T extends Element>(selector: string): T => {
  const found = root.querySelector<T>(selector);
  if (found === null) throw new Error(`missing ${selector}`);
  return found;
};
const button = (action: string): HTMLButtonElement => q<HTMLButtonElement>(`[data-action="${action}"]`);
const css = (name: string): string => readFileSync(join(import.meta.dirname, "..", "src", "styles", name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

beforeEach(() => {
  window.localStorage.clear();
  root = document.createElement("div");
  document.body.replaceChildren(root);
  mountDeveloper(root); // the markup pinned here is the technical page's; both modes are in mode-a11y.test.ts
});
afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.removeAttribute("data-lang");
  resetMode();
});

describe("focus", () => {
  it("passes from Tamper to Restore when Tamper turns itself off, and back again", () => {
    button("demo").click();
    button("verify").click();
    button("tamper").focus();
    expect(document.activeElement).toBe(button("tamper"));
    button("tamper").click();
    expect(button("tamper").disabled).toBe(true);
    expect(document.activeElement).toBe(button("restore"));
    button("restore").click();
    expect(button("restore").disabled).toBe(true);
    expect(document.activeElement).toBe(button("tamper"));
  });

  it("leaves focus alone when it is somewhere else", () => {
    button("demo").click();
    button("verify").focus();
    button("tamper").click();
    expect(document.activeElement).toBe(button("verify"));
  });
});

describe("roles and names", () => {
  it("gives every entry row the list item role (a grid row in a list with no markers)", () => {
    button("demo").click();
    button("verify").click();
    expect(q(".timeline").getAttribute("role")).toBe("list");
    const rows = [...root.querySelectorAll(".timeline .row")];
    expect(rows).toHaveLength(10);
    expect(rows.every((r) => r.getAttribute("role") === "listitem")).toBe(true);
  });

  it("lets a keyboard reach the Tamper line that scrolls sideways, with a name in both languages", () => {
    button("demo").click();
    button("tamper").click();
    const snippet = q(".snippet");
    expect(snippet.getAttribute("tabindex")).toBe("0");
    expect(snippet.getAttribute("aria-labelledby")).toBe("snippet-label");
    expect(q("#snippet-label .bi__en").textContent).toBe("Changed byte in context");
    expect(q("#snippet-label .bi__zh").getAttribute("lang")).toBe("zh-HK");
  });

  it("describes each file input with its source line and its error line", () => {
    for (const field of ["log", "keys", "checkpoint"]) {
      expect(q(`#${field}-file`).getAttribute("aria-describedby")).toBe(`${field}-source ${field}-error`);
      expect(root.querySelector(`#${field}-source`)).not.toBeNull();
      expect(root.querySelector(`#${field}-error`)).not.toBeNull();
    }
  });

  it("keeps the colon of each language in the input error list", () => {
    button("verify").click();
    const lead = q(".verdict__list li strong");
    expect(lead.querySelector(".bi__en")?.textContent).toBe("Receipts: ");
    expect(lead.querySelector(".bi__zh")?.textContent).toBe("收據：");
  });

  it("keeps the colon of each language after Detail", () => {
    button("demo").click();
    button("tamper").click();
    expect(q(".verdict__detail .bi__en").textContent).toBe("Detail: ");
    expect(q(".verdict__detail .bi__zh").textContent).toBe("詳情：");
  });
});

describe("style sheet rules that keep the controls usable", () => {
  it("never lets the file pill take the pointer from the input on top of it", () => {
    expect(css("verifier.css")).toMatch(/\.file__label\s*\{[^}]*pointer-events:\s*none/);
    expect(css("verifier.css")).toMatch(/\.file__input\s*\{[^}]*position:\s*absolute[^}]*opacity:\s*0/);
  });

  it("keeps the notice in the page while it is empty (a live region that appears with its text is often missed)", () => {
    const rule = /\.notice:empty\s*\{([^}]*)\}/.exec(css("verifier.css"))?.[1] ?? "";
    expect(rule).not.toMatch(/display:\s*none/);
    expect(rule).toMatch(/clip:\s*rect\(0 0 0 0\)/);
  });

  it("marks the chosen language in forced-colors mode too, and gives Chinese its taller leading", () => {
    expect(css("verifier.css")).toMatch(/@media \(forced-colors: active\)\s*\{\s*\.lang__opt\[aria-checked="true"\]\s*\{[^}]*outline:/);
    expect(css("verifier.css")).toMatch(/html\[data-lang="zh-HK"\]\s*\{[^}]*--lh-snug:\s*1\.5/);
  });
});
