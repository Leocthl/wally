// DOM helpers. Text only ever goes in through text nodes (never innerHTML), so pasted log text cannot become markup.
import type { Bi } from "./strings";

type Child = Node | string;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Readonly<Record<string, string>> = {},
  children: readonly Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  node.append(...children);
  return node;
}

/**
 * Both languages are in the DOM, one span each; CSS shows the one that matches <html data-lang> (src/lang.ts,
 * verifier.css), so the page reads one language at a time and a screen reader skips the hidden one (display:none).
 * Use this form when a language needs its own nodes (a code element inside a sentence): each side gets its own copy.
 */
export function biParts(en: readonly Child[], zh: readonly Child[], tag: "span" | "p" | "div" = "span", className = ""): HTMLElement {
  return el(tag, { class: `bi ${className}`.trim() }, [
    el("span", { class: "bi__en", lang: "en" }, en),
    el("span", { class: "bi__zh", lang: "zh-HK" }, zh),
  ]);
}

/** English text, then the zh-HK text marked lang="zh-HK" (docs/04 Fonts, Microcopy). */
export function bi(text: Bi, tag: "span" | "p" | "div" = "span", className = ""): HTMLElement {
  return biParts([text.en], [text.zh], tag, className);
}

export function mustFind<T extends Element>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (found === null) throw new Error(`verifier page is missing ${selector}`);
  return found;
}
