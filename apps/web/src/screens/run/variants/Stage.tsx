// The realistic surroundings for a variant: the app's own top bar, main column and tab bar, so a variant is judged at
// full size, on the real page background, next to its real neighbours (never as a thumbnail).
import type { ReactElement, ReactNode } from "react";
import { UI } from "../../../i18n/ui";
import { Icon } from "../../../ui/icons";
import { useLocale } from "../../../ui/locale";
import { BottomTabBar } from "../../../ui/Nav";
import { ShellBar } from "../../../shell/ShellBar";
import "../../../shell/shell.css";

const NOOP = (): void => undefined;

export function Stage({ children, tab = "wally" }: { readonly children: ReactNode; readonly tab?: string }): ReactElement {
  const { t } = useLocale();
  const tabs = [
    { id: "budget", label: t(UI.tabBudget), icon: <Icon name="wallet" />, href: "#/budget" },
    { id: "wally", label: t(UI.tabWally), icon: <Icon name="sparkle" />, href: "#/wally" },
    { id: "receipts", label: t(UI.tabReceipts), icon: <Icon name="receipt" />, href: "#/receipts" },
    { id: "proof", label: t(UI.tabProof), icon: <Icon name="shieldCheck" />, href: "#/proof" },
  ];
  return (
    <div className="shell-app shell-app--tabs" data-chip-scope>
      <ShellBar onAbout={NOOP} />
      <main id="main" className="shell-main">{children}</main>
      <BottomTabBar label={t(UI.mainNav)} items={tabs} current={tab} center={{ label: t(UI["shell.ask"]("Wally")), icon: <Icon name="sparkle" size={26} />, onPress: NOOP }} />
    </div>
  );
}
