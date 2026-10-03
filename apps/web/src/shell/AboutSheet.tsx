// About and settings: install, appearance, language, how this demo runs (from api.info()), links for the booth crew,
// start over, and the footer.
import type { ReactElement } from "react";
import type { ApiInfo } from "../api/types";
import { BRAND } from "../brand";
import { ABOUT } from "../i18n/about";
import { MODE } from "../i18n/mode";
import { useBoothContext } from "../hooks/useBooth";
import { routeHref } from "../hooks/useRoute";
import { UI } from "../i18n/ui";
import { InstallRow } from "../pwa/InstallUi";
import { useDisplayMode } from "../state/displayMode";
import { Tag } from "../ui/Chip";
import type { ThemeChoice } from "../ui/hooks/useColorScheme";
import { Icon } from "../ui/icons";
import { Switch } from "../ui/Form";
import { useLocale } from "../ui/locale";
import { Segmented } from "../ui/Nav";
import { Sheet } from "../ui/Overlay";
import { List, ListRow } from "../ui/Surface";
import { AboutPersonal } from "../screens/onboarding/AboutPersonal";
import { BoothConnect } from "./BoothConnect";
import { LegalNote } from "./LegalNote";
import { PhoneQr } from "./PhoneQr";
import { ResetDemo } from "./ResetDemo";
import { LanguageSwitch } from "./ShellBar";

function modeText(kind: string, t: ReturnType<typeof useLocale>["t"]): string {
  if (kind === "http") return t(UI["shell.modeHttp"]);
  if (kind === "local") return t(UI["shell.modeLocal"]);
  if (kind === "mock") return t(UI["shell.modeMock"]);
  return kind;
}

/** The provider named in plain words; a name the app does not know shows as the booth wrote it. */
function providerText(table: Readonly<Record<string, { readonly en: string; readonly zh: string }>>, provider: string, t: ReturnType<typeof useLocale>["t"]): string {
  const known = table[provider];
  return known ? t(known) : provider;
}

function ModeInfo({ info, developer }: { readonly info: ApiInfo; readonly developer: boolean }): ReactElement {
  const { t } = useLocale();
  return (
    <>
      <List inset label={t(UI["shell.modeTitle"])}>
        <ListRow leading={<Icon name="settings" />} title={t(UI["shell.modeLabel"])} subtitle={modeText(info.kind, t)} trailing={<Tag size="sm" tone={info.replayed ? "neutral" : "ok"}>{t(UI[info.replayed ? "shell.replayedShort" : "shell.liveShort"])}</Tag>} />
        <ListRow leading={<Icon name="sparkle" />} title={t(UI["shell.planner"])} subtitle={providerText(ABOUT.planner, info.planner.provider, t)} />
        <ListRow leading={<Icon name="eye" />} title={t(UI["shell.judge"])} subtitle={providerText(ABOUT.judge, info.judge.provider, t)} />
      </List>
      {/* On-device mode keeps the session in this browser (src/api/local/persist); said only while it is true. */}
      {info.remembers === true ? <p className="shell-about__remember">{t(ABOUT.remembers)}</p> : null}
      {/* The server's notes are English text from api.info(), long and technical (provider names, ports): developer mode only,
          one level down, kept lang="en" in the 繁 view. */}
      {developer ? (
        <details className="shell-about__notes">
          <summary>{t(ABOUT.notes)}</summary>
          <p className="shell-about__notes-lead">{t(ABOUT.notesLead)}</p>
          <dl lang="en" className="shell-about__notes-list" data-ident>
            <dt>{t(UI["shell.planner"])}</dt>
            <dd><span data-ident>{info.planner.provider}</span> · {info.planner.note}</dd>
            <dt>{t(UI["shell.judge"])}</dt>
            <dd><span data-ident>{info.judge.provider}</span> · {info.judge.note}</dd>
          </dl>
        </details>
      ) : null}
    </>
  );
}

export interface AboutSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly theme: ThemeChoice;
  readonly onTheme: (next: ThemeChoice) => void;
}

export function AboutSheet({ open, onClose, theme, onTheme }: AboutSheetProps): ReactElement {
  const { t } = useLocale();
  const { info } = useBoothContext();
  const [mode, setMode] = useDisplayMode();
  return (
    <Sheet open={open} onClose={onClose} title={t(UI["shell.aboutTitle"](BRAND.name))}>
      <div className="shell-about">
        <InstallRow />
        <div className="shell-about__settings">
          <div className="shell-about__setting">
            <span className="shell-about__label" id="about-theme">{t(UI.theme)}</span>
            <Segmented<ThemeChoice> label={t(UI.theme)} value={theme} onChange={onTheme} size="md" options={[{ value: "auto", label: t(UI.themeAuto) }, { value: "light", label: t(UI.themeLight) }, { value: "dark", label: t(UI.themeDark) }]} />
          </div>
          <div className="shell-about__setting">
            <span className="shell-about__label">{t(UI.language)}</span>
            <LanguageSwitch size="md" />
          </div>
          <Switch checked={mode === "developer"} onChange={(on) => setMode(on ? "developer" : "plain")} label={t(MODE.switchLabel)} description={t(MODE.switchHint)} />
        </div>
        <AboutPersonal onClose={onClose} />
        {info ? (
          <section className="shell-about__block" aria-labelledby="about-mode">
            <h3 id="about-mode" className="shell-about__heading">{t(UI["shell.modeTitle"])}</h3>
            <ModeInfo info={info} developer={mode === "developer"} />
          </section>
        ) : null}
        <PhoneQr />
        <BoothConnect />
        <section className="shell-about__block" aria-labelledby="about-more">
          <h3 id="about-more" className="shell-about__heading">{t(UI["shell.more"])}</h3>
          <List inset label={t(UI["shell.more"])}>
            <ListRow href={routeHref("evidence")} leading={<Icon name="shieldCheck" />} title={t(UI["shell.whyTrust"](BRAND.name))} chevron />
            <ListRow href={routeHref("presenter")} leading={<Icon name="list" />} title={t(UI["shell.presenter"])} chevron />
            <ListRow href={routeHref("styleguide")} leading={<Icon name="sparkle" />} title={t(UI["shell.styleguide"])} chevron />
          </List>
        </section>
        <ResetDemo variant="secondary" onStart={onClose} />
        <LegalNote replayed={info?.replayed ?? false} />
      </div>
    </Sheet>
  );
}
