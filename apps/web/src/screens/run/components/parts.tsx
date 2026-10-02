// Shared pieces of the result states: the footnote that says fixed rules decided, not the AI.
import type { ReactElement } from "react";
import { UI } from "../../../i18n/ui";
import { Icon } from "../../../ui/icons";
import { useLocale } from "../../../ui/locale";

export function Footnote(): ReactElement {
  const { t } = useLocale();
  return (
    <p className="run-foot">
      <Icon name="shieldCheck" size={18} /> <span>{t(UI.run.rulesDecided)}</span>
    </p>
  );
}
