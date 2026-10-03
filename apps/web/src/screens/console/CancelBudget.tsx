// "Cancel this budget": hold to confirm (useHold, the RevokeButton timing: early release cancels, Space or Enter hold
// from the keyboard, steps under reduced motion), then one plain question in a dialog, then api.revoke. The dialog opens
// while the finger, mouse button or key is still down; Dialog ignores that press's release, the click after it and the
// key's repeats (usePressGuard), so letting go never answers the question. Focus opens on "Keep it" (data-autofocus), so a
// fresh Enter or Space cancels nothing: ending the budget takes a deliberate move to the other button.
import { useId, useState, type KeyboardEvent, type ReactElement } from "react";
import { useHold } from "../../hooks/useHold";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { UI } from "../../i18n/ui";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { Dialog } from "../../ui/Overlay";

const HOLD_KEYS = new Set(["Enter", " "]);

function HoldButton({ onHeld, disabled }: { readonly onHeld: () => void; readonly disabled: boolean }): ReactElement {
  const { t } = useLocale();
  const reduced = useReducedMotion();
  const hold = useHold(onHeld, reduced);
  const hintId = useId();
  const blocked = disabled || hold.done;
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>): void => {
    if (!HOLD_KEYS.has(e.key)) return;
    e.preventDefault(); // no click from Space or Enter: only a full hold counts
    if (!e.repeat && !blocked) hold.start();
  };
  return (
    <div className="console-hold">
      <button
        id="console-cancel"
        type="button"
        className="w-btn w-btn--danger w-btn--lg w-btn--block console-hold__button"
        disabled={blocked}
        aria-describedby={hintId}
        data-holding={hold.holding}
        data-motion={reduced ? "reduced" : "full"}
        data-step={hold.step}
        onPointerDown={(e) => {
          if (e.button === 0 && !blocked) hold.start();
        }}
        onPointerUp={hold.cancel}
        onPointerLeave={hold.cancel}
        onPointerCancel={hold.cancel}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => HOLD_KEYS.has(e.key) && hold.cancel()}
        onBlur={hold.cancel}
        onClick={(e) => e.preventDefault()}
      >
        <span className="console-hold__fill" aria-hidden="true" />
        <span className="w-btn__icon console-hold__icon"><Icon name="lock" size={20} /></span>
        <span className="w-btn__label console-hold__label">{t(UI["console.cancelHold"])}</span>
      </button>
      <p id={hintId} className="console-hold__hint">{t(UI["console.cancelHint"])}</p>
    </div>
  );
}

export interface CancelBudgetProps {
  readonly disabled: boolean;
  /** Called after the dialog's confirm. The caller runs api.revoke and says what happened. */
  readonly onConfirm: () => void;
}

export function CancelBudget({ disabled, onConfirm }: CancelBudgetProps): ReactElement {
  const { t } = useLocale();
  const [asking, setAsking] = useState(false);
  // A fresh hold after "Keep it": the hold hook is single-use, so the button remounts.
  const [round, setRound] = useState(0);
  const close = (): void => {
    setAsking(false);
    setRound((n) => n + 1);
    // The old button is gone; give focus to the new one so the keyboard does not land on the page top.
    requestAnimationFrame(() => document.getElementById("console-cancel")?.focus());
  };
  return (
    <>
      <HoldButton key={round} disabled={disabled} onHeld={() => setAsking(true)} />
      <Dialog
        open={asking}
        onClose={close}
        role="alertdialog"
        title={t(UI["console.dialogTitle"])}
        icon={<span className="console-dialog__icon"><Icon name="lock" size={28} /></span>}
        actions={
          <>
            <Button variant="danger" block onClick={() => { setAsking(false); onConfirm(); }}>{t(UI["console.confirm"])}</Button>
            {/* Focus opens here, not on the button that cancels: Enter or Space must not be able to end the budget by accident. */}
            <Button variant="ghost" block onClick={close} data-autofocus>{t(UI["console.keep"])}</Button>
          </>
        }
      >
        {t(UI["console.dialogBody"])}
      </Dialog>
    </>
  );
}
