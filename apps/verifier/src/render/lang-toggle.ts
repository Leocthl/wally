// EN | 繁: two radio buttons in one group (the same control as the Wally app's language switch). One tab stop, the
// arrow keys move and choose, Home and End jump. Choosing sets <html data-lang> and lang, and remembers the choice.
import { el } from "../dom";
import { applyLang, currentLang, storeLang, type Lang } from "../lang";

interface Option {
  readonly lang: Lang;
  /** What the button shows. */
  readonly label: string;
  /** What a screen reader says for it. */
  readonly name: string;
}

const OPTIONS: readonly Option[] = [
  { lang: "en", label: "EN", name: "English" },
  { lang: "zh-HK", label: "繁", name: "繁體中文" },
];

/** Index to move to for a key, or null for a key the group ignores. */
export function nextIndex(key: string, index: number, length: number): number | null {
  if (key === "ArrowRight" || key === "ArrowDown") return (index + 1) % length;
  if (key === "ArrowLeft" || key === "ArrowUp") return (index - 1 + length) % length;
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  return null;
}

export function buildLangToggle(): HTMLElement {
  const buttons = OPTIONS.map((option) =>
    el("button", { type: "button", role: "radio", class: "lang__opt", "data-value": option.lang, "aria-label": option.name, lang: option.lang }, [option.label]),
  );
  const paint = (lang: Lang): void => {
    for (const button of buttons) {
      const on = button.dataset["value"] === lang;
      button.setAttribute("aria-checked", String(on));
      button.tabIndex = on ? 0 : -1;
    }
  };
  const choose = (lang: Lang): void => {
    applyLang(lang);
    storeLang(lang);
    paint(lang);
  };
  buttons.forEach((button, index) => {
    button.addEventListener("click", () => choose(OPTIONS[index]?.lang ?? "en"));
    button.addEventListener("keydown", (event) => {
      const next = nextIndex(event.key, index, OPTIONS.length);
      const option = next === null ? undefined : OPTIONS[next];
      if (option === undefined || next === null) return;
      event.preventDefault();
      choose(option.lang);
      buttons[next]?.focus();
    });
  });
  paint(currentLang());
  return el("div", { class: "lang", role: "radiogroup", "aria-label": "Language" }, buttons);
}
