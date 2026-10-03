// The personal rows in About: what Wally remembers (shown only when it remembers something), "Take the tour again", and
// "Forget my profile". The profile lives on this device only; forgetting it removes it and leaves the budget and receipts.
import { useRef, useState, type ReactElement } from "react";
import { OB } from "../../i18n/onboarding";
import { UI } from "../../i18n/ui";
import { useProfile } from "../../state/useProfile";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { Dialog } from "../../ui/Overlay";
import { List, ListRow } from "../../ui/Surface";
import { useToast } from "../../ui/Toast";
import { useOnboarding } from "./OnboardingProvider";

export interface AboutPersonalProps {
  /** Closes the About sheet (the tour starts from a full screen). */
  readonly onClose: () => void;
}

export function AboutPersonal({ onClose }: AboutPersonalProps): ReactElement {
  const { t } = useLocale();
  const toast = useToast();
  const { profile, forget } = useProfile();
  const { replay } = useOnboarding();
  const [asking, setAsking] = useState(false);
  const rows = useRef<HTMLDivElement>(null);

  const styles = (profile?.styles ?? []).map((id) => t(OB.taste.style[id])).join(t(UI["home.listJoin"]));
  const summary = [profile?.nickname ?? "", styles].filter((part) => part !== "").join(" · ");

  const confirm = (): void => {
    setAsking(false);
    // A browser that refuses the removal still hides the profile on this page: say that, not that it is gone.
    if (forget()) toast.show({ message: t(OB.about.forgotten), tone: "ok" });
    else toast.show({ message: t(OB.about.forgottenHere), tone: "info" });
    // The row that opened the question is gone: put focus on the first row left, so the sheet still answers the keyboard.
    requestAnimationFrame(() => rows.current?.querySelector<HTMLElement>("button")?.focus());
  };

  return (
    <section className="shell-about__block" aria-labelledby="about-personal">
      <h3 id="about-personal" className="shell-about__heading">{t(OB.about.heading)}</h3>
      <div ref={rows}>
        <List inset label={t(OB.about.heading)}>
          {profile ? <ListRow leading={<Icon name="tag" />} title={t(OB.about.profile)} subtitle={summary === "" ? t(OB.about.stays) : summary} /> : null}
          <ListRow
            leading={<Icon name="refresh" />}
            title={t(OB.about.tourAgain)}
            subtitle={t(OB.about.tourAgainHint)}
            onClick={() => {
              onClose();
              replay();
            }}
            chevron
          />
          {profile ? <ListRow leading={<Icon name="close" />} title={t(OB.about.forget)} subtitle={t(OB.about.stays)} tone="neutral" onClick={() => setAsking(true)} /> : null}
        </List>
      </div>
      <Dialog
        open={asking}
        onClose={() => setAsking(false)}
        role="alertdialog"
        title={t(OB.about.forgetTitle)}
        actions={
          <>
            <Button block onClick={confirm}>{t(OB.about.forgetConfirm)}</Button>
            <Button variant="ghost" block onClick={() => setAsking(false)}>{t(OB.about.keep)}</Button>
          </>
        }
      >
        {t(OB.about.forgetBody)}
      </Dialog>
    </section>
  );
}
