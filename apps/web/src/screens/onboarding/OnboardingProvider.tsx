// The first run as app state: not started, setting up (the four-step flow, full screen), or on the quick tour (coach marks
// over the real Budget screen). It sits above the booth so the booth can hold back its ready-made budget while a new
// visitor sets up their own (App passes autoSeal={phase !== "setup"}). Whether it shows at all is one stored flag.
import { createContext, useCallback, useContext, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { parseHash } from "../../hooks/useRoute";
import { profileStore, type ProfileStore } from "../../state/profile";
import { boothFlag } from "../home/demoMode";

export type OnboardingPhase = "off" | "setup" | "tour";

export interface OnboardingApi {
  readonly phase: OnboardingPhase;
  /** Setup is over, finished or skipped: the flag is set and the quick tour starts. */
  readonly finishSetup: () => void;
  /** The tour is over, finished or skipped. */
  readonly finishTour: () => void;
  /** About, "Take the tour again": the whole flow once more. */
  readonly replay: () => void;
}

const nothing = (): void => undefined;
/** Without a provider (a screen in a test on its own) there is no first run. */
const OFF: OnboardingApi = { phase: "off", finishSetup: nothing, finishTour: nothing, replay: nothing };
const OnboardingContext = createContext<OnboardingApi>(OFF);

export function useOnboarding(): OnboardingApi {
  return useContext(OnboardingContext);
}

/** The first run opens on Budget, the landing screen. A link straight to a receipt, the presenter or a decision is left alone. */
export function opensOnLanding(hash: string): boolean {
  const { route } = parseHash(hash);
  return route.name === "budget" && Object.keys(route.params).length === 0;
}

/** No flag, the landing screen, and not a ?booth=1 link (that is the crew setting up the stage, who need no first run). */
export function firstRunPending(store: ProfileStore, hash: string, search = ""): boolean {
  return !store.onboarded() && opensOnLanding(hash) && !boothFlag(search, hash);
}

export interface OnboardingProviderProps {
  readonly children: ReactNode;
  readonly store?: ProfileStore;
}

export function OnboardingProvider({ children, store = profileStore }: OnboardingProviderProps): ReactElement {
  // Decided once, when the page opens: a visitor who lands on Budget with no flag is in their first run.
  const [phase, setPhase] = useState<OnboardingPhase>(() => (typeof window !== "undefined" && firstRunPending(store, window.location.hash, window.location.search) ? "setup" : "off"));
  const finishSetup = useCallback(() => {
    store.markOnboarded();
    setPhase("tour");
  }, [store]);
  const finishTour = useCallback(() => setPhase("off"), []);
  const replay = useCallback(() => setPhase("setup"), []);
  const api = useMemo<OnboardingApi>(() => ({ phase, finishSetup, finishTour, replay }), [phase, finishSetup, finishTour, replay]);
  return <OnboardingContext.Provider value={api}>{children}</OnboardingContext.Provider>;
}
