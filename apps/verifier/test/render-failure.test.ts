// Fail closed while drawing: if building the result throws, the page shows NOT VERIFIED, never the verdict that came
// before (a PASS next to a state it was not computed for).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/reasons", () => ({
  reasonText: () => {
    throw new Error("could not word the reason");
  },
}));

const { mountVerifier } = await import("../src/app");

let root: HTMLElement;
const q = <T extends Element>(selector: string): T => {
  const found = root.querySelector<T>(selector);
  if (found === null) throw new Error(`missing ${selector}`);
  return found;
};

beforeEach(() => {
  root = document.createElement("div");
  document.body.replaceChildren(root);
  mountVerifier(root);
});
afterEach(() => document.body.replaceChildren());

describe("a drawing error", () => {
  it("replaces a PASS with NOT VERIFIED, clears the Tamper note and the entries, and says why", () => {
    q<HTMLButtonElement>('[data-action="demo"]').click();
    q<HTMLButtonElement>('[data-action="verify"]').click();
    expect(q("[data-outcome]").getAttribute("data-outcome")).toBe("pass");
    q<HTMLButtonElement>('[data-action="tamper"]').click(); // FAIL needs the reason text, which throws
    const verdict = q("[data-outcome]");
    expect(verdict.getAttribute("data-outcome")).toBe("crashed");
    expect(root.querySelector('[data-outcome="pass"]')).toBeNull();
    expect(verdict.textContent).toContain("NOT VERIFIED");
    expect(verdict.textContent).toContain("could not word the reason");
    expect(root.querySelector(".tamper-note")).toBeNull();
    expect(root.querySelectorAll(".timeline .row")).toHaveLength(0);
  });
});
