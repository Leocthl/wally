// Connection and failure states: the first load (Wally waking up), a load that failed (Retry), a call that failed after
// load (a calm alert under the top bar), and offline in live mode (the phone needs the booth laptop).
import { useSyncExternalStore, type ReactElement } from "react";
import { BRAND } from "../brand";
import { useBoothContext } from "../hooks/useBooth";
import { UI } from "../i18n/ui";
import { Button, IconButton } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Icon } from "../ui/icons";
import { useLocale } from "../ui/locale";

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine !== false, () => true);
}

/** Full-screen state when the first info and snapshot never arrived. */
export function CantReach({ onRetry }: { readonly onRetry: () => void }): ReactElement {
  const { t } = useLocale();
  return (
    <div className="shell-fallback" role="alert">
      <EmptyState
        wally="offline"
        title={t(UI["shell.cantReach"](BRAND.name))}
        body={t(UI["shell.cantReachBody"])}
        action={<Button icon={<Icon name="refresh" size={20} />} onClick={onRetry}>{t(UI["shell.retry"])}</Button>}
      />
    </div>
  );
}

/** Banners under the top bar: offline in live mode, and the last failed call. */
export function ConnectionBanners(): ReactElement | null {
  const { t } = useLocale();
  const { info, error, clearError } = useBoothContext();
  const online = useOnline();
  const offline = !online && info?.kind === "http";
  if (!offline && !error) return null;
  return (
    <div className="shell-banners">
      {offline ? (
        <div className="shell-banner shell-banner--warn" role="status">
          <Icon name="wifiOff" size={20} />
          <span className="shell-banner__text"><strong>{t(UI.offlineTitle)}</strong> {t(UI["shell.offlineHttp"])}</span>
        </div>
      ) : null}
      {error ? (
        <div className="shell-banner shell-banner--stop" role="alert">
          <Icon name="alert" size={20} />
          <span className="shell-banner__text">
            <strong>{t(UI["shell.callFailed"])}</strong> <span className="shell-banner__detail" lang="en" data-ident>{error}</span>
          </span>
          <IconButton label={t(UI.dismiss)} icon={<Icon name="close" size={18} />} onClick={clearError} />
        </div>
      ) : null}
    </div>
  );
}
