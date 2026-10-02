// The two moments (PASS, then Tamper and FAIL) as the page builds them: each row carries its order (--i) and the list
// its step (--step) through the CSSOM, a Verify press rebuilds the verdict (so the entrance replays) and nothing else
// does, and motion.css moves only transform and opacity, with reduced motion switching it all off.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountVerifier, type VerifierPage } from "../src/app";
import { LIMITS } from "../src/limits";
import { MOTION, staggerStep } from "../src/motion";
import { renderTimeline } from "../src/render/timeline";
import { runVerification, type RunResult } from "../src/run";
import { CHECKPOINT, KEYS, LOG } from "./helpers";

const css = (name: string): string => readFileSync(join(import.meta.dirname, "..", "src", "styles", name), "utf8");
const custom = (el: Element | null | undefined, name: string): string => (el as HTMLElement | null | undefined)?.style.getPropertyValue(name) ?? "";

describe("staggerStep: 40 ms between rows, the whole wipe capped at about 600 ms", () => {
  it("is 40 ms for a short list and shrinks for a long one", () => {
    expect(MOTION).toEqual({ staggerMs: 40, wipeMs: 600 });
    expect([staggerStep(0), staggerStep(1), staggerStep(11), staggerStep(15)]).toEqual([40, 40, 40, 40]);
    expect(staggerStep(16)).toBe(37.5);
    expect(staggerStep(400)).toBe(1.5);
  });

  it("never lets the stagger run past the wipe", () => {
    for (const rows of [1, 2, 10, 11, 16, 50, 400, 401, 5000]) {
      const step = staggerStep(rows);
      expect(step).toBeLessThanOrEqual(40);
      expect(step * rows).toBeLessThanOrEqual(600 + 1e-9);
    }
  });
});

describe("rows carry their order through the CSSOM", () => {
  const run = (log: string, checkpoint = CHECKPOINT): RunResult => runVerification({ log, keys: KEYS, checkpoint });

  it("PASS: --i counts the rows from 0, the checkpoint row comes after them, --step is on the list", () => {
    const node = renderTimeline(run(LOG), null);
    const rows = [...node.querySelectorAll(".timeline .row")];
    expect(rows.map((r) => custom(r, "--i"))).toEqual(Array.from({ length: 10 }, (_, i) => String(i)));
    expect(custom(node.querySelector(".row--checkpoint"), "--i")).toBe("10");
    expect(custom(node, "--step")).toBe("40ms");
  });

  it("FAIL: rows before the break, the break, then the rows that were not checked, in that order", () => {
    const tampered = LOG.replace('"approved_limit_minor":25900', '"approved_limit_minor":25901');
    const rows = [...renderTimeline(run(tampered), null).querySelectorAll(".timeline .row")];
    expect(rows.slice(0, 3).map((r) => r.getAttribute("data-status"))).toEqual(["ok", "broken", "unchecked"]);
    expect(rows.slice(0, 3).map((r) => custom(r, "--i"))).toEqual(["0", "1", "2"]);
  });

  it("a window of a long log counts from the first row drawn, with a smaller step", () => {
    const base = run(LOG);
    if (base.kind !== "checked") throw new Error("expected a checked result");
    const many = Array.from({ length: 1000 }, (_, i) => ({ index: i, seq: String(i), kind: "DECISION", ts: "", status: i < 900 ? "ok" : i === 900 ? "broken" : "unchecked" }) as const);
    const node = renderTimeline({ ...base, timeline: { rows: many, checkpoint: "none" } }, null);
    const rows = [...node.querySelectorAll(".timeline .row")];
    expect(rows).toHaveLength(400);
    expect(custom(rows[0], "--i")).toBe("0");
    expect(custom(rows[399], "--i")).toBe("399");
    expect(custom(node, "--step")).toBe("1.5ms");
  });
});

describe("what plays the entrance again", () => {
  let root: HTMLElement;
  let page: VerifierPage;
  const q = <T extends Element>(selector: string): T => {
    const found = root.querySelector<T>(selector);
    if (found === null) throw new Error(`missing ${selector}`);
    return found;
  };
  const click = (action: string): void => q<HTMLButtonElement>(`[data-action="${action}"]`).click();

  beforeEach(() => {
    root = document.createElement("div");
    document.body.replaceChildren(root);
    page = mountVerifier(root);
  });
  afterEach(() => document.body.replaceChildren());

  it("a Verify press builds a new verdict and new rows, even with the same inputs (a re-verify replays it)", () => {
    click("demo");
    click("verify");
    const first = q(".verdict");
    const firstRows = q(".timeline");
    click("verify");
    expect(q(".verdict")).not.toBe(first);
    expect(q(".timeline")).not.toBe(firstRows);
    expect(q(".verdict").getAttribute("data-outcome")).toBe("pass");
  });

  it("Tamper and Restore each build a new verdict; the Tamper note is new each time it appears", () => {
    click("demo");
    click("verify");
    const pass = q(".verdict");
    click("tamper");
    const fail = q(".verdict");
    expect(fail).not.toBe(pass);
    const note = q(".tamper-note");
    click("restore");
    expect(q(".verdict")).not.toBe(fail);
    expect(root.querySelector(".tamper-note")).toBeNull();
    click("tamper");
    expect(q(".tamper-note")).not.toBe(note);
  });

  it("typing, a notice and the language never rebuild the verdict (the empty page and a shown result stay still)", async () => {
    const idle = q(".verdict");
    const ta = q<HTMLTextAreaElement>("#log-text");
    ta.value = "x";
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    expect(q(".verdict")).toBe(idle);
    click("demo");
    click("verify");
    const shown = q(".verdict");
    const big = new File(["x".repeat(LIMITS.smallChars + 1)], "big.json");
    const keys = q<HTMLInputElement>("#keys-file");
    Object.defineProperty(keys, "files", { value: [big], configurable: true });
    keys.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(page.state().notice).not.toBeNull());
    expect(q(".verdict")).toBe(shown);
    q<HTMLButtonElement>('.lang__opt[data-value="zh-HK"]').click();
    expect(q(".verdict")).toBe(shown);
    q<HTMLButtonElement>('.lang__opt[data-value="en"]').click();
    expect(q(".notice").textContent).toContain(LIMITS.smallChars.toLocaleString("en"));
  });
});

/** The text between the braces that open at `open` and their partner. */
function inner(text: string, open: number): string {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    if (text[i] === "}") depth -= 1;
    if (depth === 0) return text.slice(open + 1, i);
  }
  throw new Error("unbalanced braces");
}

describe("motion.css", () => {
  const motion = css("motion.css").replace(/\/\*[\s\S]*?\*\//g, "");

  it("animates only transform and opacity inside its keyframes", () => {
    const frames = [...motion.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)];
    expect(frames.map((m) => m[1])).toEqual(["rise", "pop", "row-in", "row-fade", "row-land"]);
    for (const m of frames) {
      const body = inner(motion, (m.index ?? 0) + m[0].length - 1);
      const props = [...body.matchAll(/([\w-]+)\s*:/g)].map((p) => p[1]);
      expect(props.filter((p) => p !== "opacity" && p !== "transform" && p !== "animation-timing-function"), m[1]).toEqual([]);
    }
  });

  it("starts nothing on the empty page: the idle verdict is excluded from the entrance", () => {
    expect(motion).toContain(".verdict:not(.verdict--idle)");
    expect(motion.replaceAll(":not(.verdict--idle)", "")).not.toContain("verdict--idle");
  });

  it("keeps every animation inside the no-preference media query, and switches all motion off under reduce", () => {
    const at = motion.indexOf("@media (prefers-reduced-motion: no-preference)");
    expect(at).toBeGreaterThan(-1);
    const gated = inner(motion, motion.indexOf("{", at));
    const outside = motion.replace(gated, "");
    expect([...outside.matchAll(/\banimation\s*:/g)].length).toBe(1); // only the reduce rule's `animation: none`
    expect(motion).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*animation:\s*none\s*!important/);
    expect(motion).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*transition:\s*none\s*!important/);
  });

  it("transitions only transform, and only for the 120ms press", () => {
    for (const name of ["motion.css", "verifier.css", "verdict.css", "timeline.css"]) {
      const text = css(name).replace(/\/\*[\s\S]*?\*\//g, "");
      for (const m of text.matchAll(/(?<![\w-])transition\s*:\s*([^;}]+)[;}]/g)) {
        const value = m[1] ?? "";
        if (value.trim() === "none !important") continue; // the reduced-motion switch
        expect(value, `${name}: ${value}`).toMatch(/^transform var\(--dur-press\) var\(--ease-out\)$/);
      }
    }
  });

  it("uses the shared easings and never an ease-in or transition: all", () => {
    for (const name of ["motion.css", "verifier.css", "verdict.css", "timeline.css"]) {
      const text = css(name);
      expect(text, name).not.toMatch(/transition:\s*all\b/);
      expect(text, name).not.toMatch(/\bease-in\b(?!-out)/);
    }
    expect(css("tokens.css")).toMatch(/--ease-out:\s*cubic-bezier\(0\.23, 1, 0\.32, 1\)/);
  });
});
