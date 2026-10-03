// The footer the About sheet and the Proof screen carry: the prototype's "not affiliated" line, and that the shop and the card
// are a practice version (Developer mode: the rail is SIMULATED). The first line comes from strings.ts, the only source file allowed to name the brands (branding test).
import type { ReactElement } from "react";
import { S } from "../i18n/strings";
import { UI } from "../i18n/ui";
import { useIsDeveloper } from "../state/displayMode";
import { useLocale } from "../ui/locale";

export function LegalNote({ replayed = false }: { readonly replayed?: boolean }): ReactElement {
  const { t } = useLocale();
  // The rail is a word for engineers: everyone else is told the shop and the card are a practice version.
  const developer = useIsDeveloper();
  return (
    <footer className="shell-legal">
      {replayed ? <p className="shell-legal__replayed">{t(UI["shell.replayed"])}</p> : null}
      <p>{t(S.footer)}</p>
      <p>{t(UI[developer ? "shell.railNote" : "shell.practiceNote"])}</p>
    </footer>
  );
}
