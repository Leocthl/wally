// The footer the About sheet and the Proof screen carry: the prototype's "not affiliated" line, and the rail is
// SIMULATED. The first line comes from strings.ts, the only source file allowed to name the brands (branding test).
import type { ReactElement } from "react";
import { S } from "../i18n/strings";
import { UI } from "../i18n/ui";
import { useLocale } from "../ui/locale";

export function LegalNote({ replayed = false }: { readonly replayed?: boolean }): ReactElement {
  const { t } = useLocale();
  return (
    <footer className="shell-legal">
      {replayed ? <p className="shell-legal__replayed">{t(UI["shell.replayed"])}</p> : null}
      <p>{t(S.footer)}</p>
      <p>{t(UI["shell.railNote"])}</p>
    </footer>
  );
}
