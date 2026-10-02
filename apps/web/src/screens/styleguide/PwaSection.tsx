// Style guide: the install surfaces. The iOS hint is forced on here; in the app it shows once on iOS Safari only.
import type { ReactElement } from "react";
import { UI } from "../../i18n/ui";
import { InstallRow, IosInstallHint } from "../../pwa/InstallUi";
import { useLocale } from "../../ui/locale";
import { Card } from "../../ui/Surface";
import { ToastView } from "../../ui/Toast";

export function PwaSection(): ReactElement {
  const { t } = useLocale();
  return (
    <div className="sg-stack">
      <Card><InstallRow /></Card>
      <IosInstallHint force />
      <div className="sg-toast-demo">
        <ToastView message={t(UI.updateReady)} tone="info" action={{ label: t(UI.updateReload), onAction: () => undefined }} onDismiss={() => undefined} />
      </div>
    </div>
  );
}
