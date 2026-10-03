// Puts the first run in front of the app, or steps aside. While a visitor is setting up, the four-step flow replaces the shell
// (it is a lazy chunk, so a returning visitor never loads it); on the quick tour the real shell is there with the coach marks
// over it. If either part throws, the visitor is let into the app (and the first run is not counted as seen, so it comes
// back next time): a first run is never a way to get stuck.
import { lazy, Suspense, useEffect, useRef, type ReactElement, type ReactNode } from "react";
import { useBoothContext } from "../../hooks/useBooth";
import { navigate, useRoute } from "../../hooks/useRoute";
import { UI } from "../../i18n/ui";
import { ErrorBoundary } from "../../shell/ErrorBoundary";
import { useLocale } from "../../ui/locale";
import { Skeleton } from "../../ui/Surface";
import { ensureBudget } from "./ensureBudget";
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

/** Rendered in place of the tour after it threw: it ends the tour, so the app shows. */
function LetThrough({ end }: { readonly end: () => void }): null {
  useEffect(end, [end]);
  return null;
}

/**
 * Rendered in place of setup after it threw (or its chunk never arrived). Setup is abandoned, not finished: the first run is not
 * counted as seen. The booth's ready-made budget is sealed first, as Skip does, so the app opens on a Budget that has one.
 */
function LeaveSetup(): ReactElement {
  const booth = useBoothContext();
  const { abandonSetup } = useOnboarding();
  const latest = useRef(booth);
  latest.current = booth;
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      // A booth that never answered cannot be asked; the app says so and offers Try again.
      if (latest.current.info !== null) await ensureBudget(latest.current);
      abandonSetup();
    })();
  }, [abandonSetup]);
  return <Opening />;
}

export interface OnboardingGateProps {
  readonly children: ReactNode;
  readonly onRetry: () => void;
}

export function OnboardingGate({ children, onRetry }: OnboardingGateProps): ReactElement {
  const { phase, finishTour } = useOnboarding();
  const route = useRoute();
  const onBudget = route.name === "budget";
  // The marks point at the real Budget screen, which is a skeleton until the budget has arrived (a live booth tells the page
  // about a new seal a moment after the call returns): the tour starts when there is something to point at.
  const { state } = useBoothContext();
  const budgetShown = state.mandate !== null && state.packet !== null;

  // The tour points at the Budget screen: take the visitor there (a replay can start from any screen), show it once they are
  // there, and end it if they leave (the back button, a link): it does not start again on the way back.
  const toured = useRef(false);
  useEffect(() => {
    if (phase !== "tour") {
      toured.current = false;
      return;
    }
    if (onBudget) toured.current = true;
    else if (toured.current) finishTour();
    else navigate("budget");
  }, [phase, onBudget, finishTour]);

  if (phase === "setup") {
    return (
      <ErrorBoundary resetKey="setup" fallback={() => <LeaveSetup />}>
        <Suspense fallback={<Opening />}>
          <OnboardingFlow onRetry={onRetry} />
        </Suspense>
      </ErrorBoundary>
    );
  }
  return (
    <>
      {children}
      {phase === "tour" && onBudget && budgetShown ? (
        <ErrorBoundary resetKey="tour" fallback={() => <LetThrough end={finishTour} />}>
          <Suspense fallback={null}>
            <CoachTour />
          </Suspense>
        </ErrorBoundary>
      ) : null}
    </>
  );
}
