// Fail closed while drawing: if building the result throws, the page shows NOT VERIFIED, never the verdict that came
// before (a PASS next to a state it was not computed for). In both display modes.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/reasons", () => ({
  reasonText: () => {
    throw new Error("could not word the reason");
  },
}));
vi.mock("../src/plain/reasons", () => ({
  plainReason: () => {
    throw new Error("could not word the plain reason");
  },
}));

const { mountDeveloper, mountPlain, resetMode, langText } = await import("./helpers");

let root: HTMLElement;
const q = <T extends Element>(selector: string): T => {
  const found = root.querySelector<T>(selector);
  if (found === null) throw new Error(`missing ${selector}`);
  return found;
};
const click = (action: string): void => q<HTMLButtonElement>(`[data-action="${action}"]`).click();

beforeEach(() => {
  resetMode();
  root = document.createElement("div");
  document.body.replaceChildren(root);
});
afterEach(() => {
  document.body.replaceChildren();
  resetMode();
});

describe("a drawing error", () => {
  it("replaces a PASS with NOT VERIFIED, clears the Tamper note and the entries, and says why", () => {
    mountDeveloper(root);
    click("demo");
    click("verify");
    expect(q("[data-outcome]").getAttribute("data-outcome")).toBe("pass");
    click("tamper"); // FAIL needs the reason text, which throws
    const verdict = q("[data-outcome]");
    expect(verdict.getAttribute("data-outcome")).toBe("crashed");
    expect(root.querySelector('[data-outcome="pass"]')).toBeNull();
    expect(verdict.textContent).toContain("NOT VERIFIED");
    expect(verdict.textContent).toContain("could not word the reason");
    expect(root.querySelector(".tamper-note")).toBeNull();
    expect(root.querySelectorAll(".timeline .row")).toHaveLength(0);
  });

  it("does the same in plain mode, in plain words only: the error's own message waits in developer mode", () => {
    mountPlain(root);
    click("demo");
    click("verify");
    expect(q("[data-outcome]").getAttribute("data-outcome")).toBe("pass");
    click("tamper"); // the FAIL card words the plain reason, which throws
    const verdict = q("[data-outcome]");
    expect(verdict.getAttribute("data-outcome")).toBe("crashed");
    expect(root.querySelector('[data-outcome="pass"]')).toBeNull();
    expect(langText(q(".verdict__word"), "en")).toBe("NOT VERIFIED");
    expect(langText(q(".verdict__lede"), "en")).toBe("The check could not finish. Treat these receipts as not checked.");
    expect(document.body.textContent).not.toContain("could not word");
    expect(root.querySelector(".tamper-note")).toBeNull();
    expect(root.querySelectorAll(".timeline .row")).toHaveLength(0);
    q<HTMLButtonElement>('[role="switch"]').click(); // the same state, drawn for engineers, has its own message
    expect(q("[data-outcome]").getAttribute("data-outcome")).toBe("crashed");
    expect(q("[data-outcome]").textContent).toContain("could not word the reason");
    expect(q("[data-outcome]").textContent).not.toContain("plain reason");
  });
});
