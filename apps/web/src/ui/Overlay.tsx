// Sheet (bottom sheet with a drag handle) and Dialog (centred). Both: portal to <body>, scrim click and Escape close,
// focus moves in and is trapped, focus returns to the opener, the page behind does not scroll, safe-area aware. Opened by
// a hold that is still pressed, they ignore the release, the click after it and the held key's repeats (usePressGuard).
// Entering is a CSS transition from @starting-style, leaving is the same transition run the other way (--dur-exit, 0 ms
// under reduced motion), then the node unmounts. A dragged sheet leaves or settles from where the finger let go.
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import "../design/ui/overlay.css";
import { UI } from "../i18n/ui";
import { IconButton } from "./Button";
import { cx } from "./cx";
import { useFocusTrap } from "./hooks/useFocusTrap";
import { usePressGuard } from "./hooks/usePressGuard";
import { clearDragStyles, useSheetDrag } from "./hooks/useSheetDrag";
import { Icon } from "./icons";
import { useLocale } from "./locale";

type Phase = "open" | "closing" | "closed";

function exitMs(): number {
  if (typeof window === "undefined" || typeof getComputedStyle !== "function") return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--dur-exit").trim();
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

/** How many modal surfaces hold the page still, and what the page's overflow was before the first of them. */
let locks = 0;
let overflowBefore = "";

/**
 * The page does not scroll under an open sheet. Counted, not nested: when one sheet hands over to another (the Ask sheet
 * closes while the photo sheet opens) the second may take its "before" while the first is still leaving, and a plain
 * save-and-restore would then give back "hidden" for good.
 */
function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return undefined;
    if (locks === 0) overflowBefore = document.body.style.overflow;
    locks += 1;
    document.body.style.overflow = "hidden";
    return () => {
      locks -= 1;
      if (locks === 0) document.body.style.overflow = overflowBefore;
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

export interface SheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly description?: ReactNode;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  /**
   * The description scrolls with the body instead of staying fixed above it, for a sheet with a long description and a footer:
   * at large text the fixed lines would leave the body no room. It keeps its id, so the dialog is still described by it.
   */
  readonly scrollDescription?: boolean;
}

export function Sheet({ open, onClose, title, description, children, footer, scrollDescription = false }: SheetProps): ReactElement | null {
  const panel = useRef<HTMLDivElement>(null);
  const phase = useModal({ open, onClose, panel });
  const drag = useSheetDrag(panel, onClose);
  const guard = usePressGuard(open);
  const id = useId();
  const { t } = useLocale();
  // A drag that closed the sheet left its offset on the panel; the exit transition starts from it, then the styles go.
  useLayoutEffect(() => {
    if (phase === "closing" && panel.current) clearDragStyles(panel.current);
  }, [phase]);
  if (phase === "closed") return null;
  const desc = description ? <p id={`${id}-desc`} className="w-sheet__desc">{description}</p> : null;
  const descInBody = scrollDescription && desc !== null;
  return createPortal(
    <div className="w-overlay w-overlay--sheet" data-phase={phase} {...guard}>
      <div className="w-scrim" onClick={onClose} aria-hidden="true" />
      <div ref={panel} className="w-sheet" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={description ? `${id}-desc` : undefined} tabIndex={-1}>
        {/* The handle and the title row are one drag surface (the close button stays a button). */}
        <div className="w-sheet__top" {...drag} title={t(UI.dragToClose)}>
          <div className="w-sheet__grab" aria-hidden="true">
            <span className="w-sheet__handle" />
          </div>
          <div className="w-sheet__head">
            <h2 id={`${id}-title`} className="w-sheet__title">{title}</h2>
            <IconButton label={t(UI.close)} icon={<Icon name="close" />} onClick={onClose} />
          </div>
        </div>
        {descInBody ? null : desc}
        <div className={cx("w-sheet__body", descInBody && "w-sheet__body--desc")}>
          {descInBody ? desc : null}
          {children}
        </div>
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
  const guard = usePressGuard(open);
  const id = useId();
  if (phase === "closed") return null;
  return createPortal(
    <div className="w-overlay w-overlay--dialog" data-phase={phase} {...guard}>
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
