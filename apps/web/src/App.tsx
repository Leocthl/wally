// App root: language and toasts for everything, the booth connection, and the shell (src/shell). The ApiClient is
// injected, so the same app runs on the HTTP client, the in-browser engine and the offline mock. #/styleguide renders
// outside the shell. Optional slots for later waves: suggestRules (Seal reads the sentence) and onAsk (Ask sheet field).
import { useCallback, useState, type ReactElement } from "react";
import type { ApiClient } from "./api/types";
import { BoothProvider } from "./hooks/useBooth";
import { StyleGuideRoute, useStyleGuideRoute } from "./screens/StyleGuideRoute";
import type { SuggestRules } from "./screens/seal/sealModel";
import type { AskWally } from "./shell/AskSheet";
import { AppShell } from "./shell/AppShell";
import { ErrorBoundary, ScreenError } from "./shell/ErrorBoundary";
import { LocaleProvider } from "./ui/locale";
import { ToastProvider } from "./ui/Toast";

export interface AppProps {
  readonly api: ApiClient;
  /** Later wave: a model reads the budget sentence into rules. Seal shows "Read my sentence" and never seals by itself. */
  readonly suggestRules?: SuggestRules;
  /** Later wave: a natural-language request from the Ask sheet. */
  readonly onAsk?: AskWally;
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
          <BoothProvider key={generation} api={api}>
            <AppShell onRetry={retry} {...(suggestRules ? { suggestRules } : {})} {...(onAsk ? { onAsk } : {})} />
          </BoothProvider>
        </ErrorBoundary>
      </ToastProvider>
    </LocaleProvider>
  );
}
