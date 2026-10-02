// Sheet (bottom sheet with a drag handle) and Dialog (centred). Both: portal to <body>, scrim click and Escape close,
// focus moves in and is trapped, focus returns to the opener, the page behind does not scroll, safe-area aware.
// Exit animations last --dur-sheet (0 ms under reduced motion), then the node unmounts.
import { useEffect, useId, useRef, useState, type PointerEvent, type ReactElement, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import "../design/ui/overlay.css";
import { UI } from "../i18n/ui";
import { IconButton } from "./Button";
import { cx } from "./cx";
import { useFocusTrap } from "./hooks/useFocusTrap";
import { Icon } from "./icons";
import { useLocale } from "./locale";

type Phase = "open" | "closing" | "closed";

function exitMs(): number {
  if (typeof window === "undefined" || typeof getComputedStyle !== "function") return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--dur-sheet").trim();
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return 0;
  return raw.endsWith("ms") ? n : n * 1000;
}

/** Keeps the node mounted while it animates out. */
export function usePresence(open: boolean): Phase {
  const [phase, setPhase] = useState<Phase>(open ? "open" : "closed");
  useEffect(() => {
    if (open) {
      setPhase("open");
      return undefined;
    }
    setPhase((p) => (p === "closed" ? "closed" : "closing"));
    const timer = setTimeout(() => setPhase("closed"), exitMs());
    return () => clearTimeout(timer);
  }, [open]);
  return phase;
}

function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}

interface ModalFrameProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly panel: RefObject<HTMLDivElement | null>;
}

function useModal({ open, onClose, panel }: ModalFrameProps): Phase {
  const phase = usePresence(open);
  useFocusTrap(phase === "open", panel, onClose);
  useScrollLock(phase !== "closed");
  return phase;
}

const DRAG_CLOSE_PX = 96;

function useDragToClose(panel: RefObject<HTMLDivElement | null>, onClose: () => void): { readonly onPointerDown: (e: PointerEvent<HTMLDivElement>) => void } {
  const start = useRef<number | null>(null);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    const el = panel.current;
    if (!el) return;
    start.current = e.clientY;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    el.dataset.dragging = "true";
    const move = (ev: globalThis.PointerEvent): void => {
      if (start.current === null) return;
      el.style.transform = `translateY(${Math.max(0, ev.clientY - start.current)}px)`;
    };
    const up = (ev: globalThis.PointerEvent): void => {
      const dy = start.current === null ? 0 : ev.clientY - start.current;
      start.current = null;
      delete el.dataset.dragging;
      el.style.transform = "";
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (dy > DRAG_CLOSE_PX) onClose();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  return { onPointerDown };
}

export interface SheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly description?: ReactNode;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}

export function Sheet({ open, onClose, title, description, children, footer }: SheetProps): ReactElement | null {
  const panel = useRef<HTMLDivElement>(null);
  const phase = useModal({ open, onClose, panel });
  const drag = useDragToClose(panel, onClose);
  const id = useId();
  const { t } = useLocale();
  if (phase === "closed") return null;
  return createPortal(
    <div className="w-overlay w-overlay--sheet" data-phase={phase}>
      <div className="w-scrim" onClick={onClose} aria-hidden="true" />
      <div ref={panel} className="w-sheet" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={description ? `${id}-desc` : undefined} tabIndex={-1}>
        <div className="w-sheet__grab" onPointerDown={drag.onPointerDown} aria-hidden="true" title={t(UI.dragToClose)}>
          <span className="w-sheet__handle" />
        </div>
        <div className="w-sheet__head">
          <h2 id={`${id}-title`} className="w-sheet__title">{title}</h2>
          <IconButton label={t(UI.close)} icon={<Icon name="close" />} onClick={onClose} />
        </div>
        {description ? <p id={`${id}-desc`} className="w-sheet__desc">{description}</p> : null}
        <div className="w-sheet__body">{children}</div>
        {footer ? <div className="w-sheet__footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export interface DialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly children?: ReactNode;
  readonly actions: ReactNode;
  /** alertdialog for confirmations that need an answer. */
  readonly role?: "dialog" | "alertdialog";
  readonly icon?: ReactNode;
}

export function Dialog({ open, onClose, title, children, actions, role = "dialog", icon }: DialogProps): ReactElement | null {
  const panel = useRef<HTMLDivElement>(null);
  const phase = useModal({ open, onClose, panel });
  const id = useId();
  if (phase === "closed") return null;
  return createPortal(
    <div className="w-overlay w-overlay--dialog" data-phase={phase}>
      <div className="w-scrim" onClick={onClose} aria-hidden="true" />
      <div ref={panel} className={cx("w-dialog")} role={role} aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={children ? `${id}-body` : undefined} tabIndex={-1}>
        {icon ? <div className="w-dialog__icon">{icon}</div> : null}
        <h2 id={`${id}-title`} className="w-dialog__title">{title}</h2>
        {children ? <div id={`${id}-body`} className="w-dialog__body">{children}</div> : null}
        <div className="w-dialog__actions">{actions}</div>
      </div>
    </div>,
    document.body,
  );
}
