// The top bar on every screen: the name (from BRAND) with Wally, a quiet SIMULATED note, EN | 繁, and About.
import type { ReactElement } from "react";
import { BRAND } from "../brand";
import { SIMULATED } from "../domain/provenance";
import { routeHref } from "../hooks/useRoute";
import { UI } from "../i18n/ui";
import { IconButton } from "../ui/Button";
import { ProvenanceChip } from "../ui/Chip";
import { Icon } from "../ui/icons";
import { useLocale, type Locale } from "../ui/locale";
import { Segmented } from "../ui/Nav";
import { Wally } from "../wally/Wally";

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

/** One note per page: the chip says SIMULATED, the hidden sentence says what that means. */
export function SimulatedNote(): ReactElement {
  const { t } = useLocale();
  return (
    <span className="shell-sim" role="note" title={t(UI.simulated)}>
      <span aria-hidden="true"><ProvenanceChip prov={SIMULATED} /></span>
      <span className="sr-only">{t(UI.simulated)}</span>
    </span>
  );
}

export function ShellBar({ onAbout }: { readonly onAbout: () => void }): ReactElement {
  const { t } = useLocale();
  return (
    <header className="shell-bar">
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
