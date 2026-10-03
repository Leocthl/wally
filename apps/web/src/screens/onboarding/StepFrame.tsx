// The frame every first-run step shares: a progress bar and an always-visible Skip on top, Wally with a different face
// per step beside the step's title, the body, and the actions pinned at the bottom under the thumb. Full screen, no sheet.
// The title is the step's h1 and takes focus when the step arrives, so a screen reader hears where it is.
import { useEffect, useRef, type ReactElement, type ReactNode } from "react";
import { OB } from "../../i18n/onboarding";
import { Button } from "../../ui/Button";
import { cx } from "../../ui/cx";
import { useLocale } from "../../ui/locale";
import { Wally, type WallyState } from "../../wally/Wally";
import { ConnectionBanners } from "../../shell/Connection";
import "./onboarding.css";

export type StepId = "hello" | "taste" | "budget";
export const STEP_ORDER: readonly StepId[] = ["hello", "taste", "budget"];
/** Setup is the three steps here; the fourth, the quick tour, plays on the real Budget screen. */
export const TOTAL_STEPS = STEP_ORDER.length + 1;

export interface SkipControl {
  readonly onSkip: () => void;
  /** Leaving is under way (the ready-made budget is being sealed): the button waits. */
  readonly busy: boolean;
}

export interface StepFrameProps {
  readonly step: StepId;
  readonly wally: WallyState;
  /** The hello step shows Wally large, centred. */
  readonly big?: boolean;
  readonly title: string;
  /** Which way the person is moving, so the step arrives from that side. */
  readonly dir: "fwd" | "back";
  readonly skip: SkipControl;
  readonly children: ReactNode;
  readonly actions: ReactNode;
  readonly className?: string;
}

function Progress({ at }: { readonly at: number }): ReactElement {
  const { t } = useLocale();
  return (
    <div
      className="onb-progress"
      role="progressbar"
      aria-label={t(OB.progress)}
      aria-valuemin={1}
      aria-valuemax={TOTAL_STEPS}
      aria-valuenow={at}
      aria-valuetext={t(OB.stepOf(String(at), String(TOTAL_STEPS)))}
    >
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <span key={i} className="onb-progress__seg" data-state={i + 1 < at ? "done" : i + 1 === at ? "now" : "todo"} />
      ))}
    </div>
  );
}

export function StepFrame({ step, wally, big = false, title, dir, skip, children, actions, className }: StepFrameProps): ReactElement {
  const { t, locale } = useLocale();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    heading.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className={cx("onb", className)} lang={locale} data-onboarding data-step={step} data-dir={dir}>
      <header className="onb-top">
        <Progress at={STEP_ORDER.indexOf(step) + 1} />
        <Button variant="ghost" size="sm" className="onb-skip" loading={skip.busy} onClick={skip.onSkip} data-skip>
          {t(OB.skip)}
        </Button>
      </header>
      <ConnectionBanners />
      <main className="onb-main">
        <div className="onb-hero" data-big={big || undefined}>
          <Wally state={wally} size={big ? 112 : 68} decorative className="onb-hero__wally" />
          <h1 ref={heading} tabIndex={-1} className="onb-hero__title">{title}</h1>
        </div>
        {children}
      </main>
      <div className="onb-actions">{actions}</div>
    </div>
  );
}
