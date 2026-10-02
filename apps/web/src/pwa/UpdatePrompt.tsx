// "New version ready" toast, mounted in its own small root by register.ts when a new worker is waiting, so it shows
// on any screen without the app shell knowing about it. Reload hands over to the new worker; dismiss keeps the old one.
import { useState, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { UI } from "../i18n/ui";
import { LocaleProvider, useLocale } from "../ui/locale";
import { ToastRegion } from "../ui/Toast";
import { applyUpdate } from "./register";

export const UPDATE_ROOT_ID = "wally-update";

export function UpdatePrompt({ onReload = () => applyUpdate() }: { readonly onReload?: () => void }): ReactElement {
  const { t } = useLocale();
  const [open, setOpen] = useState(true);
  return <ToastRegion toast={open ? { message: t(UI.updateReady), tone: "info", action: { label: t(UI.updateReload), onAction: onReload } } : null} onDismiss={() => setOpen(false)} />;
}

export function mountUpdatePrompt(): void {
  if (document.getElementById(UPDATE_ROOT_ID)) return;
  const host = document.createElement("div");
  host.id = UPDATE_ROOT_ID;
  document.body.append(host);
  createRoot(host).render(
    <LocaleProvider>
      <UpdatePrompt />
    </LocaleProvider>,
  );
}
