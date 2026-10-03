// App root: language and toasts for everything, the first run (src/screens/onboarding), the booth connection, and the shell
// (src/shell). The ApiClient is injected, so the same app runs on the HTTP client, the in-browser engine and the offline mock.
// #/styleguide renders outside the shell. The Ask field and the Seal sentence reader use the client's own ask and compileRules;
// suggestRules and onAsk replace them (tests, other hosts). A new visitor's first run holds back the booth's ready-made budget
// while they set up their own (autoSeal), and seals it itself if they skip.
import { useCallback, useState, type ReactElement } from "react";
import type { ApiClient } from "./api/types";
import { BoothProvider } from "./hooks/useBooth";
import { StyleGuideRoute, useStyleGuideRoute } from "./screens/StyleGuideRoute";
import type { SuggestRules } from "./screens/seal/sealModel";
import type { AskWally } from "./shell/AskSheet";
import { OnboardingGate } from "./screens/onboarding/OnboardingGate";
import { OnboardingProvider, useOnboarding } from "./screens/onboarding/OnboardingProvider";
import { AppShell } from "./shell/AppShell";
import { ErrorBoundary, ScreenError } from "./shell/ErrorBoundary";
import { LocaleProvider } from "./ui/locale";
import { ToastProvider } from "./ui/Toast";

export interface AppProps {
  readonly api: ApiClient;
  /** Another reader for the budget sentence than api.compileRules. Seal shows "Read my sentence" and never seals by itself. */
  readonly suggestRules?: SuggestRules;
  /** Another asker than api.ask for the Ask sheet's natural-language field. */
  readonly onAsk?: AskWally;
}

interface BoothAndShellProps extends AppProps {
  readonly onRetry: () => void;
}

/** The booth and what stands on it. Under a new key (Retry) the whole booth connection starts again; the first run stays where it was. */
function BoothAndShell({ api, onRetry, suggestRules, onAsk }: BoothAndShellProps): ReactElement {
  const { phase } = useOnboarding();
  return (
    <BoothProvider api={api} autoSeal={phase !== "setup"}>
      <OnboardingGate onRetry={onRetry}>
        <AppShell onRetry={onRetry} {...(suggestRules ? { suggestRules } : {})} {...(onAsk ? { onAsk } : {})} />
      </OnboardingGate>
    </BoothProvider>
  );
}

export function App({ api, suggestRules, onAsk }: AppProps): ReactElement {
  const styleGuide = useStyleGuideRoute();
  // Retry after a failed first load: a new provider asks the client for info and a snapshot again.
  const [generation, setGeneration] = useState(0);
  const retry = useCallback(() => setGeneration((n) => n + 1), []);
  if (styleGuide) return <StyleGuideRoute />;
  return (
    <LocaleProvider>
      <ToastProvider>
        <ErrorBoundary resetKey={String(generation)} fallback={() => <ScreenError onRetry={retry} />}>
          <OnboardingProvider>
            <BoothAndShell key={generation} api={api} onRetry={retry} {...(suggestRules ? { suggestRules } : {})} {...(onAsk ? { onAsk } : {})} />
          </OnboardingProvider>
        </ErrorBoundary>
      </ToastProvider>
    </LocaleProvider>
  );
}
