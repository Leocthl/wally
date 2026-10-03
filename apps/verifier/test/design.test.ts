// The look of the page, checked where jsdom can: the markup the CSS hangs on, the words on screen (budget, rules,
// receipts, Wally; never packet, mandate, mint, lai see), the page template, and the phone rules in the style sheets.
import type { VerifyFailure } from "@wally/core/verify";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { reasonText } from "../src/reasons";
import { mountDeveloper, resetMode } from "./helpers";

const ROOT = join(import.meta.dirname, "..");
const read = (...parts: string[]): string => readFileSync(join(ROOT, ...parts), "utf8");
const styles = (): Readonly<Record<string, string>> =>
  Object.fromEntries(readdirSync(join(ROOT, "src", "styles")).map((name) => [name, read("src", "styles", name).replace(/\/\*[\s\S]*?\*\//g, "")]));

let root: HTMLElement;
const q = <T extends Element>(selector: string): T => {
  const found = root.querySelector<T>(selector);
  if (found === null) throw new Error(`missing ${selector}`);
  return found;
};
const qa = (selector: string): readonly Element[] => [...root.querySelectorAll(selector)];
const click = (action: string): void => q<HTMLButtonElement>(`[data-action="${action}"]`).click();

beforeEach(() => {
  window.localStorage.clear();
  root = document.createElement("div");
  document.body.replaceChildren(root);
  mountDeveloper(root); // these tests pin the technical page; plain mode (the default) has its own tests
});
afterEach(() => {
  document.body.replaceChildren();
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-lang");
  resetMode();
});

describe("the page template", () => {
  const template = read("index.html");

  it("is titled for Wally's receipts and fits a phone with a notch", () => {
    expect(template).toContain("<title>Wally receipt verifier (offline)</title>");
    expect(template).toMatch(/<meta name="viewport" content="[^"]*viewport-fit=cover[^"]*"/);
    expect(template).not.toMatch(/user-scalable|maximum-scale/);
  });

  it("colours the browser bar for both schemes and starts in English with no inline style", () => {
    expect(template).toContain('media="(prefers-color-scheme: light)" content="#F4F7FE"');
    expect(template).toContain('media="(prefers-color-scheme: dark)" content="#0B1220"');
    expect(template).toContain('<html lang="en" data-lang="en">');
    expect(template).not.toMatch(/\sstyle\s*=/);
  });
});

describe("the header", () => {
  it("has the shield mark, the title, one sentence, the SIMULATED chip and the language toggle", () => {
    expect(q(".top__mark").getAttribute("aria-hidden")).toBe("true");
    expect(q(".top__mark svg.icon--pass")).not.toBeNull();
    expect(q("h1").textContent).toContain("Receipt verifier");
    expect(q("h1").textContent).toContain("收據驗證");
    expect(qa(".top__intro")).toHaveLength(1);
    expect(q(".top .chip--sim").textContent).toContain("Rail SIMULATED");
    expect(q(".top .lang").getAttribute("role")).toBe("radiogroup");
  });
});

describe("the layout", () => {
  it("puts the actions and the result before the inputs, in the DOM and so on screen", () => {
    const children = [...q("main.layout").children];
    expect(children.map((c) => c.className)).toEqual(["run", "panel inputs"]);
    expect(q(".run").firstElementChild?.className).toBe("actions");
    expect(q(".actions").getAttribute("aria-labelledby")).toBe("actions-title");
    expect(q("#actions-title").textContent).toContain("Actions");
  });

  it("orders the buttons as the demo goes: Load demo log, Verify, Tamper, Restore", () => {
    expect(qa(".actions button").map((b) => b.getAttribute("data-action"))).toEqual(["demo", "verify", "tamper", "restore"]);
    expect(qa(".actions button").map((b) => [...b.classList].find((c) => c.startsWith("btn--")))).toEqual(["btn--secondary", "btn--primary", "btn--danger", "btn--ghost"]);
  });

  it("makes each file picker a labelled pill over a real input", () => {
    for (const field of ["log", "keys", "checkpoint"]) {
      const input = q<HTMLInputElement>(`#${field}-file`);
      const label = q<HTMLLabelElement>(`label[for="${field}-file"]`);
      expect(input.type).toBe("file");
      expect(input.parentElement?.className).toBe("file");
      expect(input.nextElementSibling).toBe(label);
      expect(label.textContent).toContain("Load");
    }
  });

  it("shows the inputs under a visible heading", () => {
    expect(q("#inputs-title").textContent).toContain("Check your own receipts");
    expect(q("#inputs-title").classList.contains("sr-only")).toBe(false);
  });
});

describe("shields and discs", () => {
  it("shows a dashed shield before anything is checked", () => {
    expect(q(".verdict--idle .verdict__disc svg.icon--pending")).not.toBeNull();
    expect(q(".verdict--idle").textContent).toContain("NOT VERIFIED");
  });

  it("shows a shield-check on PASS and a tick on every verified entry", () => {
    click("demo");
    click("verify");
    expect(q(".verdict--pass .verdict__disc svg.icon--pass")).not.toBeNull();
    expect(qa(".timeline .row--ok .row__disc svg.icon--tick")).toHaveLength(10);
    expect(q(".row--checkpoint .row__disc svg.icon--tick")).not.toBeNull();
    expect(root.querySelector(".row--checkpoint .row__word")).toBeNull(); // its sentence says the state
    expect(q(".row--checkpoint").textContent).toContain("Head checkpoint matches.");
  });

  it("shows a shield-alert on FAIL, a cross on the broken entry and a dashed ring after it", () => {
    click("demo");
    click("verify");
    click("tamper");
    expect(q(".verdict--fail .verdict__disc svg.icon--fail")).not.toBeNull();
    expect(q('.row--broken .row__disc svg.icon--cross')).not.toBeNull();
    expect(qa(".timeline .row--unchecked .row__disc svg.icon--ring")).toHaveLength(8);
    for (const svg of root.querySelectorAll("svg")) expect(svg.getAttribute("aria-hidden")).toBe("true");
  });

  it("lists the facts as label and value pairs", () => {
    click("demo");
    click("verify");
    const facts = qa(".facts .fact");
    expect(facts).toHaveLength(4);
    for (const fact of facts) expect([...fact.children].map((c) => c.tagName)).toEqual(["DT", "DD"]);
  });
});

describe("words on screen", () => {
  const BANNED_EN = /\b(packet|mandate|mint(ed|s)?|lai see|decision log)\b/i;
  const BANNED_ZH = /利是|授權憑證/;
  const CODES = ["SCHEMA", "SEQ", "PREV_HASH", "PAYLOAD_HASH", "ENTRY_HASH", "SIGNATURE", "PAYLOAD_SIGNATURE", "TRUNCATED", "KEYS", "NO_DECISION", "DUPLICATE", "CONSENT", "OVERSPEND", "AFTER_REVOKE"] as const satisfies readonly VerifyFailure[];

  /** Everything but the entry list, whose kinds (CARD_MINTED, MANDATE_SEALED) are log data. */
  const copy = (): string => {
    const clone = root.cloneNode(true) as HTMLElement;
    for (const list of clone.querySelectorAll(".timeline")) list.remove();
    return clone.textContent ?? "";
  };

  it("says budget, rules and receipts, in every state, in both languages", () => {
    const seen: string[] = [copy()]; // empty page
    click("verify"); // input errors
    seen.push(copy());
    click("demo");
    seen.push(copy());
    click("verify");
    seen.push(copy());
    click("tamper");
    seen.push(copy());
    const all = seen.join("\n");
    expect(all).not.toMatch(BANNED_EN);
    expect(all).not.toMatch(BANNED_ZH);
    expect(all).toContain("budget rules");
    expect(all).toContain("receipts");
  });

  it("has plain words for every failure code, in both languages", () => {
    for (const code of CODES) {
      const text = reasonText(code);
      expect(text.en, code).not.toMatch(BANNED_EN);
      expect(text.zh, code).not.toMatch(BANNED_ZH);
      expect(text.en.length, code).toBeGreaterThan(10);
    }
    expect(reasonText("PAYLOAD_SIGNATURE").en).toContain("budget rules");
    expect(reasonText("NO_DECISION").en).toContain("A card was made");
    expect(reasonText("AFTER_REVOKE").en).toContain("budget");
  });

  it("keeps the footer exactly as it was, and the SIMULATED statements", () => {
    expect(q(".foot").textContent).toContain("Prototype. Not affiliated with HKT, Tap & Go or Mastercard. Demo keys are throwaway; the rail is SIMULATED.");
    expect(q(".top .chip--sim").textContent).toContain("Rail SIMULATED");
    click("demo");
    expect(q(".demo-badge").hasAttribute("hidden")).toBe(false);
    expect(q(".demo-badge").textContent).toContain("SIMULATED demo log and throwaway test keys, not the booth keys.");
  });
});

describe("the page's own code keeps to the page's CSP", () => {
  it("never writes markup or a style attribute (inline style is blocked; the CSSOM is allowed)", () => {
    const dirs = ["src", join("src", "render"), join("src", "demo"), join("src", "plain")];
    const files = dirs.flatMap((dir) => readdirSync(join(ROOT, dir)).filter((n) => n.endsWith(".ts")).map((n) => join(dir, n)));
    expect(files.length).toBeGreaterThan(15);
    for (const file of files) {
      const code = read(file);
      expect(code, file).not.toMatch(/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write\s*\(/);
      expect(code, file).not.toMatch(/setAttribute\(\s*["'`]style["'`]/);
      expect(code, file).not.toMatch(/\bstyle\s*:\s*["'`]/);
    }
  });
});

describe("phone rules in the style sheets", () => {
  const sheets = styles();
  const all = Object.values(sheets).join("\n");

  it("kills the tap flash, keeps 16px inputs and a 44px target, and pads the safe areas", () => {
    expect(all).toContain("-webkit-tap-highlight-color: transparent");
    expect(sheets["verifier.css"]).toMatch(/textarea\s*\{[^}]*font-size:\s*1rem/);
    expect(sheets["tokens.css"]).toContain("--tap: 2.75rem");
    expect(sheets["tokens.css"]).toContain("env(safe-area-inset-bottom");
    expect(sheets["verifier.css"]).toMatch(/\.app\s*\{[^}]*var\(--safe-top\)/);
    expect(sheets["verifier.css"]).toContain("100dvh");
  });

  it("gives every control touch-action: manipulation and a pressed state of scale(0.97)", () => {
    for (const control of [".btn", ".lang__opt", ".file__label"]) {
      const rule = new RegExp(`${control.replace(".", "\\.")}\\s*\\{[^}]*touch-action:\\s*manipulation`);
      expect(sheets["verifier.css"], control).toMatch(rule);
    }
    expect(sheets["verifier.css"]).toMatch(/\.btn:not\(:disabled\):active\s*\{\s*transform:\s*scale\(0\.97\)/);
    expect(sheets["verifier.css"]).toMatch(/--dur-press|120ms/);
  });

  it("draws hover only for a mouse: every :hover sits inside (hover: hover) and (pointer: fine)", () => {
    for (const [name, css] of Object.entries(sheets)) {
      let rest = css;
      for (let at = rest.indexOf("@media (hover: hover) and (pointer: fine)"); at >= 0; at = rest.indexOf("@media (hover: hover) and (pointer: fine)")) {
        let depth = 0;
        let end = rest.indexOf("{", at);
        for (; end < rest.length; end += 1) {
          if (rest[end] === "{") depth += 1;
          if (rest[end] === "}") depth -= 1;
          if (depth === 0) break;
        }
        rest = rest.slice(0, at) + rest.slice(end + 1);
      }
      expect(rest, name).not.toContain(":hover");
    }
    expect(all).toContain("@media (hover: hover) and (pointer: fine)");
  });

  it("shows keyboard focus with a 3px ring, on the file pill too", () => {
    expect(sheets["verifier.css"]).toMatch(/:focus-visible\s*\{\s*outline:\s*3px solid var\(--c-focus\)/);
    expect(sheets["verifier.css"]).toContain(".file__input:focus-visible + .file__label");
  });

  it("keeps the page to one column on a phone and two from 960px", () => {
    expect(sheets["verifier.css"]).toMatch(/\.layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(sheets["verifier.css"]).toMatch(/@media \(min-width: 960px\)\s*\{\s*\.layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(0,\s*1fr\)/);
  });

  it("has no image, font file or url() anywhere (the build scan enforces the same on the page)", () => {
    expect(all).not.toMatch(/url\s*\(|@import|@font-face/);
  });
});
