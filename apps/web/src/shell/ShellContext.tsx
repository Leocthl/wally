// Shell-wide actions any screen can reach: open the Ask and About sheets, and start the demo over. The reset waits for
// the engine's fresh budget before it says "Started over", so a failed reset never shows a success message.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { useBoothContext } from "../hooks/useBooth";
import { navigate } from "../hooks/useRoute";
import { UI } from "../i18n/ui";
import { useLocale } from "../ui/locale";
import { useToast } from "../ui/Toast";

export interface ShellApi {
  readonly openAsk: () => void;
  readonly openAbout: () => void;
  readonly startReset: () => void;
}

const ShellContext = createContext<ShellApi | null>(null);

export function useShell(): ShellApi {
  const api = useContext(ShellContext);
  if (!api) throw new Error("useShell needs the app shell");
  return api;
}

/** undefined: no reset waiting. Otherwise the mandate id the reset started from. */
function useResetWatch(): (from: string | null) => void {
  const booth = useBoothContext();
  const toast = useToast();
  const { t } = useLocale();
  const [from, setFrom] = useState<string | null | undefined>(undefined);
  const mandateId = booth.state.mandate?.id;
  useEffect(() => {
    if (from === undefined || mandateId === undefined || mandateId === from) return;
    setFrom(undefined);
    toast.show({ message: t(UI["shell.resetDone"]), tone: "ok" });
  }, [from, mandateId, toast, t]);
  useEffect(() => {
    if (from !== undefined && booth.error) setFrom(undefined);
  }, [from, booth.error]);
  return setFrom;
}

export function ShellProvider({ openAsk, openAbout, children }: { readonly openAsk: () => void; readonly openAbout: () => void; readonly children: ReactNode }): ReactElement {
  const booth = useBoothContext();
  const watch = useResetWatch();
  const { reset } = booth;
  const mandateId = booth.state.mandate?.id ?? null;
  const startReset = useCallback(() => {
    watch(mandateId);
    navigate("budget");
    void reset();
  }, [watch, mandateId, reset]);
  const api = useMemo<ShellApi>(() => ({ openAsk, openAbout, startReset }), [openAsk, openAbout, startReset]);
  return <ShellContext.Provider value={api}>{children}</ShellContext.Provider>;
}
