// The first run, steps one to three, full screen: Hello, What can Wally buy for you?, Your first budget. (Step four, the quick
// tour, plays on the real Budget screen: CoachTour.) Skip is on every step and never a dead end: it ends setup, and when no
// budget exists yet it seals the booth's ready-made one first, so the live demo is two taps away. What the person entered is
// kept, the step on screen included (the profile is saved as each step is left, and when Skip is pressed on Hello or step two).
// If the ready-made budget cannot be sealed the person stays here with the reason and Skip tries again; if the booth never
// answered they are let into the app, which says so, and the first run is not counted as seen.
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useBoothContext } from "../../hooks/useBooth";
import { mergeProfile } from "../../state/profile";
import type { ShopId } from "../../state/shopping";
import { useProfile } from "../../state/useProfile";
import { applyTheme } from "../../ui/hooks/useColorScheme";
import { useLocale } from "../../ui/locale";
import { readTheme, syncThemeColor } from "../../shell/theme";
import { BudgetStep } from "./BudgetStep";
import { BuyStep } from "./BuyStep";
import { draftFor } from "./budgetModel";
import { ensureBudget } from "./ensureBudget";
import { HelloStep } from "./HelloStep";
import { useOnboarding } from "./OnboardingProvider";
import type { SetupProgress } from "./setupProgress";
import { STEP_ORDER, type SkipControl, type StepId } from "./StepFrame";
import { narrowed, tickedAtStart } from "./ticks";

export interface OnboardingFlowProps {
  /** Try again after the booth could not be reached. */
  readonly onRetry: () => void;
}

/** The page is outside the app shell for now: the language and the look still follow what the person chose. */
function useShellLook(): void {
  const { locale } = useLocale();
  useEffect(() => {
    const before = document.documentElement.lang;
    document.documentElement.lang = locale;
    return () => {
      document.documentElement.lang = before;
    };
  }, [locale]);
  useEffect(() => {
    const choice = readTheme();
    applyTheme(choice);
    syncThemeColor(choice);
  }, []);
}

export default function OnboardingFlow({ onRetry }: OnboardingFlowProps): ReactElement {
  const { finishSetup, abandonSetup, resume, remember } = useOnboarding();
  const booth = useBoothContext();
  const { profile, save } = useProfile();
  useShellLook();

  const now = useMemo(() => new Date(), []);
  // After "Try again" (the booth connection starts over) the flow comes back to where it was, with what was typed.
  const [before] = useState(resume);
  const [step, setStep] = useState<StepId>(before?.step ?? "hello");
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [leaving, setLeaving] = useState(false);
  const [nickname, setNickname] = useState(before?.nickname ?? profile?.nickname ?? "");
  const [ticked, setTicked] = useState<readonly ShopId[]>(before?.ticked ?? tickedAtStart(profile?.shopFor));
  const [budget, setBudget] = useState<SetupProgress["budget"]>(before?.budget ?? null);
  useEffect(() => remember({ step, nickname, ticked, budget }), [remember, step, nickname, ticked, budget]);

  // The budget form starts from what was ticked (all four, or none, is any category), and starts over if that changes after Back.
  const chosen = narrowed(ticked);
  const seed = chosen.join(",");
  const budgetDraft = budget !== null && budget.seed === seed ? budget.draft : draftFor(mergeProfile(null, { shopFor: chosen }), now);

  const go = (to: StepId): void => {
    setDir(STEP_ORDER.indexOf(to) >= STEP_ORDER.indexOf(step) ? "fwd" : "back");
    setStep(to);
  };
  const keep = (): void => void save({ nickname, shopFor: chosen });

  /**
   * Ends setup. With no budget yet the ready-made one is sealed first, so the tour has a real Budget screen to point at; if that
   * fails the person stays (the banner says what happened) and the next press tries again. A booth that never answered cannot be
   * asked: the app shows its own "Can't reach Wally" with Try again.
   */
  const leave = async (): Promise<void> => {
    if (booth.info === null) {
      abandonSetup();
      return;
    }
    setLeaving(true);
    if (await ensureBudget(booth)) finishSetup();
    else setLeaving(false);
  };
  const busy = leaving || (booth.info === null && booth.error === null);
  // Skip seals the ready-made budget only when the booth answered and holds none (a held budget, even one that is over, stays).
  const readyMade = booth.info !== null && booth.state.mandate === null;
  /** What was entered on Hello or on step two is kept when Skip is pressed there. */
  const skipKeeping = (): SkipControl => ({
    onSkip: () => {
      keep();
      void leave();
    },
    busy,
    readyMade,
  });
  const skipPlain: SkipControl = { onSkip: () => void leave(), busy, readyMade };

  if (step === "hello") {
    return (
      <HelloStep
        nickname={nickname}
        onNickname={setNickname}
        onNext={() => {
          keep();
          go("buy");
        }}
        dir={dir}
        skip={skipKeeping()}
      />
    );
  }
  if (step === "buy") {
    return (
      <BuyStep
        ticked={ticked}
        onTicked={setTicked}
        onBack={() => go("hello")}
        onNext={() => {
          keep();
          go("budget");
        }}
        dir={dir}
        skip={skipKeeping()}
      />
    );
  }
  return (
    <BudgetStep
      draft={budgetDraft}
      onDraft={(draft) => setBudget({ seed, draft })}
      onBack={() => go("buy")}
      onDone={() => void leave()}
      onRetry={onRetry}
      dir={dir}
      skip={skipPlain}
    />
  );
}
