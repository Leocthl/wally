// "Start the demo over": a confirm, then reset (a fresh preset budget, no cards, no receipts). In the About sheet and at
// the foot of Try asking, so the booth crew can reset between judges (docs/06 "Reset after every judge").
import { useState, type ReactElement } from "react";
import { useBoothContext } from "../hooks/useBooth";
import { UI } from "../i18n/ui";
import { Button } from "../ui/Button";
import { Icon } from "../ui/icons";
import { useLocale } from "../ui/locale";
import { Dialog } from "../ui/Overlay";
import { useShell } from "./ShellContext";

export function ResetDemo({ variant = "ghost", onStart }: { readonly variant?: "ghost" | "secondary"; readonly onStart?: () => void }): ReactElement {
  const { t } = useLocale();
  const { busy } = useBoothContext();
  const { startReset } = useShell();
  const [asking, setAsking] = useState(false);
  const confirm = (): void => {
    setAsking(false);
    onStart?.();
    startReset();
  };
  return (
    <>
      <Button variant={variant} block icon={<Icon name="refresh" size={20} />} disabled={busy} onClick={() => setAsking(true)}>
        {t(UI["shell.reset"])}
      </Button>
      <Dialog
        open={asking}
        onClose={() => setAsking(false)}
        role="alertdialog"
        title={t(UI["shell.reset"])}
        actions={
          <>
            <Button block onClick={confirm}>{t(UI["shell.resetConfirm"])}</Button>
            <Button variant="ghost" block onClick={() => setAsking(false)}>{t(UI["shell.notNow"])}</Button>
          </>
        }
      >
        {t(UI["shell.resetBody"])}
      </Dialog>
    </>
  );
}
