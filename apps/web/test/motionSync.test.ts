// The JS mirrors of the motion tokens stay in sync with tokens.css.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CEREMONY_MS, cssDurationMs, EASE_OUT, HOLD_MS, ROLL_MS, STAGGER_MS } from "../src/design/motion";

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../src/design/tokens.css"), "utf8");

describe("motion mirrors", () => {
  it("match the duration and easing tokens", () => {
    expect(css).toContain(`--dur-hold: ${HOLD_MS}ms`);
    expect(css).toContain(`--dur-roll: ${ROLL_MS}ms`);
    expect(css).toContain(`--dur-stagger: ${STAGGER_MS}ms`);
    expect(css).toContain(`--dur-ceremony: ${CEREMONY_MS}ms`);
    expect(css).toContain(`--ease-out:    ${EASE_OUT}`);
  });
});

describe("cssDurationMs", () => {
  it("is 0 where the page has no tokens (the test DOM), so nothing waits", () => {
    expect(cssDurationMs("--dur-ceremony")).toBe(0);
  });
});
