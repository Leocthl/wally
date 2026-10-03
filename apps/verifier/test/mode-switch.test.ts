// The "Show technical details" switch: a real button with role switch, in both modes, that rebuilds the page from the
// state it holds (texts, verdict, change, notice kept; focus back on the new switch) without replaying the entrance.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountVerifier, type VerifierPage } from "../src/app";
import { LIMITS } from "../src/limits";
import { MODE_KEY } from "../src/mode";
import { domTools, langText, LOG, mountDeveloper, mountPlain, resetMode } from "./helpers";

const css = (name: string): string => readFileSync(join(import.meta.dirname, "..", "src", "styles", name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const html = document.documentElement;

let root: HTMLElement;
let page: VerifierPage;
const { q, qa, click, typeInto } = domTools(() => root);
const toggle = (): HTMLButtonElement => q<HTMLButtonElement>('[role="switch"]');

function setUrl(search: string): void {
  window.history.replaceState(null, "", `/${search}`);
}

/** Mounts with nothing remembered by the test: whatever the page decides from the address and storage. */
function mountFresh(): void {
  root = document.createElement("div");
  document.body.replaceChildren(root);
  page = mountVerifier(root);
}

beforeEach(() => {
  resetMode();
  root = document.createElement("div");
  document.body.replaceChildren(root);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  resetMode();
});

describe("the switch is on the page in both modes", () => {
  it.each([
    ["plain", mountPlain, "false"],
    ["developer", mountDeveloper, "true"],
  ] as const)("%s: one real button with role switch and aria-checked %s, in the header under the intro", (_mode, mount, checked) => {
    mount(root);
    expect(qa('[role="switch"]')).toHaveLength(1);
    const button = toggle();
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("aria-checked")).toBe(checked);
    expect(button.tabIndex).toBe(0);
    expect(button.closest("header.top")).not.toBeNull();
    expect(q(".top__intro").nextElementSibling?.contains(button)).toBe(true);
  });

  it("has a visible label and a one-line hint, in both languages", () => {
    mountPlain(root);
    expect(langText(toggle(), "en")).toBe("Show technical details");
    expect(langText(toggle(), "zh-HK")).toBe("顯示技術細節");
    const hint = q(`#${toggle().getAttribute("aria-describedby") ?? "none"}`);
    expect(langText(hint, "en")).toBe("For engineers: receipt ids, fingerprints and the exact codes.");
    expect(langText(hint, "zh-HK")).toBe("給工程師：收據編號、指紋及確切代碼。");
    for (const part of root.querySelectorAll(".modebar .bi__zh")) expect(part.getAttribute("lang")).toBe("zh-HK");
    for (const part of root.querySelectorAll(".modebar .bi__en")) expect(part.getAttribute("lang")).toBe("en");
  });

  it("takes its name from its label (no aria-label to drift), and hides its track from a screen reader", () => {
    mountPlain(root);
    expect(toggle().getAttribute("aria-label")).toBeNull();
    expect(q(".modeswitch__track").getAttribute("aria-hidden")).toBe("true");
    expect(langText(toggle(), "en").length).toBeGreaterThan(5);
  });
});

describe("flipping the switch", () => {
  beforeEach(() => {
    page = mountPlain(root);
  });

  it("goes to developer mode: the technical page, the state on, the choice remembered", () => {
    expect(langText(q("h1"), "en")).toBe("Receipt checker");
    toggle().click();
    expect(html.dataset["mode"]).toBe("developer");
    expect(window.localStorage.getItem(MODE_KEY)).toBe("developer");
    expect(toggle().getAttribute("aria-checked")).toBe("true");
    expect(langText(q("h1"), "en")).toBe("Receipt verifier");
    expect(langText(q('[data-action="verify"]'), "en")).toBe("Verify");
    expect(root.querySelector("details.inputs__more")).toBeNull();
  });

  it("goes back to plain mode and remembers that too", () => {
    toggle().click();
    toggle().click();
    expect(html.dataset["mode"]).toBe("plain");
    expect(window.localStorage.getItem(MODE_KEY)).toBe("plain");
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(langText(q("h1"), "en")).toBe("Receipt checker");
  });

  it("puts the focus back on the new switch, not on the page", () => {
    const old = toggle();
    old.focus();
    old.click();
    expect(toggle()).not.toBe(old);
    expect(old.isConnected).toBe(false);
    expect(document.activeElement).toBe(toggle());
    toggle().click();
    expect(document.activeElement).toBe(toggle());
  });

  it("keeps the typed and loaded texts, with the source of each", () => {
    click("demo");
    typeInto("checkpoint", "");
    toggle().click();
    expect(q<HTMLTextAreaElement>("#log-text").value).toBe(LOG);
    expect(q<HTMLTextAreaElement>("#checkpoint-text").value).toBe("");
    expect(langText(q("#log-source"), "en")).toContain("SIMULATED demo");
    expect(langText(q("#checkpoint-source"), "en")).toBe("Pasted or typed here, 0 characters.");
    expect(q(".demo-badge").hasAttribute("hidden")).toBe(false);
  });

  it("keeps the state object itself: nothing is recomputed", () => {
    click("demo");
    click("verify");
    const before = page.state();
    toggle().click();
    expect(page.state()).toBe(before);
    toggle().click();
    expect(page.state()).toBe(before);
  });

  it("keeps a PASS and shows it in the new words", () => {
    click("demo");
    click("verify");
    toggle().click();
    expect(q("[data-outcome]").getAttribute("data-outcome")).toBe("pass");
    expect(langText(q(".verdict"), "en")).toContain("Chain verified: hashes, order and every signature check out.");
    expect(qa(".timeline .row")).toHaveLength(10);
    expect(langText(q(".timeline .row"), "en")).toContain("MANDATE_SEALED");
  });

  it("keeps a FAIL, the changed text, the note and the states of the two buttons", () => {
    click("demo");
    click("verify");
    click("tamper");
    const changed = q<HTMLTextAreaElement>("#log-text").value;
    toggle().click();
    expect(q("[data-outcome]").getAttribute("data-outcome")).toBe("fail");
    expect(q("[data-outcome]").getAttribute("data-failed-seq")).toBe("1");
    expect(langText(q(".verdict"), "en")).toContain("Chain broken at entry 1");
    expect(q<HTMLTextAreaElement>("#log-text").value).toBe(changed);
    expect(langText(q(".tamper-note"), "en")).toContain("payload.approved_limit_minor");
    expect(q<HTMLButtonElement>('[data-action="tamper"]').disabled).toBe(true);
    expect(q<HTMLButtonElement>('[data-action="restore"]').disabled).toBe(false);
    click("restore");
    expect(q("[data-outcome]").getAttribute("data-outcome")).toBe("pass");
    expect(q<HTMLTextAreaElement>("#log-text").value).toBe(LOG);
  });

  it("keeps a NOT VERIFIED and the box errors, and opens the plain box panel for them", () => {
    click("verify");
    toggle().click();
    expect(q("[data-outcome]").getAttribute("data-outcome")).toBe("input-error");
    expect(q<HTMLElement>("#log-error").hidden).toBe(false);
    expect(q("#keys-text").getAttribute("aria-invalid")).toBe("true");
    toggle().click();
    expect(q("[data-outcome]").getAttribute("data-outcome")).toBe("input-error");
    expect(q<HTMLDetailsElement>("details.inputs__more").open).toBe(true);
  });

  it("keeps a notice, worded for the mode it is shown in", async () => {
    const keys = q<HTMLInputElement>("#keys-file");
    Object.defineProperty(keys, "files", { value: [new File(["x".repeat(LIMITS.smallChars + 1)], "big.json")], configurable: true });
    keys.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(page.state().notice).not.toBeNull());
    expect(langText(q(".notice"), "en")).toContain("is too big for this page");
    toggle().click();
    expect(langText(q(".notice"), "en")).toContain("is 65,537 bytes");
    toggle().click();
    expect(langText(q(".notice"), "en")).toContain("is too big for this page");
  });

  it("keeps the language", () => {
    q<HTMLButtonElement>('.lang__opt[data-value="zh-HK"]').click();
    toggle().click();
    expect(html.dataset["lang"]).toBe("zh-HK");
    expect(q('.lang__opt[data-value="zh-HK"]').getAttribute("aria-checked")).toBe("true");
  });

  it("still works when the choice cannot be remembered or the address cannot be rewritten", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {
      throw new DOMException("origin null", "SecurityError");
    });
    // jsdom reports an error thrown inside a listener as a window "error" event instead of throwing out of click(), so look for it.
    const errors: unknown[] = [];
    const onError = (event: ErrorEvent): void => {
      errors.push(event.error ?? event.message);
      event.preventDefault();
    };
    window.addEventListener("error", onError);
    toggle().click();
    window.removeEventListener("error", onError);
    expect(errors).toEqual([]);
    expect(html.dataset["mode"]).toBe("developer");
    expect(toggle().getAttribute("aria-checked")).toBe("true");
    expect(q("[data-outcome]").getAttribute("data-outcome")).toBe("idle");
  });

  it("wires the rebuilt page: buttons, boxes and file pickers all act on the state that was kept", async () => {
    toggle().click();
    click("demo");
    click("verify");
    expect(q("[data-outcome]").getAttribute("data-outcome")).toBe("pass");
    typeInto("log", `${LOG} `);
    expect(q("[data-outcome]").getAttribute("data-outcome")).toBe("idle");
    const input = q<HTMLInputElement>("#log-file");
    Object.defineProperty(input, "files", { value: [new File([LOG], "booth-log.jsonl")], configurable: true });
    input.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(page.state().log.source).toBe("file:booth-log.jsonl"));
    expect(langText(q("#log-source"), "en")).toContain("Loaded from file booth-log.jsonl");
    toggle().click();
    expect(langText(q("#log-source"), "en")).toBe("Loaded from file booth-log.jsonl.");
    click("verify");
    expect(q("[data-outcome]").getAttribute("data-outcome")).toBe("pass");
  });

  it("lets a file chosen before the flip finish after it, into the page that is on screen", async () => {
    const input = q<HTMLInputElement>("#log-file");
    Object.defineProperty(input, "files", { value: [new File([LOG], "late.jsonl")], configurable: true });
    input.dispatchEvent(new Event("change"));
    toggle().click();
    await vi.waitFor(() => expect(page.state().log.source).toBe("file:late.jsonl"));
    expect(q<HTMLTextAreaElement>("#log-text").value).toBe(LOG);
  });
});

describe("where the mode comes from", () => {
  it("is plain on a fresh start", () => {
    mountFresh();
    expect(html.dataset["mode"]).toBe("plain");
    expect(toggle().getAttribute("aria-checked")).toBe("false");
  });

  it("follows ?dev=1 and stores nothing", () => {
    setUrl("?dev=1");
    mountFresh();
    expect(html.dataset["mode"]).toBe("developer");
    expect(toggle().getAttribute("aria-checked")).toBe("true");
    expect(window.localStorage.getItem(MODE_KEY)).toBeNull();
  });

  it("follows ?dev=0 over a remembered developer choice", () => {
    window.localStorage.setItem(MODE_KEY, "developer");
    setUrl("?dev=0");
    mountFresh();
    expect(html.dataset["mode"]).toBe("plain");
  });

  it("follows the remembered choice, and ignores junk", () => {
    window.localStorage.setItem(MODE_KEY, "developer");
    mountFresh();
    expect(html.dataset["mode"]).toBe("developer");
    window.localStorage.setItem(MODE_KEY, "nerd");
    mountFresh();
    expect(html.dataset["mode"]).toBe("plain");
  });

  it("takes ?dev out of the address when the switch is used, so the address never contradicts it", () => {
    setUrl("?api=local&dev=1");
    mountFresh();
    toggle().click();
    expect(html.dataset["mode"]).toBe("plain");
    expect(window.location.search).toBe("?api=local");
    mountFresh();
    expect(html.dataset["mode"]).toBe("plain");
  });

  it("starts even when storage cannot be read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    mountFresh();
    expect(html.dataset["mode"]).toBe("plain");
    expect(qa("button").length).toBeGreaterThan(4);
  });
});

describe("a flip does not replay the entrance", () => {
  beforeEach(() => {
    page = mountPlain(root);
    click("demo");
    click("verify");
    click("tamper");
  });

  it("marks the rebuilt verdict, note, list and demo sentence quiet", () => {
    toggle().click();
    expect(q(".verdict").hasAttribute("data-quiet")).toBe(true);
    expect(q(".tamper-note").hasAttribute("data-quiet")).toBe(true);
    expect(q(".timeline-wrap").hasAttribute("data-quiet")).toBe(true);
    expect(q(".demo-badge").hasAttribute("data-quiet")).toBe(true);
    toggle().click();
    expect(q(".verdict").hasAttribute("data-quiet")).toBe(true);
    expect(q(".timeline-wrap").hasAttribute("data-quiet")).toBe(true);
  });

  it("builds the next result without it, so a press animates as before", () => {
    toggle().click();
    click("restore");
    expect(q(".verdict").hasAttribute("data-quiet")).toBe(false);
    expect(q(".timeline-wrap").hasAttribute("data-quiet")).toBe(false);
    click("tamper");
    expect(q(".tamper-note").hasAttribute("data-quiet")).toBe(false);
    click("verify");
    expect(q(".verdict").hasAttribute("data-quiet")).toBe(false);
  });

  it("leaves the demo sentence quiet while it stays on screen (taking the mark off would play it again), and clears it once hidden", () => {
    toggle().click();
    click("restore");
    expect(q(".demo-badge").hasAttribute("hidden")).toBe(false);
    expect(q(".demo-badge").hasAttribute("data-quiet")).toBe(true);
    typeInto("log", "x");
    typeInto("keys", "x");
    typeInto("checkpoint", "x");
    expect(q(".demo-badge").hasAttribute("hidden")).toBe(true);
    expect(q(".demo-badge").hasAttribute("data-quiet")).toBe(false);
    click("demo");
    expect(q(".demo-badge").hasAttribute("hidden")).toBe(false);
    expect(q(".demo-badge").hasAttribute("data-quiet")).toBe(false);
  });

  it("does not mark the page the first time it is built, nor after typing", () => {
    expect(root.querySelector("[data-quiet]")).toBeNull();
    typeInto("log", "x");
    expect(root.querySelector("[data-quiet]")).toBeNull();
  });

  it("marks the empty page quiet too, when a flip rebuilds it", () => {
    root = document.createElement("div");
    document.body.replaceChildren(root);
    mountPlain(root);
    toggle().click();
    expect(q(".verdict--idle").hasAttribute("data-quiet")).toBe(true);
    expect(q(".timeline-slot > *").hasAttribute("data-quiet")).toBe(true);
  });

  it("is switched off in motion.css for the element and everything under it, inside the no-preference block", () => {
    const motion = css("motion.css");
    const start = motion.indexOf("@media (prefers-reduced-motion: no-preference)");
    const block = motion.slice(start, motion.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(start).toBeGreaterThan(-1);
    expect(block).toMatch(/\[data-quiet\]/);
    expect(block).toMatch(/\[data-quiet\]\s*\*/);
    expect(block).toMatch(/\[data-quiet\][^{]*\{[^}]*animation:\s*none\s*!important/);
  });
});

describe("the switch in the style sheets", () => {
  const mode = css("mode.css");

  it("is at least 44px tall and quiet to a tap", () => {
    expect(css("tokens.css")).toContain("--tap: 2.75rem");
    expect(mode).toMatch(/\.modeswitch\s*\{[^}]*min-height:\s*var\(--tap\)/);
    expect(mode).toMatch(/\.modeswitch\s*\{[^}]*touch-action:\s*manipulation/);
    expect(mode).toMatch(/\.modeswitch:active\s*\{[^}]*scale\(0\.97\)/);
  });

  it("has one transition, the 120ms press scale on the switch itself: the thumb is drawn in place and nothing slides", () => {
    const transitions = [...mode.matchAll(/(?<![\w-])transition\s*:\s*([^;}]+)[;}]/g)].map((m) => m[1]?.trim());
    expect(transitions).toEqual(["transform var(--dur-press) var(--ease-out)"]);
    expect(mode).toMatch(/\.modeswitch\[aria-checked="true"\]\s+\.modeswitch__thumb\s*\{[^}]*transform:\s*translateX/);
    expect(mode).not.toMatch(/\.modeswitch__thumb\s*\{[^}]*transition/);
  });

  it("draws hover only for a mouse, and never removes the focus ring", () => {
    const outside = mode.replace(/@media \(hover: hover\) and \(pointer: fine\)\s*\{[\s\S]*?\}\s*\}/g, "");
    expect(outside).not.toContain(":hover");
    expect(mode).not.toMatch(/outline\s*:\s*(none|0)\b/);
    expect(css("verifier.css")).toMatch(/:focus-visible\s*\{\s*outline:\s*3px solid var\(--c-focus\)/);
  });

  it("uses only token colours (the pairs tokens.test.ts checks) and no image, font or url()", () => {
    expect(mode).toMatch(/var\(--c-primary\)/);
    expect(mode).toMatch(/var\(--c-on-primary\)/);
    expect(mode).toMatch(/var\(--c-line-strong\)/);
    expect(mode).not.toMatch(/url\s*\(|@import|@font-face|#[0-9a-fA-F]{3,8}\b/);
  });
});
