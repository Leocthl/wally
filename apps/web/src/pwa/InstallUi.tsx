// Install UX. InstallRow (for a Settings or About sheet): "Install" on Chrome and Edge via the saved prompt,
// "Installed" when running standalone, browser-menu advice otherwise. IosInstallHint: a one-time, dismissible card
// with the Share then "Add to Home Screen" steps, only on iOS Safari outside the installed app.
import { useState, useSyncExternalStore, type ReactElement } from "react";
import "../design/ui/pwa.css";
import { UI } from "../i18n/ui";
import { Button, IconButton } from "../ui/Button";
import { Icon } from "../ui/icons";
import { useLocale } from "../ui/locale";
import { Wally } from "../wally/Wally";
import { isStandalone, readPlatform, shouldShowIosHint } from "./platform";
import { getPwa, setPwa, subscribePwa, type PwaState } from "./store";

export const IOS_HINT_KEY = "wally:ios-hint-dismissed";

export function usePwa(): PwaState {
  return useSyncExternalStore(subscribePwa, getPwa, getPwa);
}

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(IOS_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

function saveDismissed(): void {
  try {
    window.localStorage.setItem(IOS_HINT_KEY, "1");
  } catch {
    // Storage blocked: the hint simply returns next visit.
  }
}

export async function promptInstall(state: PwaState): Promise<boolean> {
  const event = state.installEvent;
  if (!event) return false;
  await event.prompt();
  const { outcome } = await event.userChoice;
  setPwa({ installEvent: null, installed: outcome === "accepted" });
  return outcome === "accepted";
}

export function InstallRow(): ReactElement {
  const { t } = useLocale();
  const pwa = usePwa();
  const standalone = isStandalone(readPlatform());
  const status = standalone || pwa.installed ? t(UI.installed) : pwa.installEvent ? t(UI.installBody) : t(UI.installMenu);
  return (
    <div className="w-install">
      <Wally state="idle" size={48} decorative />
      <span className="w-install__text">
        <span className="w-install__title">{t(UI.installTitle)}</span>
        <span className="w-install__body">{status}</span>
      </span>
      {pwa.installEvent && !standalone ? (
        <Button size="sm" icon={<Icon name="download" size={18} />} onClick={() => void promptInstall(pwa)}>{t(UI.installButton)}</Button>
      ) : null}
    </div>
  );
}

export interface IosInstallHintProps {
  /** Show regardless of platform (style guide). */
  readonly force?: boolean;
}

export function IosInstallHint({ force = false }: IosInstallHintProps): ReactElement | null {
  const { t } = useLocale();
  const [visible, setVisible] = useState(() => force || shouldShowIosHint(readPlatform(), readDismissed()));
  if (!visible) return null;
  const dismiss = (): void => {
    saveDismissed();
    setVisible(false);
  };
  return (
    <aside className="w-ios-hint" aria-label={t(UI.iosHintTitle)}>
      <div className="w-ios-hint__head">
        <Wally state="idle" size={40} decorative />
        <strong className="w-ios-hint__title">{t(UI.iosHintTitle)}</strong>
        <IconButton label={t(UI.dismiss)} icon={<Icon name="close" size={20} />} onClick={dismiss} />
      </div>
      <ol className="w-ios-hint__steps">
        <li><span className="w-ios-hint__icon"><Icon name="share" size={20} /></span>{t(UI.iosHintStep1)}</li>
        <li><span className="w-ios-hint__icon"><Icon name="addSquare" size={20} /></span>{t(UI.iosHintStep2)}</li>
      </ol>
    </aside>
  );
}
