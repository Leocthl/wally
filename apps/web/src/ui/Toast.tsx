// Toast: one short message at a time in a polite live region, above the tab bar and the home indicator. A toast with
// an action stays until it is used or dismissed (no timed-out choices); a plain toast leaves after a few seconds.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import "../design/ui/toast.css";
import { UI } from "../i18n/ui";
import { IconButton } from "./Button";
import { cx } from "./cx";
import { Icon, type IconName } from "./icons";
import { useLocale } from "./locale";

export type ToastTone = "neutral" | "ok" | "stop" | "info";

export interface ToastOptions {
  readonly message: string;
  readonly tone?: ToastTone;
  readonly action?: { readonly label: string; readonly onAction: () => void };
  /** Milliseconds before a plain toast leaves. Ignored when there is an action. */
  readonly duration?: number;
}

export const TOAST_MS = 4500;

const TONE_ICON: Readonly<Record<ToastTone, IconName | null>> = { neutral: null, ok: "checkCircle", stop: "shieldAlert", info: "info" };

export interface ToastViewProps extends ToastOptions {
  readonly onDismiss: () => void;
}

export function ToastView({ message, tone = "neutral", action, onDismiss }: ToastViewProps): ReactElement {
  const { t } = useLocale();
  const icon = TONE_ICON[tone];
  return (
    <div className={cx("w-toast", `w-toast--${tone}`)}>
      {icon ? <Icon name={icon} size={20} className="w-toast__icon" /> : null}
      <span className="w-toast__msg">{message}</span>
      {action ? (
        <button type="button" className="w-toast__action" onClick={() => { action.onAction(); onDismiss(); }}>
          {action.label}
        </button>
      ) : null}
      <IconButton label={t(UI.dismiss)} icon={<Icon name="close" size={18} />} className="w-toast__close" onClick={onDismiss} />
    </div>
  );
}

interface ToastApi {
  readonly show: (options: ToastOptions) => void;
  readonly dismiss: () => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast needs a ToastProvider");
  return api;
}

/** The live region; render once near the root (ToastProvider does it). */
export function ToastRegion({ toast, onDismiss }: { readonly toast: ToastOptions | null; readonly onDismiss: () => void }): ReactElement {
  return (
    <div className="w-toast-region" role="status" aria-live="polite" aria-atomic="true">
      {toast ? <ToastView {...toast} onDismiss={onDismiss} /> : null}
    </div>
  );
}

export function ToastProvider({ children }: { readonly children: ReactNode }): ReactElement {
  const [toast, setToast] = useState<ToastOptions | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismiss = useCallback(() => setToast(null), []);
  const show = useCallback((options: ToastOptions) => setToast({ ...options }), []);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!toast || toast.action) return undefined;
    timer.current = setTimeout(() => setToast(null), toast.duration ?? TOAST_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [toast]);
  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastRegion toast={toast} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}
