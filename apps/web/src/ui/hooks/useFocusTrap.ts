// Focus management for modal surfaces (Sheet, Dialog): focus moves inside on open (to the control marked `data-autofocus`
// when there is one, else the first), Tab and Shift+Tab wrap, Escape calls onEscape, and focus returns to the element that opened it.
import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/** Inside a disclosure that is closed: the browser does not render it, so Tab cannot land there (the summary itself is reachable). */
const inClosedDisclosure = (el: HTMLElement, root: HTMLElement): boolean => {
  for (let node = el.parentElement; node !== null && node !== root; node = node.parentElement) {
    if (node instanceof HTMLDetailsElement && !node.open && !(node.querySelector(":scope > summary")?.contains(el) ?? false)) return true;
  }
  return false;
};

/**
 * What Tab can reach inside `root`, in order: not disabled, not hidden from assistive technology, not skipped by a negative
 * tabindex (the cards and chips of a roving group keep one tab stop), and not inside a closed disclosure.
 */
export function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.hasAttribute("inert") && el.getAttribute("aria-hidden") !== "true" && el.tabIndex >= 0 && !inClosedDisclosure(el, root),
  );
}

/**
 * Where focus lands when a surface opens: the control marked `data-autofocus` if Tab can reach it (a question whose first
 * button cannot be undone marks its safe answer, so Enter or Space on opening never does the irreversible thing), else the
 * first control. Tab order and the wrap are not affected.
 */
export function initialFocus(root: HTMLElement): HTMLElement | undefined {
  const stops = focusables(root);
  return stops.find((el) => el.hasAttribute("data-autofocus")) ?? stops[0];
}

export function useFocusTrap(active: boolean, root: RefObject<HTMLElement | null>, onEscape: () => void): void {
  const escape = useRef(onEscape);
  escape.current = onEscape;
  useEffect(() => {
    const el = root.current;
    if (!active || !el) return undefined;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (initialFocus(el) ?? el).focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.stopPropagation();
        escape.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables(el);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const head = items[0];
      const tail = items[items.length - 1];
      if (e.shiftKey && document.activeElement === head) {
        e.preventDefault();
        tail?.focus();
      } else if (!e.shiftKey && document.activeElement === tail) {
        e.preventDefault();
        head?.focus();
      }
    };
    el.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("keydown", onKey);
      // Give focus back to the opener, unless focus has already moved on to something else (the next sheet in a hand-over).
      const now = document.activeElement;
      const adrift = now === null || now === document.body || el.contains(now);
      if (adrift && opener && document.contains(opener)) opener.focus();
    };
  }, [active, root]);
}
