// The top bar on every screen: the name (from BRAND) with Wally, a quiet SIMULATED note, EN | 繁, and About.
import { useEffect, useId, useState, type ReactElement } from "react";
import { BRAND } from "../brand";
import { SIMULATED } from "../domain/provenance";
import { routeHref } from "../hooks/useRoute";
import { UI } from "../i18n/ui";
import { useIsDeveloper } from "../state/displayMode";
import { IconButton } from "../ui/Button";
import { ProvenanceChip } from "../ui/Chip";
import { Icon } from "../ui/icons";
import { useLocale, type Locale } from "../ui/locale";
import { Segmented } from "../ui/Nav";
import { Wally } from "../wally/Wally";
import "./simulatedTip.css";

export function LanguageSwitch({ size = "sm" }: { readonly size?: "sm" | "md" }): ReactElement {
  const { t, locale, setLocale } = useLocale();
  return (
    <Segmented<Locale>
      label={t(UI.language)}
      value={locale}
      onChange={setLocale}
      size={size}
      className="shell-lang"
      options={[
        { value: "en", label: "EN", ariaLabel: "English" },
        { value: "zh-HK", label: "繁", lang: "zh-HK", ariaLabel: "繁體中文" },
      ]}
    />
  );
}

/**
 * One note per page: the chip says SIMULATED, the hidden sentence says what that means. The chip is a button too: a tap says it
 * in everyday words ("The shop and the card are a safe practice version. No real money moves."), and Developer mode keeps the
 * engineers' sentence about the rail. Escape, a tap anywhere else or moving to another screen puts it away.
 */
export function SimulatedNote(): ReactElement {
  const { t } = useLocale();
  const developer = useIsDeveloper();
  const [open, setOpen] = useState(false);
  const tip = useId();
  useEffect(() => {
    if (!open) return undefined;
    const close = (): void => setOpen(false);
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") close();
    };
    const onPointer = (e: PointerEvent): void => {
      if (!(e.target instanceof Element) || e.target.closest("[data-sim-root]") === null) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("hashchange", close);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("hashchange", close);
    };
  }, [open]);
  return (
    <span className="shell-sim" role="note" title={t(UI.simulated)} data-sim-root>
      <button type="button" className="shell-sim__button" aria-expanded={open} aria-controls={tip} aria-label={t(UI["shell.simulatedAsk"])} onClick={() => setOpen((o) => !o)} data-sim-button>
        <span aria-hidden="true"><ProvenanceChip prov={SIMULATED} /></span>
      </button>
      <span className="sr-only">{t(UI.simulated)}</span>
      {open ? <span id={tip} className="shell-sim__tip" role="status" data-sim-tip>{t(UI[developer ? "shell.railNote" : "shell.practiceNote"])}</span> : null}
    </span>
  );
}

export function ShellBar({ onAbout }: { readonly onAbout: () => void }): ReactElement {
  const { t } = useLocale();
  return (
    // The bar is the app-wide chip row (chip-scope__chips): its SIMULATED note covers every SIMULATED figure on every
    // screen (test/helpers/figures.ts), so a screen adds a chip only where a surface needs its own (budget card, card).
    <header className="shell-bar chip-scope__chips">
      <div className="shell-bar__inner">
        <a className="shell-brand" href={routeHref("budget")} aria-label={t(UI["shell.homeLink"](BRAND.name))}>
          <Wally state="idle" size={30} decorative />
          <span className="shell-brand__name" aria-hidden="true">{BRAND.name}</span>
        </a>
        <SimulatedNote />
        <LanguageSwitch />
        <IconButton label={t(UI["shell.about"])} icon={<Icon name="info" />} onClick={onAbout} className="shell-bar__about" />
      </div>
    </header>
  );
}
