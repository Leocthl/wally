// Step one, Hello: Wally greets, the person picks a language (EN | 繁) and may say what Wally should call them.
import type { ReactElement } from "react";
import { OB } from "../../i18n/onboarding";
import { UI } from "../../i18n/ui";
import { MAX_NICKNAME } from "../../state/profile";
import { Button } from "../../ui/Button";
import { TextField } from "../../ui/Form";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { LanguageSwitch } from "../../shell/ShellBar";
import { StepFrame, type SkipControl } from "./StepFrame";

export interface HelloStepProps {
  readonly nickname: string;
  readonly onNickname: (value: string) => void;
  readonly onNext: () => void;
  readonly dir: "fwd" | "back";
  readonly skip: SkipControl;
}

const FORM_ID = "onb-hello-form";

export function HelloStep({ nickname, onNickname, onNext, dir, skip }: HelloStepProps): ReactElement {
  const { t } = useLocale();
  return (
    <StepFrame
      step="hello"
      wally="idle"
      big
      title={t(OB.hello.title)}
      dir={dir}
      skip={skip}
      actions={
        <Button type="submit" form={FORM_ID} size="lg" block iconEnd={<Icon name="chevronRight" size={20} />} data-next>
          {t(OB.next)}
        </Button>
      }
    >
      <form
        id={FORM_ID}
        className="onb-body"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          onNext();
        }}
      >
        <p className="onb-lead">{t(OB.hello.lead)}</p>
        <section className="onb-block" aria-labelledby="onb-lang">
          <h2 className="onb-label" id="onb-lang">{t(UI.language)}</h2>
          <LanguageSwitch size="md" />
        </section>
        <TextField
          label={t(OB.hello.nickname)}
          hint={t(OB.hello.nicknameHint)}
          placeholder={t(OB.hello.nicknamePlaceholder)}
          value={nickname}
          maxLength={MAX_NICKNAME}
          autoComplete="nickname"
          autoCapitalize="words"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          onChange={(e) => onNickname(e.target.value)}
        />
        <p className="onb-privacy"><Icon name="lock" size={16} /> {t(OB.privacy)}</p>
      </form>
    </StepFrame>
  );
}
