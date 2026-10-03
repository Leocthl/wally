// The calm note above an earlier purchase that a repeated ask returned: nothing new was decided, bought or charged.
import type { ReactElement } from "react";
import { UI } from "../../../i18n/ui";
import { Icon } from "../../../ui/icons";
import { useLocale } from "../../../ui/locale";
import { Card } from "../../../ui/Surface";
import type { ResultKind } from "../model/screen";

const R = UI.run;

export function RepeatNote({ kind }: { readonly kind: ResultKind }): ReactElement {
  const { t } = useLocale();
  const text = kind === "approved" ? R.repeatApproved : kind === "needsOk" ? R.repeatAsked : R.repeatStopped;
  return (
    <Card tone="info" padding="md" className="run-repeat" role="status" data-run-repeat>
      <Icon name="info" size={20} />
      <span>{t(text)}</span>
    </Card>
  );
}

/** Above the result when this screen's answer lost a race: someone answered the same question first, somewhere else. */
export function AnsweredElsewhere(): ReactElement {
  const { t } = useLocale();
  return (
    <Card tone="info" padding="md" className="run-repeat" role="status" data-run-answered-elsewhere>
      <Icon name="info" size={20} />
      <span>{t(R.alreadyAnswered)}</span>
    </Card>
  );
}
