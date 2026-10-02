// Language: one language at a time with an EN | 繁 toggle (the presenter may still show both). The default follows
// navigator.languages; a choice is remembered on this device. Without a provider everything renders in English.
import { createContext, useCallback, useContext, useMemo, useState, type ReactElement, type ReactNode } from "react";
import type { LabelPair } from "../i18n/label";

export type Locale = "en" | "zh-HK";

const STORAGE_KEY = "wally:lang";

/** zh, zh-HK, zh-Hant-HK, zh-TW map to zh-HK; anything else is English. */
export function detectLocale(languages: readonly string[]): Locale {
  return languages.some((l) => l.toLowerCase().startsWith("zh")) ? "zh-HK" : "en";
}

function stored(): Locale | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "en" || v === "zh-HK" ? v : null;
  } catch {
    return null;
  }
}

function remember(locale: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Private mode or blocked storage: the choice simply lasts for this page.
  }
}

function initialLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const langs = typeof navigator === "undefined" ? [] : navigator.languages?.length ? navigator.languages : [navigator.language ?? "en"];
  return stored() ?? detectLocale(langs);
}

export interface LocaleApi {
  readonly locale: Locale;
  readonly setLocale: (next: Locale) => void;
  /** Picks the string for the current language. */
  readonly t: (text: LabelPair) => string;
}

function pick(locale: Locale): (text: LabelPair) => string {
  return (text) => (locale === "zh-HK" ? text.zh : text.en);
}

const FALLBACK: LocaleApi = { locale: "en", setLocale: () => undefined, t: pick("en") };
const LocaleContext = createContext<LocaleApi>(FALLBACK);

export interface LocaleProviderProps {
  /** Fixed language (style guide previews, tests). Omit to detect and remember. */
  readonly locale?: Locale;
  readonly children: ReactNode;
}

export function LocaleProvider({ locale: fixed, children }: LocaleProviderProps): ReactElement {
  const [chosen, setChosen] = useState<Locale>(() => fixed ?? initialLocale());
  const locale = fixed ?? chosen;
  const setLocale = useCallback((next: Locale) => {
    setChosen(next);
    remember(next);
  }, []);
  const api = useMemo<LocaleApi>(() => ({ locale, setLocale, t: pick(locale) }), [locale, setLocale]);
  return <LocaleContext.Provider value={api}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleApi {
  return useContext(LocaleContext);
}
