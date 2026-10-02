// Language: one at a time, EN | 繁. The page holds both texts in the DOM and CSS shows the one that matches
// <html data-lang> (verifier.css), so switching never rebuilds anything and a running animation is not replayed.
// Same rules as the Wally app (apps/web/src/ui/locale.tsx): the default follows navigator.languages (zh* gives
// zh-HK, anything else en), and a choice is remembered under the key the app uses. Every storage access is guarded:
// private mode or blocked storage must never break the page, the choice then lasts until it is closed.
export type Lang = "en" | "zh-HK";

export const LANG_KEY = "wally:lang";

function asLang(value: unknown): Lang | null {
  return value === "en" || value === "zh-HK" ? value : null;
}

/** zh, zh-HK, zh-Hant-HK and zh-TW give zh-HK; anything else is English. */
export function detectLang(languages: readonly string[]): Lang {
  return languages.some((language) => language.toLowerCase().startsWith("zh")) ? "zh-HK" : "en";
}

export function readStoredLang(): Lang | null {
  try {
    return asLang(window.localStorage.getItem(LANG_KEY));
  } catch {
    return null;
  }
}

export function storeLang(lang: Lang): void {
  try {
    window.localStorage.setItem(LANG_KEY, lang);
  } catch {
    // Blocked or full storage: the choice simply lasts for this page.
  }
}

function browserLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  if (navigator.languages !== undefined && navigator.languages.length > 0) return navigator.languages;
  return navigator.language === "" ? [] : [navigator.language];
}

/** A remembered choice wins; otherwise the browser's languages decide. */
export function initialLang(): Lang {
  return readStoredLang() ?? detectLang(browserLanguages());
}

/** Switches the page: data-lang drives the CSS, lang tells browsers and screen readers the language of the page. */
export function applyLang(lang: Lang, root: HTMLElement = document.documentElement): void {
  root.dataset["lang"] = lang;
  root.setAttribute("lang", lang);
}

export function currentLang(root: HTMLElement = document.documentElement): Lang {
  return asLang(root.dataset["lang"]) ?? "en";
}
