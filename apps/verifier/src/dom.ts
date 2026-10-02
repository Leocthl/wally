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

/** English line, then the zh-HK line marked lang="zh-HK" (docs/04 Fonts, Microcopy). */
export function bi(text: Bi, tag: "span" | "p" | "div" = "span", className = ""): HTMLElement {
  return el(tag, { class: `bi ${className}`.trim() }, [
    el("span", { class: "bi__en" }, [text.en]),
    el("span", { class: "bi__zh", lang: "zh-HK" }, [text.zh]),
  ]);
}

export function mustFind<T extends Element>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (found === null) throw new Error(`verifier page is missing ${selector}`);
  return found;
}
