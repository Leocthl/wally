// The foot of Proof, in both display modes: the demo-key note (only when the client states one), the prototype line and the
// SIMULATED rail line. The plain note says the same thing in everyday words: who signs for you in the demo, and that a
// real version keeps your key on your phone.
import type { ReactElement } from "react";
import { S } from "../../../i18n/strings";
import { UI } from "../../../i18n/ui";
import { useIsDeveloper } from "../../../state/displayMode";
import { Icon } from "../../../ui/icons";
import { useLocale } from "../../../ui/locale";
import { PLAIN } from "../plainStrings";

const P = UI.proof;

/** ApiInfo may carry the server's or the on-device client's demo-key statement (not part of ApiInfo itself). */
export function demoShortcut(info: unknown): boolean {
  return info !== null && typeof info === "object" && typeof (info as { readonly demoShortcut?: unknown }).demoShortcut === "string";
}

export function ProofFooter({ showDemoKey, onDevice, plain = false }: { readonly showDemoKey: boolean; readonly onDevice: boolean; readonly plain?: boolean }): ReactElement {
  const { t } = useLocale();
  const developer = useIsDeveloper();
  const note = plain ? (onDevice ? PLAIN.demoKeyDevice : PLAIN.demoKeyServer) : onDevice ? P.demoKeyDevice : P.demoKeyServer;
  return (
    <footer className="pf-footer">
      {showDemoKey ? <p className="pf-footer__key"><Icon name="lock" size={16} /> {t(note)}</p> : null}
      <p>{t(S.footer)}</p>
      <p>{t(developer ? P.railSimulated : UI["shell.practiceNote"])}</p>
    </footer>
  );
}
