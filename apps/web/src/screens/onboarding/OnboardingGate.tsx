// Puts the first run in front of the app, or steps aside. While a visitor is setting up, the four-step flow replaces the shell
// (it is a lazy chunk, so a returning visitor never loads it); on the quick tour the real shell is there with the coach marks
// over it. If either part throws, the visitor is let into the app: a first run is never a way to get stuck.
import { lazy, Suspense, useEffect, type ReactElement, type ReactNode } from "react";
import { parseHash, navigate } from "../../hooks/useRoute";
import { UI } from "../../i18n/ui";
import { ErrorBoundary } from "../../shell/ErrorBoundary";
import { useLocale } from "../../ui/locale";
import { Skeleton } from "../../ui/Surface";
import { useOnboarding } from "./OnboardingProvider";

const OnboardingFlow = lazy(() => import("./OnboardingFlow"));
const CoachTour = lazy(() => import("./CoachTour"));

/** While the flow's chunk arrives (a moment, from the device or the booth Mac). */
function Opening(): ReactElement {
  const { t } = useLocale();
  return (
    <div className="shell-loading" role="status">
      <span className="sr-only">{t(UI["shell.screenLoading"])}</span>
      <Skeleton width="55%" height="1.75rem" radius="md" />
      <Skeleton lines={3} />
    </div>
  );
}

/** Rendered in place of a part that threw: it ends that part, so the app shows. */
function LetThrough({ end }: { readonly end: () => void }): null {
  useEffect(end, [end]);
  return null;
}

export interface OnboardingGateProps {
  readonly children: ReactNode;
  readonly onRetry: () => void;
}

export function OnboardingGate({ children, onRetry }: OnboardingGateProps): ReactElement {
  const { phase, finishSetup, finishTour } = useOnboarding();

  // The tour points at the Budget screen: take the visitor there (a replay can start from any screen).
  useEffect(() => {
    if (phase === "tour" && parseHash(window.location.hash).route.name !== "budget") navigate("budget");
  }, [phase]);

  if (phase === "setup") {
    return (
      <ErrorBoundary resetKey="setup" fallback={() => <LetThrough end={finishSetup} />}>
        <Suspense fallback={<Opening />}>
          <OnboardingFlow onRetry={onRetry} />
        </Suspense>
      </ErrorBoundary>
    );
  }
  return (
    <>
      {children}
      {phase === "tour" ? (
        <ErrorBoundary resetKey="tour" fallback={() => <LetThrough end={finishTour} />}>
          <Suspense fallback={null}>
            <CoachTour />
          </Suspense>
        </ErrorBoundary>
      ) : null}
    </>
  );
}
