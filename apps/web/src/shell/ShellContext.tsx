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
  /** Show Wally a photo: opens the photo sheet on this picture (the sheet's chunk loads on first use). */
  readonly showPhoto: (file: File) => void;
  /** The shopper's own words: opens the same sheet on what a fixed keyword reader finds in them (no model, any host). */
  readonly showShopSearch: (text: string) => void;
}

const ShellContext = createContext<ShellApi | null>(null);

export function useShell(): ShellApi {
  const api = useContext(ShellContext);
  if (!api) throw new Error("useShell needs the app shell");
  return api;
}

/** The shell's actions, or null where a screen or a sheet is mounted without the shell (a test, a storybook): nothing to throw about. */
export function useOptionalShell(): ShellApi | null {
  return useContext(ShellContext);
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

const NOTHING = (): void => undefined;

export interface ShellProviderProps {
  readonly openAsk: () => void;
  readonly openAbout: () => void;
  readonly showPhoto?: (file: File) => void;
  readonly showShopSearch?: (text: string) => void;
  readonly children: ReactNode;
}

export function ShellProvider({ openAsk, openAbout, showPhoto = NOTHING, showShopSearch = NOTHING, children }: ShellProviderProps): ReactElement {
  const booth = useBoothContext();
  const watch = useResetWatch();
  const { reset } = booth;
  const mandateId = booth.state.mandate?.id ?? null;
  const startReset = useCallback(() => {
    watch(mandateId);
    navigate("budget");
    void reset();
  }, [watch, mandateId, reset]);
  const api = useMemo<ShellApi>(() => ({ openAsk, openAbout, startReset, showPhoto, showShopSearch }), [openAsk, openAbout, startReset, showPhoto, showShopSearch]);
  return <ShellContext.Provider value={api}>{children}</ShellContext.Provider>;
}
