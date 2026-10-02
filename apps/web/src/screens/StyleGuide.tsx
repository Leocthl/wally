// #/styleguide: the Wally design system on one page. Screens first (what the product will look like), then Wally,
// colour with contrast ratios, type and every primitive. Theme (auto, light, dark), palette (cool, warm) and language
// (EN | 繁) switch the whole page; a phone-width column on every screen size.
import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { S } from "../i18n/strings";
import { UI } from "../i18n/ui";
import { applyTheme, type ThemeChoice } from "../ui/hooks/useColorScheme";
import { LocaleProvider, useLocale, type Locale } from "../ui/locale";
import { Segmented } from "../ui/Nav";
import { ToastProvider } from "../ui/Toast";
import { Wordmark } from "../wally/Wordmark";
import { BudgetHome } from "./styleguide/BudgetHome";
import { ComponentsSection } from "./styleguide/Components";
import { PwaSection } from "./styleguide/PwaSection";
import { Proof } from "./styleguide/Proof";
import { PaletteSection, TypeSection, WallySection } from "./styleguide/Reference";
import { Approved, Stopped } from "./styleguide/Results";
import { Shopping } from "./styleguide/Shopping";
// Last, so page styles follow the primitives they arrange.
import "./styleguide/styleguide.css";

type Palette = "cool" | "warm";

function usePageSettings(): { readonly theme: ThemeChoice; readonly setTheme: (t: ThemeChoice) => void; readonly palette: Palette; readonly setPalette: (p: Palette) => void } {
  const [theme, setTheme] = useState<ThemeChoice>("auto");
  const [palette, setPalette] = useState<Palette>("cool");
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  useEffect(() => {
    const root = document.documentElement;
    if (palette === "warm") root.setAttribute("data-palette", "warm");
    else root.removeAttribute("data-palette");
  }, [palette]);
  useEffect(() => () => {
    applyTheme("auto");
    document.documentElement.removeAttribute("data-palette");
  }, []);
  return { theme, setTheme, palette, setPalette };
}

function Section({ id, title, lead, children }: { readonly id: string; readonly title: string; readonly lead?: string; readonly children: ReactNode }): ReactElement {
  return (
    <section id={id} className="sg-section" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="sg-section__title">{title}</h2>
      {lead ? <p className="sg-section__lead">{lead}</p> : null}
      {children}
    </section>
  );
}

function Controls({ settings }: { readonly settings: ReturnType<typeof usePageSettings> }): ReactElement {
  const { t, locale, setLocale } = useLocale();
  return (
    <div className="sg-controls">
      <Segmented<Locale> label={t(UI.language)} value={locale} onChange={setLocale} options={[{ value: "en", label: "EN", ariaLabel: "English" }, { value: "zh-HK", label: "繁", lang: "zh-HK", ariaLabel: "繁體中文" }]} />
      <Segmented<ThemeChoice> label={t(UI.theme)} value={settings.theme} onChange={settings.setTheme} options={[{ value: "auto", label: t(UI.themeAuto) }, { value: "light", label: t(UI.themeLight) }, { value: "dark", label: t(UI.themeDark) }]} />
      <Segmented<Palette> label="Palette" value={settings.palette} onChange={settings.setPalette} options={[{ value: "cool", label: "Cool" }, { value: "warm", label: "Warm" }]} />
    </div>
  );
}

function Page(): ReactElement {
  const settings = usePageSettings();
  const { locale } = useLocale();
  return (
    <div className="sg" lang={locale}>
      <header className="sg-head">
        <div className="sg-head__brand">
          <Wordmark size="md" />
          <span className="sg-head__kicker" lang="en">Design system · phase A</span>
        </div>
        <Controls settings={settings} />
        <nav className="sg-toc" aria-label="Sections" lang="en">
          {[["screens", "Screens"], ["wally", "Wally"], ["colour", "Colour"], ["type", "Type"], ["components", "Components"], ["pwa", "Install"]].map(([id, name]) => <a key={id} href={`#/styleguide`} onClick={(e) => { e.preventDefault(); document.getElementById(id ?? "")?.scrollIntoView(); }}>{name}</a>)}
        </nav>
      </header>
      <main className="sg-main" id="main">
        <Section id="screens" title="Screens" lead="Static SIMULATED samples built only from the primitives below.">
          <BudgetHome />
          <Shopping />
          <Approved />
          <Stopped />
          <Proof />
        </Section>
        <Section id="wally" title="Wally" lead="Idle blinks, shopping glances, approved sparkles once, stopped raises a shield, offline sleeps. Still under reduced motion.">
          <WallySection />
        </Section>
        <Section id="colour" title="Colour" lead="Red and orange mean stop or error, nothing else. Ratios are WCAG 2 contrast, from tokens.css.">
          <PaletteSection warm={settings.palette === "warm"} />
        </Section>
        <Section id="type" title="Type" lead="System fonts only (offline booth). Rounded figures where the OS has them; tabular numerals for money.">
          <TypeSection />
        </Section>
        <Section id="components" title="Components">
          <ComponentsSection />
        </Section>
        <Section id="pwa" title="Install">
          <PwaSection />
        </Section>
      </main>
      <footer className="sg-footer" lang="en">
        <p>{S.footer.en}</p>
        <p>{UI.simulated.en}</p>
      </footer>
    </div>
  );
}

export default function StyleGuide(): ReactElement {
  return (
    <LocaleProvider>
      <ToastProvider>
        <Page />
      </ToastProvider>
    </LocaleProvider>
  );
}
