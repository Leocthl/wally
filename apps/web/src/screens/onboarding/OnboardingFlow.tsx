// The first run, steps one to three, full screen: Hello, Your taste, Your first budget. (Step four, the quick tour, plays on
// the real Budget screen: CoachTour.) Skip is on every step and never a dead end: it ends setup, and when no budget exists
// yet it seals the booth's ready-made one first, so the live demo is two taps away. What was entered on earlier steps is
// kept (the profile is saved as each step is left); the step on screen when Skip is pressed is not.
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { m0Request } from "../../booth/compile";
import { useBoothContext } from "../../hooks/useBooth";
import { emptyProfile, mergeProfile, type Profile } from "../../state/profile";
import { useProfile } from "../../state/useProfile";
import { applyTheme } from "../../ui/hooks/useColorScheme";
import { useLocale } from "../../ui/locale";
import { attempt } from "../../shell/actions";
import { readTheme, syncThemeColor } from "../../shell/theme";
import { BudgetStep } from "./BudgetStep";
import { draftFor, type BudgetDraft } from "./budgetModel";
import { HelloStep } from "./HelloStep";
import { useOnboarding } from "./OnboardingProvider";
import { STEP_ORDER, type StepId } from "./StepFrame";
import { TasteStep } from "./TasteStep";

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
  const { finishSetup } = useOnboarding();
  const booth = useBoothContext();
  const { profile, save } = useProfile();
  useShellLook();

  const now = useMemo(() => new Date(), []);
  const [step, setStep] = useState<StepId>("hello");
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [leaving, setLeaving] = useState(false);
  const [nickname, setNickname] = useState(profile?.nickname ?? "");
  const [taste, setTaste] = useState<Profile>(profile ?? emptyProfile());
  const [budget, setBudget] = useState<{ readonly seed: string; readonly draft: BudgetDraft } | null>(null);

  // The budget form starts from what the person shops for, and starts over if that changes after Back.
  const seed = taste.shopFor.join(",");
  const budgetDraft = budget !== null && budget.seed === seed ? budget.draft : draftFor(taste, now);

  const go = (to: StepId): void => {
    setDir(STEP_ORDER.indexOf(to) >= STEP_ORDER.indexOf(step) ? "fwd" : "back");
    setStep(to);
  };
  const keep = (): void => save(mergeProfile(taste, { nickname }));

  /** Ends setup. With no budget yet the ready-made one is sealed first, so the tour has a real Budget screen to point at. */
  const leave = async (): Promise<void> => {
    setLeaving(true);
    if (booth.state.mandate === null && booth.info !== null) await attempt(booth, () => booth.api.seal(m0Request(new Date())));
    finishSetup();
  };
  const skip = { onSkip: () => void leave(), busy: leaving || (booth.info === null && booth.error === null) };

  if (step === "hello") {
    return (
      <HelloStep
        nickname={nickname}
        onNickname={setNickname}
        onNext={() => {
          keep();
          go("taste");
        }}
        dir={dir}
        skip={skip}
      />
    );
  }
  if (step === "taste") {
    return (
      <TasteStep
        taste={taste}
        onTaste={setTaste}
        onBack={() => go("hello")}
        onNext={() => {
          keep();
          go("budget");
        }}
        dir={dir}
        skip={skip}
      />
    );
  }
  return (
    <BudgetStep
      taste={taste}
      draft={budgetDraft}
      onDraft={(draft) => setBudget({ seed, draft })}
      onBack={() => go("taste")}
      onDone={() => void leave()}
      onRetry={onRetry}
      dir={dir}
      skip={skip}
    />
  );
}
