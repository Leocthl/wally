// One language at a time (the EN | 繁 toggle) instead of the old two-line pair. Inside <BothLanguages> (presenter only)
// the two languages sit side by side, English first, each run marked with its lang.
import { createContext, useContext, type ReactElement, type ReactNode } from "react";
import type { LabelPair } from "../../i18n/label";
import { cx } from "../../ui/cx";
import { useLocale } from "../../ui/locale";

const Both = createContext(false);

export function BothLanguages({ on = true, children }: { readonly on?: boolean; readonly children: ReactNode }): ReactElement {
  return <Both.Provider value={on}>{children}</Both.Provider>;
}

export function useBoth(): boolean {
  return useContext(Both);
}

type Tag = "span" | "p" | "div" | "strong";

export function Tx({ text, as: Tag = "span", className }: { readonly text: LabelPair; readonly as?: Tag; readonly className?: string }): ReactElement {
  const { t, locale } = useLocale();
  const both = useBoth();
  if (both) {
    return (
      <Tag className={cx("tx-both", className)}>
        <span lang="en" className="tx-both__en">{text.en}</span>
        <span lang="zh-HK" className="tx-both__zh">{text.zh}</span>
      </Tag>
    );
  }
  return <Tag className={className} lang={locale === "zh-HK" ? "zh-HK" : undefined}>{t(text)}</Tag>;
}

/** A sentence with figures inside it, one language (or both, side by side, on the presenter). */
export function Sentence({ en, zh, className }: { readonly en: ReactNode; readonly zh: ReactNode; readonly className?: string }): ReactElement {
  const { locale } = useLocale();
  const both = useBoth();
  if (both) {
    return (
      <p className={cx("ev-sentence tx-both", className)}>
        <span lang="en" className="tx-both__en">{en}</span>
        <span lang="zh-HK" className="tx-both__zh">{zh}</span>
      </p>
    );
  }
  return <p className={cx("ev-sentence", className)} lang={locale === "zh-HK" ? "zh-HK" : undefined}>{locale === "zh-HK" ? zh : en}</p>;
}
