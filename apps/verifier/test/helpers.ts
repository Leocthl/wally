// Test helpers: the SIMULATED demo inputs and independent one-byte edits of the JSONL text (no page code used), and
// the ways to mount the page in a given display mode (plain is the page's default, so a test that pins the technical
// wording mounts in developer mode on purpose).
import { mountVerifier, type VerifierPage } from "../src/app";
import { DEMO } from "../src/demo";
import { MODE_KEY, type Mode } from "../src/mode";

export const LOG = DEMO.log;
export const KEYS = DEMO.keys;
export const CHECKPOINT = DEMO.checkpoint;

/** The demo log lines without the final newline. */
export const LINES: readonly string[] = LOG.slice(0, -1).split("\n");

export const keysJson = (): { engine: string[]; delegator: string; agent: string; note: string } => JSON.parse(KEYS);

export function joinLines(lines: readonly string[]): string {
  return `${lines.join("\n")}\n`;
}

/** Header fields sorted before "payload" are found first; the ones after it last (JCS sorts keys). */
const BEFORE_PAYLOAD = new Set(["entry_hash", "kind", "log_id"]);

/** Offset of the first character of a top-level field's value in a canonical line. */
export function valueOffset(line: string, field: string): number {
  const key = `"${field}":`;
  const at = BEFORE_PAYLOAD.has(field) ? line.indexOf(key) : line.lastIndexOf(key);
  if (at < 0) throw new Error(`no ${field} in line`);
  return at + key.length;
}

/** Replace one character of the log text at an absolute offset. */
export function replaceAt(text: string, offset: number, char: string): string {
  if (char.length !== 1 || text[offset] === char) throw new Error("replaceAt must change exactly one character");
  return `${text.slice(0, offset)}${char}${text.slice(offset + 1)}`;
}

export function lineStart(text: string, index: number): number {
  let at = 0;
  for (let i = 0; i < index; i += 1) at = text.indexOf("\n", at) + 1;
  return at;
}

/** A different character of the same class (digit, hex, letter), so the line usually still parses. */
export function sibling(char: string): string {
  if (/[0-9]/.test(char)) return char === "0" ? "1" : "0";
  if (/[a-f]/.test(char)) return char === "a" ? "b" : "a";
  if (/[A-Z]/.test(char)) return char === "A" ? "B" : "A";
  return char === "x" ? "y" : "x";
}

/** Change one character `skip` characters into the value of `field` on line `index`. */
export function flipField(text: string, index: number, field: string, skip = 1): string {
  const start = lineStart(text, index);
  const line = text.slice(start, text.indexOf("\n", start));
  const offset = start + valueOffset(line, field) + skip;
  return replaceAt(text, offset, sibling(text[offset] ?? ""));
}

/**
 * Remembers `mode` the way the switch does, then mounts the page. A test that blocks storage on purpose still mounts
 * (in plain mode, the default), so the helper never throws for it.
 */
export function mountInMode(root: HTMLElement, mode: Mode): VerifierPage {
  try {
    window.localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Storage is blocked by the test itself.
  }
  return mountVerifier(root);
}

export const mountDeveloper = (root: HTMLElement): VerifierPage => mountInMode(root, "developer");
export const mountPlain = (root: HTMLElement): VerifierPage => mountInMode(root, "plain");

/** Forget the remembered mode, the mode on <html> and any `?dev` in the address, for the next test. */
export function resetMode(): void {
  try {
    window.localStorage.removeItem(MODE_KEY);
  } catch {
    // Storage may be blocked by the test.
  }
  document.documentElement.removeAttribute("data-mode");
  window.history.replaceState(null, "", "/");
}

export type Lang = "en" | "zh-HK";

/** The text of one language under `node`: the other language's spans are left out, everything else (details too) stays. */
export function langText(node: Element, lang: Lang): string {
  const clone = node.cloneNode(true) as Element;
  for (const other of clone.querySelectorAll(lang === "en" ? ".bi__zh, .row__zh" : ".bi__en, .row__en")) other.remove();
  return clone.textContent ?? "";
}

/**
 * What a reader sees in one language with every details element closed: the summaries stay, their bodies (the
 * "Show the details" block and the inputs panel) do not. Both are the places where technical words may stay.
 */
export function visibleText(node: Element, lang: Lang): string {
  const clone = node.cloneNode(true) as Element;
  for (const body of clone.querySelectorAll("details > :not(summary)")) body.remove();
  return langText(clone, lang);
}

/** Query helpers bound to a root that a test replaces in beforeEach. */
export function domTools(getRoot: () => HTMLElement): {
  readonly q: <T extends Element = HTMLElement>(selector: string) => T;
  readonly qa: <T extends Element = HTMLElement>(selector: string) => readonly T[];
  readonly click: (action: string) => void;
  readonly typeInto: (field: string, text: string) => void;
} {
  const q = <T extends Element = HTMLElement>(selector: string): T => {
    const found = getRoot().querySelector<T>(selector);
    if (found === null) throw new Error(`missing ${selector}`);
    return found;
  };
  const qa = <T extends Element = HTMLElement>(selector: string): readonly T[] => [...getRoot().querySelectorAll<T>(selector)];
  const click = (action: string): void => q<HTMLButtonElement>(`[data-action="${action}"]`).click();
  const typeInto = (field: string, text: string): void => {
    const area = q<HTMLTextAreaElement>(`#${field}-text`);
    area.value = text;
    area.dispatchEvent(new Event("input", { bubbles: true }));
  };
  return { q, qa, click, typeInto };
}
