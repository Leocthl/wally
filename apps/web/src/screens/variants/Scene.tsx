// The harness around a variant: the on-device booth (the real stack, so every state is the real one), a strip of
// scene buttons above the phone, and the phone itself. Dev-only: nothing outside this folder imports it.
import { useMemo, type ReactElement, type ReactNode } from "react";
import { LocalApiClient } from "../../api/local/LocalApiClient";
import type { ScenarioId } from "../../api/types";
import { BoothProvider, useBoothContext } from "../../hooks/useBooth";
import { applyTheme, type ThemeChoice } from "../../ui/hooks/useColorScheme";
import { LocaleProvider, useLocale, type Locale } from "../../ui/locale";
import { Segmented } from "../../ui/Nav";
import { ToastProvider } from "../../ui/Toast";
import { useState } from "react";
import "../../shell/shell.css";
import "../home/home.css";
import "./variants.css";

export interface SceneButton {
  readonly label: string;
  readonly run: () => void;
}

export function useScene(): { readonly packetReady: boolean; readonly play: (id: ScenarioId) => void; readonly reset: () => void; readonly busy: boolean } {
  const { state, runScenario, reset, busy } = useBoothContext();
  return { packetReady: state.packet !== null && state.mandate !== null, play: (id) => void runScenario(id), reset: () => void reset(), busy };
}

function chromeOff(): boolean {
  return /[?&]chrome=0\b/.test(window.location.hash);
}

/** The strip above a variant: scene buttons, language and theme. `?chrome=0` hides it for clean screenshots. */
export function SceneBar({ buttons, busy = false }: { readonly buttons: readonly SceneButton[]; readonly busy?: boolean }): ReactElement | null {
  const { locale, setLocale } = useLocale();
  const [theme, setTheme] = useState<ThemeChoice>("auto");
  if (chromeOff()) return null;
  const set = (next: ThemeChoice): void => {
    setTheme(next);
    applyTheme(next);
  };
  return (
    <div className="vr-scene">
      <div className="vr-scene__buttons" role="group" aria-label="Scene">
        {buttons.map((b) => (
          <button key={b.label} type="button" className="vr-scene__btn" disabled={busy} onClick={b.run}>{b.label}</button>
        ))}
      </div>
      <div className="vr-scene__settings">
        <Segmented<Locale> label="Language" value={locale} onChange={setLocale} options={[{ value: "en", label: "EN" }, { value: "zh-HK", label: "繁", lang: "zh-HK" }]} />
        <Segmented<ThemeChoice> label="Theme" value={theme} onChange={set} options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
      </div>
    </div>
  );
}

function BoothControls({ extra }: { readonly extra?: readonly SceneButton[] }): ReactElement | null {
  const { play, reset, busy } = useScene();
  const base: readonly SceneButton[] = [
    { label: "Fresh", run: reset },
    { label: "Buy tee", run: () => play("normal") },
    { label: "Needs OK", run: () => play("unverified") },
    { label: "Cancel", run: () => play("revoke") },
  ];
  return <SceneBar buttons={[...base, ...(extra ?? [])]} busy={busy} />;
}

/** Language and toasts around a variant that needs no booth (the seal ceremony runs on a stand-in for the call). */
export function PlainScene({ buttons, children }: { readonly buttons: readonly SceneButton[]; readonly children: ReactNode }): ReactElement {
  return (
    <LocaleProvider>
      <ToastProvider>
        <SceneBar buttons={buttons} />
        {children}
      </ToastProvider>
    </LocaleProvider>
  );
}

export function BoothScene({ children, extra }: { readonly children: ReactNode; readonly extra?: readonly SceneButton[] }): ReactElement {
  const api = useMemo(() => new LocalApiClient(), []);
  return (
    <LocaleProvider>
      <ToastProvider>
        <BoothProvider api={api}>
          <BoothControls {...(extra ? { extra } : {})} />
          {children}
        </BoothProvider>
      </ToastProvider>
    </LocaleProvider>
  );
}
